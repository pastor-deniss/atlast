-- MEMBER COMPLAINTS (Malalamiko): a member raises a problem with their
-- records (a missing contribution, a wrong amount, a loan issue, ...) and a
-- Group Admin answers it.
--
-- Private between the member and the group's admins -- unlike the ledger,
-- which every member can see (financial transparency). A complaint never
-- changes money: a confirmed mistake is still fixed through the normal
-- reversal mechanism; this table tracks the conversation and the outcome.
--
-- Reads go through RLS. Writes only through the submit-complaint and
-- respond-to-complaint Edge Functions (service_role), which call the
-- functions below; every admin response also writes an audit event.

create table if not exists member_complaints (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references groups(id),
  member_id       uuid not null references profiles(id),
  category        text not null
                    check (category in ('missing_contribution', 'wrong_amount', 'loan', 'other')),
  transaction_id  uuid references transactions(id),   -- optional: the entry it is about
  subject         text not null check (char_length(subject) between 1 and 120),
  details         text not null check (char_length(details) between 1 and 2000),
  status          text not null default 'open'
                    check (status in ('open', 'in_review', 'resolved', 'rejected')),
  admin_response  text check (admin_response is null or char_length(admin_response) <= 2000),
  responded_by    uuid references profiles(id),
  responded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists member_complaints_group_status_idx
  on member_complaints (group_id, status, created_at desc);
create index if not exists member_complaints_member_idx
  on member_complaints (member_id, created_at desc);

alter table member_complaints enable row level security;

drop policy if exists member_complaints_select on member_complaints;
create policy member_complaints_select on member_complaints
  for select using (
    member_id = auth.uid() or is_group_admin(group_id) or is_system_admin()
  );
-- No insert/update/delete policies: clients cannot write directly.


create or replace function submit_member_complaint(
  p_group_id uuid,
  p_member_id uuid,
  p_category text,
  p_transaction_id uuid,
  p_subject text,
  p_details text
) returns member_complaints
language plpgsql
security definer set search_path = public
as $$
declare
  v_row member_complaints;
begin
  if not exists (
    select 1 from memberships
    where group_id = p_group_id and user_id = p_member_id and status = 'active'
  ) then
    raise exception 'Only an active member of this group can file a complaint.';
  end if;

  if p_transaction_id is not null and not exists (
    select 1 from transactions
    where id = p_transaction_id and group_id = p_group_id and member_id = p_member_id
  ) then
    raise exception 'That transaction is not one of yours in this group.';
  end if;

  insert into member_complaints (group_id, member_id, category, transaction_id, subject, details)
  values (p_group_id, p_member_id, p_category, p_transaction_id, btrim(p_subject), btrim(p_details))
  returning * into v_row;

  return v_row;
end;
$$;


create or replace function respond_to_member_complaint(
  p_complaint_id uuid,
  p_admin_id uuid,
  p_status text,
  p_response text
) returns member_complaints
language plpgsql
security definer set search_path = public
as $$
declare
  v_row member_complaints;
begin
  select * into v_row from member_complaints where id = p_complaint_id for update;
  if v_row is null then raise exception 'Complaint not found.'; end if;

  if not exists (
    select 1 from memberships
    where group_id = v_row.group_id and user_id = p_admin_id
      and role = 'group_admin' and status = 'active'
  ) then
    raise exception 'Only a Group Admin can respond to complaints.';
  end if;
  if v_row.member_id = p_admin_id then
    raise exception 'Another Group Admin must respond to your own complaint.';
  end if;
  if v_row.status in ('resolved', 'rejected') then
    raise exception 'This complaint has already been closed.';
  end if;
  if p_status not in ('in_review', 'resolved', 'rejected') then
    raise exception 'Invalid status.';
  end if;
  if p_status in ('resolved', 'rejected') and coalesce(btrim(p_response), '') = '' then
    raise exception 'Write a response to the member before closing the complaint.';
  end if;

  update member_complaints
  set status = p_status,
      admin_response = coalesce(nullif(btrim(p_response), ''), admin_response),
      responded_by = p_admin_id,
      responded_at = now(),
      updated_at = now()
  where id = p_complaint_id
  returning * into v_row;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason, metadata)
  values (v_row.group_id, p_admin_id, 'complaint.' || p_status, 'member_complaint', v_row.id,
          nullif(btrim(p_response), ''), jsonb_build_object('category', v_row.category));

  return v_row;
end;
$$;

-- Server only. Supabase grants anon/authenticated directly, so revoking from
-- PUBLIC alone is not enough (see lock-down-function-grants.sql).
revoke all on function submit_member_complaint(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function submit_member_complaint(uuid, uuid, text, uuid, text, text) to service_role;
revoke all on function respond_to_member_complaint(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function respond_to_member_complaint(uuid, uuid, text, text) to service_role;
