-- ATLAST OVERSIGHT OF KEY GROUP RULES, 2026-11-26.
--
-- The Atlast admin (profiles.is_system_admin, the platform owner) enters a
-- group's key rules and locks them. Once locked, nobody -- not the Group
-- Admin, not the Atlast admin -- can change them directly. A change goes:
--   1. the Group Admin proposes new values with a reason;
--   2. the Atlast admin opens an ordinary vote, open to every active member;
--   3. once at least a third of the membership (rounded up) has voted yes,
--      the Atlast admin can approve (the new values apply at once); the
--      Atlast admin can reject at any point.
-- Every step is in the audit log; members are notified when a change is
-- proposed and when it is decided.
--
-- Key rules: contribution amount and frequency, share value, loan interest,
-- weekly late penalty, Jamii amount.

alter table groups add column if not exists rules_locked_at timestamptz;
alter table groups add column if not exists rules_locked_by uuid references profiles(id);

-- The guard: locked rule columns change only inside an approved change
-- (apply_group_rule_change sets atlast.rule_change for its transaction).
create or replace function trg_guard_locked_rules() returns trigger
language plpgsql as $$
begin
  if old.rules_locked_at is not null
     and coalesce(current_setting('atlast.rule_change', true), '') <> 'on'
     and (new.contribution_amount is distinct from old.contribution_amount
       or new.contribution_frequency is distinct from old.contribution_frequency
       or new.share_value is distinct from old.share_value
       or new.loan_interest_rate is distinct from old.loan_interest_rate
       or new.late_penalty_weekly_rate is distinct from old.late_penalty_weekly_rate
       or new.jamii_contribution_amount is distinct from old.jamii_contribution_amount
       or new.rules_locked_at is distinct from old.rules_locked_at
       or new.rules_locked_by is distinct from old.rules_locked_by) then
    raise exception 'These rules are locked by Atlast. Propose a change instead: it needs a yes vote from at least a third of members and Atlast approval.';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_locked_rules on groups;
create trigger guard_locked_rules before update on groups
  for each row execute function trg_guard_locked_rules();

create or replace function atlast_admin_check(p_user_id uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce((select is_system_admin from profiles where id = p_user_id), false) then
    raise exception 'Only the Atlast admin can do this.';
  end if;
end;
$$;
revoke all on function atlast_admin_check(uuid) from public, anon, authenticated;
grant execute on function atlast_admin_check(uuid) to service_role;

create or replace function atlast_admin_check_for_group(p_user_id uuid, p_group_id uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  perform atlast_admin_check(p_user_id);
  if exists (select 1 from memberships where group_id = p_group_id and user_id = p_user_id
             and role = 'group_admin' and status = 'active') then
    raise exception 'The Group Admin of this group cannot also act as Atlast for it.';
  end if;
end;
$$;
revoke all on function atlast_admin_check_for_group(uuid, uuid) from public, anon, authenticated;
grant execute on function atlast_admin_check_for_group(uuid, uuid) to service_role;

create or replace function group_rules_snapshot(g groups) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'contribution_amount', g.contribution_amount,
    'contribution_frequency', g.contribution_frequency,
    'share_value', g.share_value,
    'loan_interest_rate', g.loan_interest_rate,
    'late_penalty_weekly_rate', g.late_penalty_weekly_rate,
    'jamii_contribution_amount', g.jamii_contribution_amount)
$$;

create or replace function check_group_rules(p jsonb) returns void
language plpgsql immutable as $$
begin
  if (p->>'contribution_amount')::numeric is null or (p->>'contribution_amount')::numeric <= 0 then
    raise exception 'The contribution amount must be more than zero.'; end if;
  if coalesce(p->>'contribution_frequency', '') not in ('weekly', 'monthly') then
    raise exception 'Choose weekly or monthly contributions.'; end if;
  if (p->>'share_value')::numeric is null or (p->>'share_value')::numeric <= 0 then
    raise exception 'The share value must be more than zero.'; end if;
  if (p->>'loan_interest_rate')::numeric is null or (p->>'loan_interest_rate')::numeric not between 0 and 100 then
    raise exception 'Interest must be between 0%% and 100%%.'; end if;
  if (p->>'late_penalty_weekly_rate')::numeric is null or (p->>'late_penalty_weekly_rate')::numeric not between 0 and 20 then
    raise exception 'The weekly penalty must be between 0%% and 20%%.'; end if;
  if (p->>'jamii_contribution_amount')::numeric is null or (p->>'jamii_contribution_amount')::numeric < 0 then
    raise exception 'The Jamii amount must be zero or more.'; end if;
end;
$$;

-- Atlast admin: enter the rules (only while unlocked) and lock them.
create or replace function atlast_set_group_rules(p_group_id uuid, p_actor_id uuid, p_rules jsonb, p_lock boolean)
returns groups
language plpgsql security definer set search_path = public as $$
declare
  v_old groups;
  v_new groups;
begin
  perform atlast_admin_check_for_group(p_actor_id, p_group_id);
  select * into v_old from groups where id = p_group_id for update;
  if v_old is null then raise exception 'Group not found.'; end if;
  if v_old.rules_locked_at is not null then raise exception 'These rules are locked by Atlast. Propose a change instead: it needs a yes vote from at least a third of members and Atlast approval.'; end if;
  perform check_group_rules(p_rules);

  update groups set
    contribution_amount = (p_rules->>'contribution_amount')::numeric,
    contribution_frequency = p_rules->>'contribution_frequency',
    share_value = (p_rules->>'share_value')::numeric,
    loan_interest_rate = (p_rules->>'loan_interest_rate')::numeric,
    late_penalty_weekly_rate = (p_rules->>'late_penalty_weekly_rate')::numeric,
    jamii_contribution_amount = (p_rules->>'jamii_contribution_amount')::numeric,
    rules_locked_at = case when p_lock then now() end,
    rules_locked_by = case when p_lock then p_actor_id end
  where id = p_group_id returning * into v_new;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_group_id, p_actor_id, case when p_lock then 'group.rules_locked' else 'group.rules_entered' end,
          'group', p_group_id, jsonb_build_object('before', group_rules_snapshot(v_old), 'after', group_rules_snapshot(v_new)));
  if p_lock then
    begin
      perform notify_group_members(p_group_id, 'group.rules_locked', p_group_id, jsonb_build_object('group', v_new.name));
    exception when others then raise warning 'notification (rules locked %) failed: %', p_group_id, sqlerrm; end;
  end if;
  return v_new;
