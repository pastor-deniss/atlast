-- JAMII (welfare) AND MISCELLANEOUS CHARGES (group expenses), 2026-11-26.
--
-- Decisions (product owner):
--   * Jamii is funded by its own regular contribution into a separate Jamii
--     pot. Savings, shares and loan eligibility never include it, and Jamii
--     payouts come only from that pot.
--   * Miscellaneous charges (group expenses) are paid from the main fund.
--   * Both are started by a Group Admin and need ALL 3 approvers to say yes;
--     a single "no" declines.
--   * Approvers are picked at random from members in good standing:
--       - active member for at least 3 months,
--       - contributed (savings, not reversed) in each of the last 3
--         contribution periods,
--       - loan default rate <= 20% (defaulted loans / loans paid out),
--       - no loan currently defaulted or overdue,
--       - not the person being helped and not the admin who started it.
--   * Fewer than 3 such members: the admin decides. The app suggests members
--     (best standing first) and the admin picks 3 approvers from them; if the
--     group has fewer than 3 other members at all, the admin approves alone.
--     Every path is audited.
--   * Once approved, a Group Admin records the payout (manual "I sent it"
--     pattern, like loan disbursement). Money moves only through the ledger.

-- 1. Ledger: three new entry types.
alter table transactions drop constraint transactions_type_check;
alter table transactions add constraint transactions_type_check check (type = any (array[
  'contribution', 'loan_disbursement', 'repayment', 'reversal',
  'jamii_contribution', 'jamii_payout', 'group_expense'
]));

-- The regular Jamii amount the admin asks of each member (0 = not set).
alter table groups
  add column if not exists jamii_contribution_amount numeric not null default 0
    check (jamii_contribution_amount >= 0);

-- 2. Balances: the main fund leaves the Jamii pot out; the pot is its own
--    column. A reversal counts with the entry it reverses.
create or replace view group_balances with (security_invoker = true) as
select
  t.group_id,
  coalesce(sum(t.amount) filter (where coalesce(o.type, t.type) not in ('jamii_contribution', 'jamii_payout')), 0) as balance,
  coalesce(sum(t.amount) filter (where coalesce(o.type, t.type) in ('jamii_contribution', 'jamii_payout')), 0) as jamii_balance
from transactions t
left join transactions o on t.type = 'reversal' and o.id = t.reversed_transaction_id
group by t.group_id;
revoke all on group_balances from anon;
grant select on group_balances to authenticated;

-- 3. Requests and their approvers.
create table if not exists group_spend_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  kind text not null check (kind in ('jamii', 'expense')),
  beneficiary_id uuid references profiles(id),
  amount numeric not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  category text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'paid', 'cancelled')),
  approval_mode text not null check (approval_mode in ('random', 'admin_picked', 'admin_only')),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  paid_at timestamptz,
  paid_by uuid references profiles(id),
  payout_transaction_id uuid references transactions(id),
  check ((kind = 'jamii') = (beneficiary_id is not null))
);
create index if not exists group_spend_requests_group on group_spend_requests (group_id, created_at desc);

create table if not exists group_spend_approvers (
  request_id uuid not null references group_spend_requests(id) on delete cascade,
  approver_id uuid not null references profiles(id),
  decision text not null default 'pending' check (decision in ('pending', 'approve', 'decline')),
  comment text,
  decided_at timestamptz,
  primary key (request_id, approver_id)
);
create index if not exists group_spend_approvers_approver on group_spend_approvers (approver_id, decision);

alter table group_spend_requests enable row level security;
alter table group_spend_approvers enable row level security;
drop policy if exists group_spend_requests_select on group_spend_requests;
create policy group_spend_requests_select on group_spend_requests for select
  using (is_active_member(group_id) or is_system_admin());
drop policy if exists group_spend_approvers_select on group_spend_approvers;
create policy group_spend_approvers_select on group_spend_approvers for select
  using (exists (select 1 from group_spend_requests r where r.id = request_id
                 and (is_active_member(r.group_id) or is_system_admin())));
