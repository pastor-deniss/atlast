-- Ticket 18 — Postgres functions backing the governance Edge Functions.
-- Same pattern as tickets 13/17: multi-step / atomicity-sensitive operations
-- live in one plpgsql function. Every function revokes PUBLIC execute and
-- grants only to service_role (security definer functions default to PUBLIC
-- execute, which would otherwise let any authenticated client call these
-- directly via RPC, bypassing the Edge Function's auth/role checks).

-- Fail-fast (ticket 13 Q1, extended from the loan panel to membership
-- Motions) + expiry resolution in one function, called both inline after
-- every vote and by the cron sweep below. Not directly client-callable.
create or replace function resolve_motion_if_settled(p_motion_id uuid) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_motion motions;
  v_eligible integer;
  v_approve integer;
  v_decline integer;
  v_remaining integer;
  v_outcome text;
begin
  select * into v_motion from motions where id = p_motion_id for update;
  if v_motion is null or v_motion.status != 'open' then
    return;
  end if;

  select count(*) into v_eligible
  from memberships where group_id = v_motion.group_id and status = 'active';

  select count(*) filter (where choice = 'approve'), count(*) filter (where choice = 'decline')
  into v_approve, v_decline
  from votes where motion_id = p_motion_id;

  v_remaining := v_eligible - (v_approve + v_decline);

  if v_approve > v_decline + v_remaining then
    v_outcome := 'approved';
  elsif v_decline > v_approve + v_remaining then
    v_outcome := 'declined';
  elsif v_motion.closes_at < now() then
    -- Window expired: simple majority of votes cast decides, no quorum. Tie -> declined (status-quo default).
    v_outcome := case when v_approve > v_decline then 'approved' else 'declined' end;
  else
    return; -- not yet settled
  end if;

  update motions set status = v_outcome, decided_at = now() where id = p_motion_id;

  update memberships
  set status = case when v_outcome = 'approved' then 'active' else 'declined' end,
      decided_at = now(),
      decision_motion_id = p_motion_id
  where id = v_motion.subject_membership_id;
end;
$$;
revoke all on function resolve_motion_if_settled(uuid) from public;
grant execute on function resolve_motion_if_settled(uuid) to service_role;


create or replace function cast_vote(p_motion_id uuid, p_voter_id uuid, p_choice text) returns votes
language plpgsql
security definer set search_path = public
as $$
declare
  v_motion motions;
  v_vote votes;
begin
  if p_choice not in ('approve', 'decline') then
    raise exception 'Invalid choice.';
  end if;

  select * into v_motion from motions where id = p_motion_id for update;
  if v_motion is null then raise exception 'Motion not found.'; end if;
  if v_motion.status != 'open' then raise exception 'This motion has already been decided.'; end if;

  if not exists (
    select 1 from memberships where group_id = v_motion.group_id and user_id = p_voter_id and status = 'active'
  ) then
    raise exception 'You are not an active member of this group.';
  end if;

  begin
    insert into votes (motion_id, voter_id, choice)
    values (p_motion_id, p_voter_id, p_choice)
    returning * into v_vote;
  exception
    when unique_violation then
      raise exception 'You have already voted on this motion.';
  end;

  perform resolve_motion_if_settled(p_motion_id);

  return v_vote;
end;
$$;
revoke all on function cast_vote(uuid, uuid, text) from public;
grant execute on function cast_vote(uuid, uuid, text) to service_role;


create or replace function initiate_membership_vote(p_membership_id uuid, p_admin_id uuid) returns motions
language plpgsql
security definer set search_path = public
as $$
declare
  v_membership memberships;
  v_motion motions;
begin
  select * into v_membership from memberships where id = p_membership_id for update;
  if v_membership is null then raise exception 'Membership not found.'; end if;
  if v_membership.status != 'pending' then raise exception 'This application has already been decided.'; end if;
  if exists (select 1 from motions where subject_membership_id = p_membership_id) then
    raise exception 'A vote has already been initiated for this application.';
  end if;

  insert into motions (group_id, type, subject_membership_id, raised_by, opens_at, closes_at)
  values (v_membership.group_id, 'membership_application', p_membership_id, p_admin_id, now(), now() + interval '7 days')
  returning * into v_motion;

  return v_motion;
end;
$$;
revoke all on function initiate_membership_vote(uuid, uuid) from public;
grant execute on function initiate_membership_vote(uuid, uuid) to service_role;


create or replace function reject_membership_application(p_membership_id uuid, p_admin_id uuid) returns memberships
language plpgsql
security definer set search_path = public
as $$
declare
  v_membership memberships;
begin
  select * into v_membership from memberships where id = p_membership_id for update;
  if v_membership is null then raise exception 'Membership not found.'; end if;
  if v_membership.status != 'pending' then raise exception 'This application has already been decided.'; end if;
  if exists (select 1 from motions where subject_membership_id = p_membership_id) then
    raise exception 'A vote has already been initiated -- this application can no longer be rejected directly.';
  end if;

  update memberships set status = 'declined', decided_at = now()
  where id = p_membership_id
  returning * into v_membership;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id)
  values (v_membership.group_id, p_admin_id, 'membership.rejected', 'membership', v_membership.id);

  return v_membership;
end;
$$;
revoke all on function reject_membership_application(uuid, uuid) from public;
grant execute on function reject_membership_application(uuid, uuid) to service_role;


-- resolveExpiredMotions (ticket 13): pg_cron sweep, catches motions that
-- only settle at the 7-day deadline (no quorum forces earlier settlement).
create or replace function resolve_expired_motions() returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  for r in select id from motions where status = 'open' and closes_at < now() loop
    perform resolve_motion_if_settled(r.id);
  end loop;
end;
$$;
revoke all on function resolve_expired_motions() from public;
grant execute on function resolve_expired_motions() to service_role;

create extension if not exists pg_cron;

select cron.schedule(
  'resolve-expired-motions',
  '*/15 * * * *',
  $$select resolve_expired_motions();$$
);