end;
$$;
revoke all on function atlast_set_group_rules(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function atlast_set_group_rules(uuid, uuid, jsonb, boolean) to service_role;

-- Change requests and the member vote on them.
create table if not exists group_rule_changes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  proposed_by uuid not null references profiles(id),
  current_rules jsonb not null,
  proposed_rules jsonb not null,
  reason text not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'voting', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  approvals_needed integer,           -- set when the vote opens: a third of active members, rounded up
  vote_opened_by uuid references profiles(id),
  vote_opened_at timestamptz,
  vote_closes_at timestamptz,
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text
);
create unique index if not exists group_rule_changes_one_open
  on group_rule_changes (group_id) where status in ('proposed', 'voting');

create table if not exists group_rule_change_votes (
  change_id uuid not null references group_rule_changes(id) on delete cascade,
  member_id uuid not null references profiles(id),
  choice text not null check (choice in ('approve', 'decline')),
  voted_at timestamptz not null default now(),
  primary key (change_id, member_id)
);

alter table group_rule_changes enable row level security;
alter table group_rule_change_votes enable row level security;
drop policy if exists group_rule_changes_select on group_rule_changes;
create policy group_rule_changes_select on group_rule_changes for select
  using (is_active_member(group_id) or is_system_admin());
-- A secret ballot, like membership votes: each member sees only their own vote.
drop policy if exists group_rule_change_votes_select on group_rule_change_votes;
create policy group_rule_change_votes_select on group_rule_change_votes for select
  using (member_id = auth.uid());
revoke all on group_rule_changes, group_rule_change_votes from anon;
grant select on group_rule_changes, group_rule_change_votes to authenticated;

-- Running totals for everyone in the group (counts only, never names).
create or replace view group_rule_change_tallies with (security_invoker = false) as
  select c.id as change_id,
         count(v.*) filter (where v.choice = 'approve')::int as approve_count,
         count(v.*) filter (where v.choice = 'decline')::int as decline_count
  from group_rule_changes c left join group_rule_change_votes v on v.change_id = c.id
  where is_active_member(c.group_id) or is_system_admin()
  group by c.id;
revoke all on group_rule_change_tallies from anon;
grant select on group_rule_change_tallies to authenticated;

create or replace function notify_atlast_admins(p_group_id uuid, p_kind text, p_entity_id uuid, p_params jsonb)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, group_id, kind, entity_id, params)
  select p.id, p_group_id, p_kind, p_entity_id, p_params from profiles p where p.is_system_admin