revoke all on group_spend_requests, group_spend_approvers from anon;
grant select on group_spend_requests, group_spend_approvers to authenticated;
-- No client writes: every change goes through the functions below.


-- 4. Who may approve: one row per active member with the checks spelled out,
--    so the app can explain a suggestion. Excludes nobody; callers filter.
create or replace function spend_approver_standing(p_group_id uuid)
returns table (
  member_id uuid,
  months_active integer,
  periods_contributed integer,
  default_rate integer,
  has_bad_loan boolean,
  eligible boolean
)
language sql stable security definer set search_path = public as $$
  with g as (
    select id, case lower(contribution_frequency)
      when 'daily' then 1 when 'weekly' then 7 when 'biweekly' then 14 else 30 end as period_days
    from groups where id = p_group_id
  ),
  m as (
    select user_id, coalesce(decided_at, applied_at) as since
    from memberships where group_id = p_group_id and status = 'active'
  ),
  contrib as (
    select t.member_id, t.created_at
    from transactions t
    where t.group_id = p_group_id and t.type = 'contribution'
      and not exists (select 1 from transactions r where r.reversed_transaction_id = t.id)
  ),
  periods as (
    select m.user_id,
      (select count(*) from generate_series(0, 2) k
        where exists (select 1 from contrib c, g
                      where c.member_id = m.user_id
                        and c.created_at >= now() - make_interval(days => (k + 1) * g.period_days)
                        and c.created_at <  now() - make_interval(days => k * g.period_days)))::integer as n
    from m
  ),
  loans_of as (
    select m.user_id,
      count(l.*) filter (where l.status in ('disbursed', 'repaying', 'repaid', 'defaulted')) as paid_out,
      count(l.*) filter (where l.status = 'defaulted') as defaulted
    from m left join loans l on l.borrower_id = m.user_id and l.group_id = p_group_id
    group by m.user_id
  ),
  bad as (
    select m.user_id, exists (
      select 1 from loan_dues d
      where d.group_id = p_group_id and d.borrower_id = m.user_id
        and (d.status = 'defaulted' or d.is_overdue)) as bad
    from m
  )
  select
    m.user_id,
    (extract(year from age(now(), m.since)) * 12 + extract(month from age(now(), m.since)))::integer,
    p.n,
    case when lo.paid_out = 0 then 0 else round(100.0 * lo.defaulted / lo.paid_out)::integer end,
    b.bad,
    m.since <= now() - interval '3 months'
      and p.n = 3
      and (lo.paid_out = 0 or lo.defaulted * 5 <= lo.paid_out)
      and not b.bad
  from m
  join periods p on p.user_id = m.user_id
  join loans_of lo on lo.user_id = m.user_id
  join bad b on b.user_id = m.user_id
$$;
revoke all on function spend_approver_standing(uuid) from public, anon, authenticated;
grant execute on function spend_approver_standing(uuid) to service_role;

-- What the app shows the admin before starting a request: how many members
-- qualify, and (best standing first) everyone who could be picked if fewer
-- than 3 qualify. Only a Group Admin of the group may ask.
create or replace function spend_approver_suggestions(p_group_id uuid, p_beneficiary_id uuid default null)
returns table (
  member_id uuid,
  full_name text,
  months_active integer,
  periods_contributed integer,
  default_rate integer,
  has_bad_loan boolean,
  eligible boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from memberships where group_id = p_group_id and user_id = auth.uid()
                 and role = 'group_admin' and status = 'active') then
    raise exception 'Only a Group Admin can see approver suggestions.';
  end if;
  return query
    select s.member_id, coalesce(notif_person_name(s.member_id), ''), s.months_active, s.periods_contributed,
           s.default_rate, s.has_bad_loan, s.eligible
    from spend_approver_standing(p_group_id) s
    where s.member_id <> auth.uid()
      and s.member_id is distinct from p_beneficiary_id
    order by s.eligible desc, s.has_bad_loan, s.periods_contributed desc, s.default_rate, s.months_active desc;
