-- IN-APP NOTIFICATIONS (2026-11-26). The bell on Home and the Notifications
-- screen. CONTEXT.md listed notifications as out of V1 scope; the product
-- owner asked for them. This is in-app only: no push, no SMS (SMS waits on
-- the Beem sender name; push needs native builds or web push).
--
-- Rows are created by AFTER triggers on the tables where things happen, so
-- every write path (Edge Functions, SQL functions, pg_cron) notifies without
-- being changed. Each trigger body swallows its own errors (raises a
-- WARNING) -- a notification must never roll back the money or governance
-- action that caused it.
--
-- Text is not stored: `kind` + `params` are rendered and translated by the
-- app, so a notification shows in the member's current language.
--
-- Members read only their own rows and may only set read_at. Nobody inserts
-- or deletes from the client.

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id),
  group_id    uuid references groups(id),
  kind        text not null,       -- open vocabulary, see the triggers below
  entity_id   uuid,                -- what tapping it opens (loan, motion, complaint, ...)
  params      jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx on notifications (user_id) where read_at is null;

alter table notifications enable row level security;

drop policy if exists notifications_select_own on notifications;
create policy notifications_select_own on notifications
  for select using (user_id = auth.uid());

drop policy if exists notifications_mark_read_own on notifications;
create policy notifications_mark_read_own on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Column-level: a member can change read_at and nothing else.
revoke all on table notifications from anon, authenticated;
grant select on table notifications to authenticated;
grant update (read_at) on table notifications to authenticated;
grant all on table notifications to service_role;


-- ---------------------------------------------------------------------------
-- Helpers (not callable by clients)
-- ---------------------------------------------------------------------------

create or replace function notif_person_name(p_user_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from profiles where id = p_user_id
$$;

create or replace function notif_group_info(p_group_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('group', name, 'currency', currency) from groups where id = p_group_id
$$;

-- Every active member of a group, optionally leaving out one or two people.
create or replace function notify_group_members(
  p_group_id uuid, p_kind text, p_entity_id uuid, p_params jsonb,
  p_except uuid default null, p_except2 uuid default null
) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, group_id, kind, entity_id, params)
  select m.user_id, p_group_id, p_kind, p_entity_id, p_params
  from memberships m
  where m.group_id = p_group_id and m.status = 'active'
    and m.user_id is distinct from p_except and m.user_id is distinct from p_except2
$$;

-- Every active Group Admin of a group, optionally leaving out one person.
create or replace function notify_group_admins(
  p_group_id uuid, p_kind text, p_entity_id uuid, p_params jsonb, p_except uuid default null
) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, group_id, kind, entity_id, params)
  select m.user_id, p_group_id, p_kind, p_entity_id, p_params
  from memberships m
  where m.group_id = p_group_id and m.status = 'active' and m.role = 'group_admin'
    and m.user_id is distinct from p_except
$$;

create or replace function notify_user(
  p_user_id uuid, p_group_id uuid, p_kind text, p_entity_id uuid, p_params jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, group_id, kind, entity_id, params)
  values (p_user_id, p_group_id, p_kind, p_entity_id, p_params)
$$;


-- ---------------------------------------------------------------------------
-- Announcements: everyone in the group except the author.
-- ---------------------------------------------------------------------------
create or replace function trg_notify_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform notify_group_members(new.group_id,
      case when new.priority = 'important' then 'announcement.important' else 'announcement.posted' end,
      new.id, jsonb_build_object('title', new.title), new.author_id);
  exception when others then
    raise warning 'notification (announcement %) failed: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
drop trigger if exists notify_announcement on announcements;
create trigger notify_announcement after insert on announcements
  for each row execute function trg_notify_announcement();


-- ---------------------------------------------------------------------------
-- Memberships: admins hear of a new application; the applicant hears the
-- outcome.
-- ---------------------------------------------------------------------------
create or replace function trg_notify_membership() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_params jsonb;
begin
  begin
    v_params := coalesce(notif_group_info(new.group_id), '{}'::jsonb)
                || jsonb_build_object('name', notif_person_name(new.user_id));

    if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
      perform notify_group_admins(new.group_id, 'membership.applied', new.id, v_params, new.user_id);
    elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'active' then
      perform notify_user(new.user_id, new.group_id, 'membership.approved', new.id, v_params);
    elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'declined' then
      perform notify_user(new.user_id, new.group_id, 'membership.declined', new.id, v_params);
    end if;
  exception when others then
    raise warning 'notification (membership %) failed: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