$$;
revoke all on function notify_atlast_admins(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function notify_atlast_admins(uuid, text, uuid, jsonb) to service_role;

-- 1. Group Admin proposes.
create or replace function propose_group_rule_change(p_group_id uuid, p_admin_id uuid, p_rules jsonb, p_reason text)
returns group_rule_changes
language plpgsql security definer set search_path = public as $$
declare
  v_group groups;
  v_merged jsonb;
  v_row group_rule_changes;
begin
  if not exists (select 1 from memberships where group_id = p_group_id and user_id = p_admin_id
                 and role = 'group_admin' and status = 'active') then
    raise exception 'Only a Group Admin can propose a rule change.';
  end if;
  select * into v_group from groups where id = p_group_id;
  if v_group.rules_locked_at is null then
    raise exception 'These rules are not locked; there is nothing to propose.';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Explain the reason for the change (at least 10 characters).';
  end if;
  v_merged := group_rules_snapshot(jsonb_populate_record(v_group, p_rules));
  perform check_group_rules(v_merged);
  if v_merged = group_rules_snapshot(v_group) then raise exception 'Nothing would change.'; end if;
  if exists (select 1 from group_rule_changes where group_id = p_group_id and status in ('proposed', 'voting')) then
    raise exception 'A rule change is already in progress for this group.';
  end if;

  insert into group_rule_changes (group_id, proposed_by, current_rules, proposed_rules, reason)
  values (p_group_id, p_admin_id, group_rules_snapshot(v_group), v_merged, btrim(p_reason))
  returning * into v_row;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason, metadata)
  values (p_group_id, p_admin_id, 'rule_change.proposed', 'group_rule_change', v_row.id, v_row.reason,
          jsonb_build_object('from', v_row.current_rules, 'to', v_row.proposed_rules));
  begin
    perform notify_atlast_admins(p_group_id, 'rule_change.proposed', v_row.id,
      jsonb_build_object('group', v_group.name, 'reason', v_row.reason));
  exception when others then raise warning 'notification (rule change %) failed: %', v_row.id, sqlerrm; end;
  return v_row;
end;
$$;
revoke all on function propose_group_rule_change(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function propose_group_rule_change(uuid, uuid, jsonb, text) to service_role;

-- 2. Atlast admin opens the member vote (7 days by default).
create or replace function open_group_rule_vote(p_change_id uuid, p_actor_id uuid, p_days integer)
returns group_rule_changes
language plpgsql security definer set search_path = public as $$
declare
  v_row group_rule_changes;
  v_active integer;
begin
  select * into v_row from group_rule_changes where id = p_change_id for update;
  if v_row is null then raise exception 'Rule change not found.'; end if;
  perform atlast_admin_check_for_group(p_actor_id, v_row.group_id);
  if v_row.status <> 'proposed' then raise exception 'The vote has already been opened or the change is closed.'; end if;
  if coalesce(p_days, 7) not between 1 and 30 then raise exception 'A vote runs for 1 to 30 days.'; end if;

  select count(*) into v_active from memberships where group_id = v_row.group_id and status = 'active';
  update group_rule_changes set status = 'voting', approvals_needed = greatest(1, ceil(v_active / 3.0)::int),
         vote_opened_by = p_actor_id, vote_opened_at = now(), vote_closes_at = now() + make_interval(days => coalesce(p_days, 7))
  where id = p_change_id returning * into v_row;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_row.group_id, p_actor_id, 'rule_change.vote_opened', 'group_rule_change', v_row.id,
          jsonb_build_object('approvals_needed', v_row.approvals_needed, 'closes_at', v_row.vote_closes_at));
  begin
    perform notify_group_members(v_row.group_id, 'rule_change.vote_opened', v_row.id,
      jsonb_build_object('reason', v_row.reason, 'needed', v_row.approvals_needed));
  exception when others then raise warning 'notification (rule vote %) failed: %', v_row.id, sqlerrm; end;
  return v_row;
