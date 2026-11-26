-- GROUP BALANCE CHECKS (Usuluhishi / reconciliation comparison).
--
-- The group's balance is never stored: it is always the sum of its
-- transactions (CONTEXT.md). So comparing two of the app's own totals would
-- always agree and prove nothing. The meaningful check is the app's expected
-- balance against the money the group actually holds, which a Group Admin
-- counts from the real mobile-money / bank statement or cash box.
--
-- Each check is kept as a snapshot: expected_balance is computed by the
-- database at the moment of the check (never sent by the client), so a later
-- reversal does not rewrite history. A check never changes money; a
-- difference is investigated through the normal reconciliation cases and
-- reversals. Group-Admin-only, like the rest of Reconciliation.

create table if not exists group_balance_checks (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references groups(id),
  checked_by        uuid not null references profiles(id),
  expected_balance  numeric not null,
  actual_balance    numeric not null check (actual_balance >= 0),
  difference        numeric not null,          -- actual - expected
  note              text check (note is null or char_length(note) <= 1000),
  created_at        timestamptz not null default now()
);

create index if not exists group_balance_checks_group_idx
  on group_balance_checks (group_id, created_at desc);

alter table group_balance_checks enable row level security;

drop policy if exists group_balance_checks_select on group_balance_checks;
create policy group_balance_checks_select on group_balance_checks
  for select using (is_group_admin(group_id) or is_system_admin());
-- No insert/update/delete policies: clients cannot write directly.


create or replace function record_group_balance_check(
  p_group_id uuid,
  p_admin_id uuid,
  p_actual_balance numeric,
  p_note text
) returns group_balance_checks
language plpgsql
security definer set search_path = public
as $$
declare
  v_expected numeric;
  v_row group_balance_checks;
begin
  if not exists (
    select 1 from memberships
    where group_id = p_group_id and user_id = p_admin_id
      and role = 'group_admin' and status = 'active'
  ) then
    raise exception 'Only a Group Admin can record a balance check.';
  end if;
  if p_actual_balance is null or p_actual_balance < 0 then
    raise exception 'Enter the amount the group actually holds.';
  end if;

  select coalesce(sum(amount), 0) into v_expected from transactions where group_id = p_group_id;

  insert into group_balance_checks (group_id, checked_by, expected_balance, actual_balance, difference, note)
  values (p_group_id, p_admin_id, v_expected, p_actual_balance, p_actual_balance - v_expected,
          nullif(btrim(p_note), ''))
  returning * into v_row;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason, metadata)
  values (p_group_id, p_admin_id, 'balance_check.recorded', 'group_balance_check', v_row.id, v_row.note,
          jsonb_build_object('expected', v_row.expected_balance, 'actual', v_row.actual_balance,
                             'difference', v_row.difference));

  return v_row;
end;
$$;

-- Server only (see lock-down-function-grants.sql for why anon/authenticated
-- must be named explicitly).
revoke all on function record_group_balance_check(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function record_group_balance_check(uuid, uuid, numeric, text) to service_role;