end;
$$;
revoke all on function spend_approver_suggestions(uuid, uuid) from public, anon;
grant execute on function spend_approver_suggestions(uuid, uuid) to authenticated, service_role;


-- 5. Start a request.
create or replace function create_spend_request(
  p_group_id uuid,
  p_admin_id uuid,
  p_kind text,
  p_beneficiary_id uuid,
  p_amount numeric,
  p_reason text,
  p_category text,
  p_picked uuid[]
) returns group_spend_requests
language plpgsql security definer set search_path = public as $$
declare
  v_req group_spend_requests;
  v_pool uuid[];
  v_others integer;
  v_mode text;
  v_available numeric;
  v_group groups;
begin
  if not exists (select 1 from memberships where group_id = p_group_id and user_id = p_admin_id
                 and role = 'group_admin' and status = 'active') then
    raise exception 'Only a Group Admin can start this.';
  end if;
  if p_kind not in ('jamii', 'expense') then raise exception 'Unknown request type.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive.'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'Say what the money is for.'; end if;

  if p_kind = 'jamii' then
    if p_beneficiary_id is null or not exists (
      select 1 from memberships where group_id = p_group_id and user_id = p_beneficiary_id and status = 'active') then
      raise exception 'Choose the member who needs help.';
    end if;
    select coalesce(jamii_balance, 0) into v_available from group_balances where group_id = p_group_id;
    if p_amount > coalesce(v_available, 0) then
      raise exception 'The Jamii pot only has %.', coalesce(v_available, 0);
    end if;
  else
    p_beneficiary_id := null;
    select coalesce(balance, 0) into v_available from group_balances where group_id = p_group_id;
    if p_amount > coalesce(v_available, 0) then
      raise exception 'The group fund only has %.', coalesce(v_available, 0);
    end if;
  end if;

  -- Random draw from members in good standing.
  select array_agg(member_id) into v_pool from (
    select s.member_id from spend_approver_standing(p_group_id) s
    where s.eligible and s.member_id <> p_admin_id and s.member_id is distinct from p_beneficiary_id
    order by random() limit 3
  ) x;

  if coalesce(array_length(v_pool, 1), 0) >= 3 then
    v_mode := 'random';
  else
    select count(*) into v_others from memberships
    where group_id = p_group_id and status = 'active'
      and user_id <> p_admin_id and user_id is distinct from p_beneficiary_id;
    if v_others < 3 then
      v_mode := 'admin_only';
      v_pool := null;
    else
      -- The admin picks 3 approvers from the app's suggestions.
      v_pool := (select array_agg(distinct x) from unnest(coalesce(p_picked, '{}')) x);
      if coalesce(array_length(v_pool, 1), 0) <> 3 then
        raise exception 'Not enough members qualify to be picked at random. Choose 3 approvers from the suggestions.';
      end if;
      if exists (select 1 from unnest(v_pool) x where x = p_admin_id or x is not distinct from p_beneficiary_id
                 or not exists (select 1 from memberships where group_id = p_group_id and user_id = x and status = 'active')) then
        raise exception 'Approvers must be other active members of the group.';
      end if;
      v_mode := 'admin_picked';
    end if;
  end if;

  insert into group_spend_requests (group_id, kind, beneficiary_id, amount, reason, category, status,
                                    approval_mode, created_by, decided_at)
  values (p_group_id, p_kind, p_beneficiary_id, p_amount, btrim(p_reason), nullif(btrim(coalesce(p_category, '')), ''),
          case when v_mode = 'admin_only' then 'approved' else 'pending' end,
          v_mode, p_admin_id, case when v_mode = 'admin_only' then now() end)
  returning * into v_req;

  if v_pool is not null then
    insert into group_spend_approvers (request_id, approver_id) select v_req.id, unnest(v_pool);
  end if;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_group_id, p_admin_id, 'spend.requested', 'spend_request', v_req.id,
          jsonb_build_object('kind', p_kind, 'amount', p_amount, 'beneficiary', p_beneficiary_id,
                             'approval_mode', v_mode, 'approvers', to_jsonb(v_pool)));

  select * into v_group from groups where id = p_group_id;
  begin
    if v_pool is not null then
      perform notify_user(a, p_group_id, 'spend.approval_requested', v_req.id,
        jsonb_build_object('kind', p_kind, 'amount', p_amount, 'currency', v_group.currency,
                           'name', notif_person_name(p_beneficiary_id), 'reason', left(btrim(p_reason), 80)))
      from unnest(v_pool) a;
    end if;
  exception when others then
    raise warning 'notification (spend request %) failed: %', v_req.id, sqlerrm;
  end;

  return v_req;