end;
$$;
revoke all on function open_group_rule_vote(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function open_group_rule_vote(uuid, uuid, integer) to service_role;

-- 3. Every active member may vote once.
create or replace function cast_group_rule_vote(p_change_id uuid, p_member_id uuid, p_choice text)
returns group_rule_change_votes
language plpgsql security definer set search_path = public as $$
declare
  v_row group_rule_changes;
  v_vote group_rule_change_votes;
  v_yes integer;
begin
  select * into v_row from group_rule_changes where id = p_change_id for update;
  if v_row is null then raise exception 'Rule change not found.'; end if;
  if not exists (select 1 from memberships where group_id = v_row.group_id and user_id = p_member_id and status = 'active') then
    raise exception 'Only active members can vote.';
  end if;
  if v_row.status <> 'voting' then raise exception 'This vote is not open.'; end if;
  if now() > v_row.vote_closes_at then raise exception 'This vote has closed.'; end if;
  if p_choice not in ('approve', 'decline') then raise exception 'Invalid vote.'; end if;
  if exists (select 1 from group_rule_change_votes where change_id = p_change_id and member_id = p_member_id) then
    raise exception 'You have already voted.';
  end if;

  insert into group_rule_change_votes (change_id, member_id, choice) values (p_change_id, p_member_id, p_choice)
  returning * into v_vote;
  -- The ballot is secret: the audit log records that a vote was cast, not which way.
  insert into audit_events (group_id, actor_id, action, entity_type, entity_id)
  values (v_row.group_id, p_member_id, 'rule_change.voted', 'group_rule_change', v_row.id);

  select count(*) into v_yes from group_rule_change_votes where change_id = p_change_id and choice = 'approve';
  if p_choice = 'approve' and v_yes = v_row.approvals_needed then
    begin
      perform notify_atlast_admins(v_row.group_id, 'rule_change.support_reached', v_row.id,
        jsonb_build_object('group', (select name from groups where id = v_row.group_id)));
    exception when others then raise warning 'notification (rule vote %) failed: %', v_row.id, sqlerrm; end;
  end if;
  return v_vote;
end;
$$;
revoke all on function cast_group_rule_vote(uuid, uuid, text) from public, anon, authenticated;
grant execute on function cast_group_rule_vote(uuid, uuid, text) to service_role;

-- 4. Atlast admin approves (needs a third of the membership voting yes) or rejects.
create or replace function decide_group_rule_change(p_change_id uuid, p_actor_id uuid, p_decision text, p_note text)
returns group_rule_changes
language plpgsql security definer set search_path = public as $$
declare
  v_row group_rule_changes;
  v_group groups;
  v_yes integer;
  r jsonb;
begin
  select * into v_row from group_rule_changes where id = p_change_id for update;
  if v_row is null then raise exception 'Rule change not found.'; end if;
  perform atlast_admin_check_for_group(p_actor_id, v_row.group_id);
  if v_row.status not in ('proposed', 'voting') then raise exception 'This change is already closed.'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Invalid decision.'; end if;
  if p_decision = 'reject' and char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Say why you are rejecting it.';
  end if;
  select count(*) into v_yes from group_rule_change_votes where change_id = p_change_id and choice = 'approve';
  if p_decision = 'approve' and (v_row.status <> 'voting' or v_yes < v_row.approvals_needed) then
    raise exception 'At least a third of members must vote yes before this can be approved (% of % so far).',
      v_yes, coalesce(v_row.approvals_needed, 0);
  end if;

  if p_decision = 'approve' then
    r := v_row.proposed_rules;
    perform set_config('atlast.rule_change', 'on', true);
    update groups set
      contribution_amount = (r->>'contribution_amount')::numeric,
      contribution_frequency = r->>'contribution_frequency',
      share_value = (r->>'share_value')::numeric,
      loan_interest_rate = (r->>'loan_interest_rate')::numeric,
      late_penalty_weekly_rate = (r->>'late_penalty_weekly_rate')::numeric,
      jamii_contribution_amount = (r->>'jamii_contribution_amount')::numeric
    where id = v_row.group_id;
    perform set_config('atlast.rule_change', 'off', true);
  end if;

  update group_rule_changes
  set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      decided_by = p_actor_id, decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_change_id returning * into v_row;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason, metadata)
  values (v_row.group_id, p_actor_id, case when p_decision = 'approve' then 'rule_change.approved' else 'rule_change.rejected' end,
          'group_rule_change', v_row.id, v_row.decision_note,
          jsonb_build_object('from', v_row.current_rules, 'to', v_row.proposed_rules, 'yes_votes', v_yes));
  select * into v_group from groups where id = v_row.group_id;
  begin
    perform notify_group_members(v_row.group_id,
      case when p_decision = 'approve' then 'rule_change.approved' else 'rule_change.rejected' end,
      v_row.id, jsonb_build_object('group', v_group.name, 'reason', v_row.decision_note));
  exception when others then raise warning 'notification (rule change %) failed: %', v_row.id, sqlerrm; end;
  return v_row;