drop trigger if exists notify_membership on memberships;
create trigger notify_membership after insert or update of status on memberships
  for each row execute function trg_notify_membership();


-- ---------------------------------------------------------------------------
-- Motions: a new vote opens -> every active member except the applicant.
-- ---------------------------------------------------------------------------
create or replace function trg_notify_motion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_applicant uuid;
begin
  begin
    select user_id into v_applicant from memberships where id = new.subject_membership_id;
    perform notify_group_members(new.group_id, 'vote.opened', new.id,
      jsonb_build_object('name', notif_person_name(v_applicant)), v_applicant, new.raised_by);
  exception when others then
    raise warning 'notification (motion %) failed: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
drop trigger if exists notify_motion on motions;
create trigger notify_motion after insert on motions
  for each row execute function trg_notify_motion();


-- ---------------------------------------------------------------------------
-- Loans: a reviewer is asked to review; admins decide fallback loans; the
-- borrower hears each status change.
-- ---------------------------------------------------------------------------
create or replace function trg_notify_loan_reviewer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_loan loans;
begin
  begin
    select * into v_loan from loans where id = new.loan_id;
    perform notify_user(new.reviewer_id, v_loan.group_id, 'loan.review_requested', v_loan.id,
      coalesce(notif_group_info(v_loan.group_id), '{}'::jsonb)
        || jsonb_build_object('name', notif_person_name(v_loan.borrower_id), 'amount', v_loan.principal));
  exception when others then
    raise warning 'notification (loan reviewer %) failed: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
drop trigger if exists notify_loan_reviewer on loan_reviewers;
create trigger notify_loan_reviewer after insert on loan_reviewers
  for each row execute function trg_notify_loan_reviewer();

create or replace function trg_notify_loan() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_params jsonb;
begin
  begin
    v_params := coalesce(notif_group_info(new.group_id), '{}'::jsonb)
                || jsonb_build_object('name', notif_person_name(new.borrower_id), 'amount', new.principal);

    if tg_op = 'INSERT' then
      if new.review_mode = 'admin_fallback' then
        perform notify_group_admins(new.group_id, 'loan.admin_decision_needed', new.id, v_params, new.borrower_id);
      end if;
    elsif old.status is distinct from new.status
          and new.status in ('approved', 'declined', 'disbursed', 'repaid', 'defaulted') then
      perform notify_user(new.borrower_id, new.group_id, 'loan.' || new.status, new.id, v_params);
    end if;
  exception when others then
    raise warning 'notification (loan %) failed: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
drop trigger if exists notify_loan on loans;
create trigger notify_loan after insert or update of status on loans
  for each row execute function trg_notify_loan();


-- ---------------------------------------------------------------------------
-- Reversals: the member whose entry an admin reversed.
-- ---------------------------------------------------------------------------
create or replace function trg_notify_reversal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.type = 'reversal' and new.created_by is distinct from new.member_id then
      perform notify_user(new.member_id, new.group_id, 'transaction.reversed', new.id,
        coalesce(notif_group_info(new.group_id), '{}'::jsonb)
          || jsonb_build_object('amount', abs(new.amount), 'reason', coalesce(new.description, '')));
    end if;
  exception when others then
    raise warning 'notification (transaction %) failed: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
drop trigger if exists notify_reversal on transactions;
create trigger notify_reversal after insert on transactions
  for each row when (new.type = 'reversal')
  execute function trg_notify_reversal();


-- ---------------------------------------------------------------------------
-- Complaints: admins hear of a new one (not the complainant, if an admin);
-- the member hears each status change.
-- ---------------------------------------------------------------------------
create or replace function trg_notify_complaint() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_params jsonb;
begin
  begin
    v_params := jsonb_build_object('subject', new.subject, 'name', notif_person_name(new.member_id));
    if tg_op = 'INSERT' then
      perform notify_group_admins(new.group_id, 'complaint.submitted', new.id, v_params, new.member_id);
    elsif old.status is distinct from new.status then
      perform notify_user(new.member_id, new.group_id, 'complaint.' || new.status, new.id, v_params);
    end if;
  exception when others then
    raise warning 'notification (complaint %) failed: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
drop trigger if exists notify_complaint on member_complaints;
create trigger notify_complaint after insert or update of status on member_complaints
  for each row execute function trg_notify_complaint();


-- Keep every helper and trigger function server-only.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'notif%' or p.proname like 'trg_notify_%')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