end;
$$;
revoke all on function create_spend_request(uuid, uuid, text, uuid, numeric, text, text, uuid[]) from public, anon, authenticated;
grant execute on function create_spend_request(uuid, uuid, text, uuid, numeric, text, text, uuid[]) to service_role;


-- 6. An approver decides. All 3 yes -> approved; any no -> declined.
create or replace function decide_spend_request(
  p_request_id uuid, p_approver_id uuid, p_decision text, p_comment text
) returns group_spend_requests
language plpgsql security definer set search_path = public as $$
declare
  v_req group_spend_requests;
  v_yes integer;
  v_no integer;
  v_total integer;
  v_group groups;
  v_kind text;
begin
  if p_decision not in ('approve', 'decline') then raise exception 'Invalid decision.'; end if;
  select * into v_req from group_spend_requests where id = p_request_id for update;
  if v_req is null then raise exception 'Request not found.'; end if;
  if v_req.status <> 'pending' then raise exception 'This request has already been decided.'; end if;

  update group_spend_approvers
  set decision = p_decision, decided_at = now(), comment = nullif(btrim(coalesce(p_comment, '')), '')
  where request_id = p_request_id and approver_id = p_approver_id and decision = 'pending';
  if not found then raise exception 'You are not an approver of this request, or you have already decided.'; end if;

  select count(*) filter (where decision = 'approve'), count(*) filter (where decision = 'decline'), count(*)
  into v_yes, v_no, v_total from group_spend_approvers where request_id = p_request_id;

  if v_no > 0 then
    update group_spend_requests set status = 'declined', decided_at = now() where id = p_request_id returning * into v_req;
    v_kind := 'spend.declined';
  elsif v_yes = v_total then
    update group_spend_requests set status = 'approved', decided_at = now() where id = p_request_id returning * into v_req;
    v_kind := 'spend.approved';
  end if;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_req.group_id, p_approver_id, 'spend.' || p_decision, 'spend_request', v_req.id,
          jsonb_build_object('comment', nullif(btrim(coalesce(p_comment, '')), '')));

  if v_kind is not null then
    select * into v_group from groups where id = v_req.group_id;
    begin
      perform notify_group_admins(v_req.group_id, v_kind, v_req.id,
        jsonb_build_object('kind', v_req.kind, 'amount', v_req.amount, 'currency', v_group.currency,
                           'name', notif_person_name(v_req.beneficiary_id), 'reason', left(v_req.reason, 80)), null);
    exception when others then
      raise warning 'notification (spend decision %) failed: %', v_req.id, sqlerrm;
    end;
  end if;

  return v_req;