end;
$$;
revoke all on function decide_group_rule_change(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function decide_group_rule_change(uuid, uuid, text, text) to service_role;

-- The Group Admin may withdraw a proposal before the vote opens.
create or replace function cancel_group_rule_change(p_change_id uuid, p_admin_id uuid)
returns group_rule_changes
language plpgsql security definer set search_path = public as $$
declare
  v_row group_rule_changes;
begin
  select * into v_row from group_rule_changes where id = p_change_id for update;
  if v_row is null then raise exception 'Rule change not found.'; end if;
  if not exists (select 1 from memberships where group_id = v_row.group_id and user_id = p_admin_id
                 and role = 'group_admin' and status = 'active') then
    raise exception 'Only a Group Admin can withdraw a proposal.';
  end if;
  if v_row.status <> 'proposed' then raise exception 'Once the vote is open only Atlast can close it.'; end if;
  update group_rule_changes set status = 'cancelled', decided_by = p_admin_id, decided_at = now()
  where id = p_change_id returning * into v_row;
  insert into audit_events (group_id, actor_id, action, entity_type, entity_id)
  values (v_row.group_id, p_admin_id, 'rule_change.cancelled', 'group_rule_change', v_row.id);
  return v_row;
end;
$$;
revoke all on function cancel_group_rule_change(uuid, uuid) from public, anon, authenticated;
grant execute on function cancel_group_rule_change(uuid, uuid) to service_role;


-- Direct changes by the Group Admin stop once the rules are locked.
CREATE OR REPLACE FUNCTION public.set_group_loan_rates(p_group_id uuid, p_admin_id uuid, p_interest_rate numeric, p_penalty_weekly_rate numeric)
 RETURNS groups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old groups;
  v_new groups;
begin
  if not exists (
    select 1 from memberships
    where group_id = p_group_id and user_id = p_admin_id and role = 'group_admin' and status = 'active'
  ) then
    raise exception 'Only a Group Admin can change loan rates.';
  end if;
  if (select rules_locked_at from groups where id = p_group_id) is not null then
    raise exception 'These rules are locked by Atlast. Propose a change instead: it needs a yes vote from at least a third of members and Atlast approval.';
  end if;
  if p_interest_rate is null or p_interest_rate < 0 or p_interest_rate > 100 then
    raise exception 'Interest must be between 0%% and 100%%.';
  end if;
  if p_penalty_weekly_rate is null or p_penalty_weekly_rate < 0 or p_penalty_weekly_rate > 20 then
    raise exception 'The weekly penalty must be between 0%% and 20%%.';
  end if;

  select * into v_old from groups where id = p_group_id for update;
  if v_old.loan_interest_rate = p_interest_rate and v_old.late_penalty_weekly_rate = p_penalty_weekly_rate then
    return v_old;
  end if;

  update groups
  set loan_interest_rate = p_interest_rate, late_penalty_weekly_rate = p_penalty_weekly_rate
  where id = p_group_id
  returning * into v_new;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_group_id, p_admin_id, 'group.loan_rates_changed', 'group', p_group_id,
          jsonb_build_object(
            'interest_from', v_old.loan_interest_rate, 'interest_to', p_interest_rate,
            'penalty_from', v_old.late_penalty_weekly_rate, 'penalty_to', p_penalty_weekly_rate));

  begin
    perform notify_group_members(p_group_id, 'group.loan_rates_changed', p_group_id,
      jsonb_build_object('interest', p_interest_rate, 'penalty', p_penalty_weekly_rate), p_admin_id);
  exception when others then
    raise warning 'notification (loan rates %) failed: %', p_group_id, sqlerrm;
  end;

  return v_new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_jamii_amount(p_group_id uuid, p_admin_id uuid, p_amount numeric)
 RETURNS groups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old groups;
  v_new groups;
begin
  if not exists (select 1 from memberships where group_id = p_group_id and user_id = p_admin_id
                 and role = 'group_admin' and status = 'active') then
    raise exception 'Only a Group Admin can set the Jamii amount.';
  end if;
  if (select rules_locked_at from groups where id = p_group_id) is not null then
    raise exception 'These rules are locked by Atlast. Propose a change instead: it needs a yes vote from at least a third of members and Atlast approval.';
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'Amount must be zero or more.'; end if;
  select * into v_old from groups where id = p_group_id for update;
  if v_old.jamii_contribution_amount = p_amount then return v_old; end if;
  update groups set jamii_contribution_amount = p_amount where id = p_group_id returning * into v_new;
  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_group_id, p_admin_id, 'group.jamii_amount_changed', 'group', p_group_id,
          jsonb_build_object('from', v_old.jamii_contribution_amount, 'to', p_amount));
  begin
    perform notify_group_members(p_group_id, 'group.jamii_amount_changed', p_group_id,
      jsonb_build_object('amount', p_amount, 'currency', v_new.currency), p_admin_id, null);
  exception when others then
    raise warning 'notification (jamii amount %) failed: %', p_group_id, sqlerrm;
  end;
  return v_new;
end;
$function$
;
