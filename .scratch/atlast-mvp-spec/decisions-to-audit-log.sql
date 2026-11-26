-- Decided votes and approvals leave the Votes tab and live in the Audit Log
-- (2026-11-26). Until now a decided membership vote, loan review or Jamii /
-- charge approval was not written to audit_events at all. Each one now is,
-- the moment it is decided, with a readable summary and the tallies.

create or replace function public.full_name_of(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ''), 'A member')
  from profiles where id = p_id
$$;
revoke all on function public.full_name_of(uuid) from public, anon, authenticated;

-- Membership votes (secret ballot: totals only, never who voted how).
create or replace function public.audit_motion_decided() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_yes int; v_no int; v_user uuid;
begin
  select count(*) filter (where choice = 'approve'), count(*) filter (where choice = 'decline')
    into v_yes, v_no from votes where motion_id = new.id;
  select user_id into v_user from memberships where id = new.subject_membership_id;
  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason, metadata, created_at)
  values (new.group_id, null, 'vote.' || new.status, 'vote', new.id,
          format('Membership vote on %s: %s (%s yes, %s no)', full_name_of(v_user),
                 case when new.status = 'approved' then 'approved' else 'declined' end, v_yes, v_no),
          jsonb_build_object('kind', 'membership', 'applicant', v_user, 'yes', v_yes, 'no', v_no),
          coalesce(new.decided_at, now()));
  return new;
exception when others then
  raise warning 'audit of motion % failed: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists audit_motion_decided on motions;
create trigger audit_motion_decided after update of status on motions
  for each row when (old.status = 'open' and new.status in ('approved', 'declined'))
  execute function audit_motion_decided();

-- Loan reviews (Three-Eye Panel or Group Admin alone).
create or replace function public.audit_loan_decided() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_yes int; v_no int;
begin
  select count(*) filter (where decision = 'approve'), count(*) filter (where decision = 'decline')
    into v_yes, v_no from loan_reviewers where loan_id = new.id;
  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason, metadata, created_at)
  values (new.group_id, null, 'loan.' || new.status, 'loan', new.id,
          format('Loan request by %s for %s %s: %s', full_name_of(new.borrower_id),
                 (select currency from groups where id = new.group_id), to_char(new.principal, 'FM999,999,999,990'),
                 new.status) ||
          case when new.review_mode = 'three_eye' then format(' (%s of 3 reviewers approved, %s declined)', v_yes, v_no) else ' by the Group Admin' end,
          jsonb_build_object('kind', 'loan', 'borrower', new.borrower_id, 'yes', v_yes, 'no', v_no),
          coalesce(new.decided_at, now()));
  return new;
exception when others then
  raise warning 'audit of loan % failed: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists audit_loan_decided on loans;
create trigger audit_loan_decided after update of status on loans
  for each row when (old.status = 'pending_review' and new.status in ('approved', 'declined'))
  execute function audit_loan_decided();

-- Jamii payouts and miscellaneous charges.
create or replace function public.audit_spend_decided() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_yes int; v_no int;
begin
  select count(*) filter (where decision = 'approve'), count(*) filter (where decision = 'decline')
    into v_yes, v_no from group_spend_approvers where request_id = new.id;
  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason, metadata, created_at)
  values (new.group_id, null, 'spend.' || new.status, 'spend', new.id,
          format('%s of %s %s%s: %s (%s approved, %s declined)',
                 case when new.kind = 'jamii' then 'Jamii payout' else coalesce('Charge (' || new.category || ')', 'Charge') end,
                 (select currency from groups where id = new.group_id), to_char(new.amount, 'FM999,999,999,990'),
                 case when new.beneficiary_id is not null then ' to ' || full_name_of(new.beneficiary_id) else '' end,
                 new.status, v_yes, v_no),
          jsonb_build_object('kind', new.kind, 'beneficiary', new.beneficiary_id, 'yes', v_yes, 'no', v_no),
          coalesce(new.decided_at, now()));
  return new;
exception when others then
  raise warning 'audit of spend request % failed: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists audit_spend_decided on group_spend_requests;
create trigger audit_spend_decided after update of status on group_spend_requests
  for each row when (old.status = 'pending' and new.status in ('approved', 'declined'))
  execute function audit_spend_decided();

-- Backfill everything already decided, so nothing leaves the Votes tab
-- without being in the Audit Log. Re-running is safe (skips logged ones).
insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason, metadata, created_at)
select m.group_id, null, 'vote.' || m.status, 'vote', m.id,
       format('Membership vote on %s: %s (%s yes, %s no)', full_name_of(ms.user_id), m.status, t.yes, t.no),
       jsonb_build_object('kind', 'membership', 'applicant', ms.user_id, 'yes', t.yes, 'no', t.no),
       coalesce(m.decided_at, m.created_at)
from motions m
join memberships ms on ms.id = m.subject_membership_id
cross join lateral (select count(*) filter (where choice = 'approve') yes, count(*) filter (where choice = 'decline') no
                    from votes where motion_id = m.id) t
where m.status in ('approved', 'declined')
  and not exists (select 1 from audit_events a where a.entity_id = m.id and a.entity_type = 'vote');

insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason, metadata, created_at)
select l.group_id, null, 'loan.' || case when l.status = 'declined' then 'declined' else 'approved' end, 'loan', l.id,
       format('Loan request by %s for %s %s: %s', full_name_of(l.borrower_id), g.currency,
              to_char(l.principal, 'FM999,999,999,990'), case when l.status = 'declined' then 'declined' else 'approved' end) ||
       case when l.review_mode = 'three_eye' then format(' (%s of 3 reviewers approved, %s declined)', t.yes, t.no) else ' by the Group Admin' end,
       jsonb_build_object('kind', 'loan', 'borrower', l.borrower_id, 'yes', t.yes, 'no', t.no),
       coalesce(l.decided_at, l.created_at)
from loans l
join groups g on g.id = l.group_id
cross join lateral (select count(*) filter (where decision = 'approve') yes, count(*) filter (where decision = 'decline') no
                    from loan_reviewers where loan_id = l.id) t
where l.status <> 'pending_review' and l.decided_at is not null
  and not exists (select 1 from audit_events a where a.entity_id = l.id and a.action in ('loan.approved', 'loan.declined'));

insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason, metadata, created_at)
select s.group_id, null, 'spend.' || case when s.status = 'declined' then 'declined' else 'approved' end, 'spend', s.id,
       format('%s of %s %s%s: %s (%s approved, %s declined)',
              case when s.kind = 'jamii' then 'Jamii payout' else coalesce('Charge (' || s.category || ')', 'Charge') end,
              g.currency, to_char(s.amount, 'FM999,999,999,990'),
              case when s.beneficiary_id is not null then ' to ' || full_name_of(s.beneficiary_id) else '' end,
              case when s.status = 'declined' then 'declined' else 'approved' end, t.yes, t.no),
       jsonb_build_object('kind', s.kind, 'beneficiary', s.beneficiary_id, 'yes', t.yes, 'no', t.no),
       coalesce(s.decided_at, s.created_at)
from group_spend_requests s
join groups g on g.id = s.group_id
cross join lateral (select count(*) filter (where decision = 'approve') yes, count(*) filter (where decision = 'decline') no
                    from group_spend_approvers where request_id = s.id) t
where s.status in ('approved', 'declined', 'paid') and s.decided_at is not null
  and not exists (select 1 from audit_events a where a.entity_id = s.id and a.action in ('spend.approved', 'spend.declined'));