end;
$$;
revoke all on function decide_spend_request(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function decide_spend_request(uuid, uuid, text, text) to service_role;


-- 7. The admin records that the approved money was paid out.
create or replace function pay_spend_request(
  p_request_id uuid, p_admin_id uuid, p_reference text, p_payment_method text
) returns group_spend_requests
language plpgsql security definer set search_path = public as $$
declare
  v_req group_spend_requests;
  v_tx transactions;
  v_available numeric;
  v_group groups;
begin
  select * into v_req from group_spend_requests where id = p_request_id for update;
  if v_req is null then raise exception 'Request not found.'; end if;
  if not exists (select 1 from memberships where group_id = v_req.group_id and user_id = p_admin_id
                 and role = 'group_admin' and status = 'active') then
    raise exception 'Only a Group Admin can record a payout.';
  end if;
  if v_req.status <> 'approved' then raise exception 'Only approved requests can be paid out.'; end if;

  if v_req.kind = 'jamii' then
    select coalesce(jamii_balance, 0) into v_available from group_balances where group_id = v_req.group_id;
  else
    select coalesce(balance, 0) into v_available from group_balances where group_id = v_req.group_id;
  end if;
  if v_req.amount > coalesce(v_available, 0) then
    raise exception 'Not enough money: only % available.', coalesce(v_available, 0);
  end if;

  insert into transactions (group_id, member_id, type, amount, status, reference, description, payment_method, created_by)
  values (v_req.group_id, coalesce(v_req.beneficiary_id, p_admin_id),
          case when v_req.kind = 'jamii' then 'jamii_payout' else 'group_expense' end,
          -v_req.amount, 'posted', nullif(btrim(coalesce(p_reference, '')), ''), v_req.reason,
          p_payment_method, p_admin_id)
  returning * into v_tx;

  update group_spend_requests
  set status = 'paid', paid_at = now(), paid_by = p_admin_id, payout_transaction_id = v_tx.id
  where id = p_request_id returning * into v_req;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_req.group_id, p_admin_id, 'spend.paid', 'spend_request', v_req.id,
          jsonb_build_object('amount', v_req.amount, 'transaction', v_tx.id));

  select * into v_group from groups where id = v_req.group_id;
  begin
    if v_req.kind = 'jamii' then
      perform notify_user(v_req.beneficiary_id, v_req.group_id, 'spend.paid', v_req.id,
        jsonb_build_object('kind', 'jamii', 'amount', v_req.amount, 'currency', v_group.currency));
    else
      -- Group money spent: everyone is told, for transparency.
      perform notify_group_members(v_req.group_id, 'spend.paid', v_req.id,
        jsonb_build_object('kind', 'expense', 'amount', v_req.amount, 'currency', v_group.currency,
                           'reason', left(v_req.reason, 80)), p_admin_id, null);
    end if;
  exception when others then
    raise warning 'notification (spend paid %) failed: %', v_req.id, sqlerrm;
  end;

  return v_req;
end;
$$;
revoke all on function pay_spend_request(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function pay_spend_request(uuid, uuid, text, text) to service_role;


-- 8. The admin withdraws a request that has not been paid.
create or replace function cancel_spend_request(p_request_id uuid, p_admin_id uuid) returns group_spend_requests
language plpgsql security definer set search_path = public as $$
declare
  v_req group_spend_requests;
begin
  select * into v_req from group_spend_requests where id = p_request_id for update;
  if v_req is null then raise exception 'Request not found.'; end if;
  if not exists (select 1 from memberships where group_id = v_req.group_id and user_id = p_admin_id
                 and role = 'group_admin' and status = 'active') then
    raise exception 'Only a Group Admin can cancel this.';
  end if;
  if v_req.status not in ('pending', 'approved') then raise exception 'This request can no longer be cancelled.'; end if;
  update group_spend_requests set status = 'cancelled', decided_at = coalesce(decided_at, now())
  where id = p_request_id returning * into v_req;
  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_req.group_id, p_admin_id, 'spend.cancelled', 'spend_request', v_req.id, '{}'::jsonb);
  return v_req;
end;
$$;
revoke all on function cancel_spend_request(uuid, uuid) from public, anon, authenticated;
grant execute on function cancel_spend_request(uuid, uuid) to service_role;


-- 9. The admin sets the regular Jamii amount. Audited, members told.
create or replace function set_jamii_amount(p_group_id uuid, p_admin_id uuid, p_amount numeric) returns groups
language plpgsql security definer set search_path = public as $$
declare
  v_old groups;
  v_new groups;
begin
  if not exists (select 1 from memberships where group_id = p_group_id and user_id = p_admin_id
                 and role = 'group_admin' and status = 'active') then
    raise exception 'Only a Group Admin can set the Jamii amount.';
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
$$;
revoke all on function set_jamii_amount(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function set_jamii_amount(uuid, uuid, numeric) to service_role;
