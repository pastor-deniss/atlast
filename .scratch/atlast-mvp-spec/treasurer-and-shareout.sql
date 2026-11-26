-- TREASURER ROLE AND YEAR-END PROFIT SHARE-OUT, 2026-11-26.
--
-- Decisions (product owner):
--   * A Treasurer is a member the Group Admin appoints (one per group; never
--     the admin, so money has two people on it). The Treasurer handles the
--     money side: transactions, reconciliation, balance checks, payouts of
--     approved loans, Jamii and charges, and the year-end share-out. Approving
--     members, loans, rates and reversals stays with the Group Admin.
--   * Year-end profit = loan interest + late penalties collected in the year
--     minus miscellaneous charges paid that year. Jamii is never included.
--   * Split by shares held at the end of the year (or at the moment of
--     preparing, for a year that has not ended yet); each share rounded down
--     to the shilling, the remainder stays in the fund.
--   * Paid out in cash to each member (savings untouched), recorded per
--     member as a `profit_share` ledger entry.
--   * Two-person rule: the Treasurer prepares, the Group Admin approves or
--     rejects; then payouts are recorded. Audited; members are notified.
--   * Year boundaries use East Africa Time (Africa/Dar_es_Salaam).

-- 1. Roles.
alter table memberships drop constraint if exists memberships_role_check;
alter table memberships add constraint memberships_role_check
  check (role = any (array['member', 'group_admin', 'treasurer']));

create or replace function is_group_treasurer(check_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.group_id = check_group_id and m.user_id = auth.uid()
                 and m.role = 'treasurer' and m.status = 'active')
$$;
revoke all on function is_group_treasurer(uuid) from public, anon;
grant execute on function is_group_treasurer(uuid) to authenticated, service_role;

-- The Treasurer may read the bookkeeping the admin reads.
drop policy if exists reconciliation_cases_select on reconciliation_cases;
create policy reconciliation_cases_select on reconciliation_cases for select
  using (is_group_admin(group_id) or is_group_treasurer(group_id) or is_system_admin());
drop policy if exists group_balance_checks_select on group_balance_checks;
create policy group_balance_checks_select on group_balance_checks for select
  using (is_group_admin(group_id) or is_group_treasurer(group_id) or is_system_admin());

-- The Treasurer may record balance checks and payouts of approved spending.
CREATE OR REPLACE FUNCTION public.record_group_balance_check(p_group_id uuid, p_admin_id uuid, p_actual_balance numeric, p_note text)
 RETURNS group_balance_checks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_expected numeric;
  v_row group_balance_checks;
begin
  if not exists (
    select 1 from memberships
    where group_id = p_group_id and user_id = p_admin_id
      and role in ('group_admin', 'treasurer') and status = 'active'
  ) then
    raise exception 'Only a Group Admin or the Treasurer can record a balance check.';
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
$function$
;

CREATE OR REPLACE FUNCTION public.pay_spend_request(p_request_id uuid, p_admin_id uuid, p_reference text, p_payment_method text)
 RETURNS group_spend_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req group_spend_requests;
  v_tx transactions;
  v_available numeric;
  v_group groups;
begin
  select * into v_req from group_spend_requests where id = p_request_id for update;
  if v_req is null then raise exception 'Request not found.'; end if;
  if not exists (select 1 from memberships where group_id = v_req.group_id and user_id = p_admin_id
                 and role in ('group_admin', 'treasurer') and status = 'active') then
    raise exception 'Only a Group Admin or the Treasurer can record a payout.';
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
$function$
;

-- Group Admin appoints or removes the Treasurer.
create or replace function set_member_role(p_group_id uuid, p_admin_id uuid, p_member_id uuid, p_role text)
returns memberships
language plpgsql security definer set search_path = public as $$
declare
  v_row memberships;
  v_group groups;
begin
  if not exists (select 1 from memberships where group_id = p_group_id and user_id = p_admin_id
                 and role = 'group_admin' and status = 'active') then
    raise exception 'Only a Group Admin can appoint the Treasurer.';
  end if;
  if p_role not in ('treasurer', 'member') then raise exception 'Unknown role.'; end if;
  select * into v_row from memberships where group_id = p_group_id and user_id = p_member_id and status = 'active' for update;
  if v_row is null then raise exception 'That person is not an active member of this group.'; end if;
  if v_row.role = 'group_admin' then raise exception 'A Group Admin cannot also be the Treasurer.'; end if;
  if v_row.role = p_role then return v_row; end if;

  if p_role = 'treasurer' then
    -- One Treasurer at a time: the previous one goes back to member.
    update memberships set role = 'member' where group_id = p_group_id and role = 'treasurer' and status = 'active';
  end if;
  update memberships set role = p_role where id = v_row.id returning * into v_row;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_group_id, p_admin_id, 'membership.role_changed', 'membership', v_row.id,
          jsonb_build_object('member', p_member_id, 'role', p_role));
  select * into v_group from groups where id = p_group_id;
  begin
    perform notify_user(p_member_id, p_group_id, 'membership.role_changed', v_row.id,
      jsonb_build_object('role', p_role, 'group', v_group.name));
  exception when others then raise warning 'notification (role %) failed: %', v_row.id, sqlerrm; end;
  return v_row;
end;
$$;
revoke all on function set_member_role(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function set_member_role(uuid, uuid, uuid, text) to service_role;


-- 2. Ledger: the profit-share payout entry.
alter table transactions drop constraint transactions_type_check;
alter table transactions add constraint transactions_type_check check (type = any (array[
  'contribution', 'loan_disbursement', 'repayment', 'reversal',
  'jamii_contribution', 'jamii_payout', 'group_expense', 'profit_share'
]));


-- 3. Share-outs.
create table if not exists profit_shareouts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  year integer not null check (year between 2000 and 2100),
  cutoff_at timestamptz not null,
  interest_income numeric not null,
  charges numeric not null,
  profit numeric not null,
  total_shares bigint not null,
  distributed numeric not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'completed')),
  prepared_by uuid not null references profiles(id),
  prepared_at timestamptz not null default now(),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,
  completed_at timestamptz
);
create unique index if not exists profit_shareouts_one_per_year
  on profit_shareouts (group_id, year) where status <> 'rejected';

create table if not exists profit_shareout_lines (
  shareout_id uuid not null references profit_shareouts(id) on delete cascade,
  member_id uuid not null references profiles(id),
  shares bigint not null,
  amount numeric not null,
  paid_at timestamptz,
  paid_by uuid references profiles(id),
  transaction_id uuid references transactions(id),
  primary key (shareout_id, member_id)
);

alter table profit_shareouts enable row level security;
alter table profit_shareout_lines enable row level security;
drop policy if exists profit_shareouts_select on profit_shareouts;
create policy profit_shareouts_select on profit_shareouts for select
  using (is_active_member(group_id) or is_system_admin());
drop policy if exists profit_shareout_lines_select on profit_shareout_lines;
create policy profit_shareout_lines_select on profit_shareout_lines for select
  using (exists (select 1 from profit_shareouts s where s.id = shareout_id
                 and (is_active_member(s.group_id) or is_system_admin())));
revoke all on profit_shareouts, profit_shareout_lines from anon;
grant select on profit_shareouts, profit_shareout_lines to authenticated;


-- 4. The numbers for a year. Interest and penalties are "earned" as
--    repayments go past a loan's principal: for each loan, what was repaid
--    above the principal by the end of the period, minus what was above it
--    by the start.
create or replace function shareout_numbers(p_group_id uuid, p_year integer)
returns table (cutoff_at timestamptz, interest_income numeric, charges numeric, profit numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_start timestamptz := make_timestamptz(p_year, 1, 1, 0, 0, 0, 'Africa/Dar_es_Salaam');
  v_end timestamptz := least(make_timestamptz(p_year + 1, 1, 1, 0, 0, 0, 'Africa/Dar_es_Salaam'), now());
  v_income numeric;
  v_charges numeric;
begin
  select coalesce(sum(greatest(0, loan_repaid_before(l.id, v_end) - l.principal)
                    - greatest(0, loan_repaid_before(l.id, v_start) - l.principal)), 0)
  into v_income
  from loans l where l.group_id = p_group_id and l.disbursed_at is not null and l.disbursed_at < v_end;

  select coalesce(-sum(t.amount), 0) into v_charges
  from transactions t
  left join transactions o on t.type = 'reversal' and o.id = t.reversed_transaction_id
  where t.group_id = p_group_id and coalesce(o.type, t.type) = 'group_expense'
    and t.created_at >= v_start and t.created_at < v_end;

  return query select v_end, v_income, v_charges, greatest(0, v_income - v_charges);
end;
$$;
revoke all on function shareout_numbers(uuid, integer) from public, anon, authenticated;
grant execute on function shareout_numbers(uuid, integer) to service_role;

-- Each active member's shares at the cutoff and their slice of the profit.
create or replace function shareout_lines_for(p_group_id uuid, p_cutoff timestamptz, p_profit numeric)
returns table (member_id uuid, shares bigint, amount numeric)
language sql stable security definer set search_path = public as $$
  with s as (
    select m.user_id, coalesce(sum(t.shares_earned), 0)::bigint as shares
    from memberships m
    left join transactions t on t.group_id = m.group_id and t.member_id = m.user_id and t.created_at < p_cutoff
    where m.group_id = p_group_id and m.status = 'active'
    group by m.user_id
  ), tot as (select sum(shares) as total from s where shares > 0)
  select s.user_id, s.shares,
         case when tot.total > 0 then floor(p_profit * s.shares / tot.total) else 0 end
  from s, tot where s.shares > 0
$$;
revoke all on function shareout_lines_for(uuid, timestamptz, numeric) from public, anon, authenticated;
grant execute on function shareout_lines_for(uuid, timestamptz, numeric) to service_role;

-- Preview for the Treasurer / Admin screen (nothing is saved).
create or replace function preview_profit_shareout(p_group_id uuid, p_year integer)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  n record;
  v_lines jsonb;
begin
  if not exists (select 1 from memberships where group_id = p_group_id and user_id = auth.uid()
                 and role in ('group_admin', 'treasurer') and status = 'active') then
    raise exception 'Only the Treasurer or a Group Admin can see this.';
  end if;
  select * into n from shareout_numbers(p_group_id, p_year);
  select coalesce(jsonb_agg(jsonb_build_object('member_id', l.member_id, 'name', notif_person_name(l.member_id),
                                               'shares', l.shares, 'amount', l.amount) order by l.amount desc), '[]'::jsonb)
  into v_lines from shareout_lines_for(p_group_id, n.cutoff_at, n.profit) l;
  return jsonb_build_object(
    'year', p_year, 'cutoff_at', n.cutoff_at, 'interest_income', n.interest_income, 'charges', n.charges,
    'profit', n.profit, 'lines', v_lines,
    'available', (select coalesce(balance, 0) from group_balances where group_id = p_group_id));
end;
$$;
revoke all on function preview_profit_shareout(uuid, integer) from public, anon;
grant execute on function preview_profit_shareout(uuid, integer) to authenticated, service_role;

-- Treasurer prepares (locks the numbers).
create or replace function prepare_profit_shareout(p_group_id uuid, p_treasurer_id uuid, p_year integer)
returns profit_shareouts
language plpgsql security definer set search_path = public as $$
declare
  n record;
  v_row profit_shareouts;
  v_total bigint;
  v_distributed numeric;
  v_group groups;
begin
  if not exists (select 1 from memberships where group_id = p_group_id and user_id = p_treasurer_id
                 and role = 'treasurer' and status = 'active') then
    raise exception 'Only the Treasurer can prepare the year-end share-out.';
  end if;
  if p_year > extract(year from now() at time zone 'Africa/Dar_es_Salaam') then
    raise exception 'That year has not started yet.';
  end if;
  if exists (select 1 from profit_shareouts where group_id = p_group_id and year = p_year and status <> 'rejected') then
    raise exception 'A share-out for % already exists.', p_year;
  end if;

  select * into n from shareout_numbers(p_group_id, p_year);
  if n.profit <= 0 then raise exception 'There is no profit to share for %.', p_year; end if;

  select coalesce(sum(shares), 0), coalesce(sum(amount), 0) into v_total, v_distributed
  from shareout_lines_for(p_group_id, n.cutoff_at, n.profit);
  if v_total <= 0 then raise exception 'No member held shares at the end of %.', p_year; end if;

  insert into profit_shareouts (group_id, year, cutoff_at, interest_income, charges, profit, total_shares, distributed, prepared_by)
  values (p_group_id, p_year, n.cutoff_at, n.interest_income, n.charges, n.profit, v_total, v_distributed, p_treasurer_id)
  returning * into v_row;
  insert into profit_shareout_lines (shareout_id, member_id, shares, amount)
  select v_row.id, l.member_id, l.shares, l.amount from shareout_lines_for(p_group_id, n.cutoff_at, n.profit) l
  where l.amount > 0;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_group_id, p_treasurer_id, 'shareout.prepared', 'profit_shareout', v_row.id,
          jsonb_build_object('year', p_year, 'profit', n.profit, 'distributed', v_distributed));
  select * into v_group from groups where id = p_group_id;
  begin
    perform notify_group_admins(p_group_id, 'shareout.prepared', v_row.id,
      jsonb_build_object('year', p_year, 'amount', v_distributed, 'currency', v_group.currency), p_treasurer_id);
  exception when others then raise warning 'notification (shareout %) failed: %', v_row.id, sqlerrm; end;
  return v_row;
end;
$$;
revoke all on function prepare_profit_shareout(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function prepare_profit_shareout(uuid, uuid, integer) to service_role;

-- Group Admin approves or rejects.
create or replace function decide_profit_shareout(p_shareout_id uuid, p_admin_id uuid, p_decision text, p_note text)
returns profit_shareouts
language plpgsql security definer set search_path = public as $$
declare
  v_row profit_shareouts;
  v_group groups;
  l record;
begin
  select * into v_row from profit_shareouts where id = p_shareout_id for update;
  if v_row is null then raise exception 'Share-out not found.'; end if;
  if not exists (select 1 from memberships where group_id = v_row.group_id and user_id = p_admin_id
                 and role = 'group_admin' and status = 'active') then
    raise exception 'Only a Group Admin can approve the share-out.';
  end if;
  if v_row.status <> 'proposed' then raise exception 'This share-out has already been decided.'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Invalid decision.'; end if;
  if p_decision = 'reject' and char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Say why you are rejecting it.';
  end if;

  update profit_shareouts
  set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      decided_by = p_admin_id, decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_shareout_id returning * into v_row;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason, metadata)
  values (v_row.group_id, p_admin_id, case when p_decision = 'approve' then 'shareout.approved' else 'shareout.rejected' end, 'profit_shareout', v_row.id, v_row.decision_note,
          jsonb_build_object('year', v_row.year, 'distributed', v_row.distributed));

  select * into v_group from groups where id = v_row.group_id;
  begin
    if p_decision = 'approve' then
      for l in select * from profit_shareout_lines where shareout_id = v_row.id loop
        perform notify_user(l.member_id, v_row.group_id, 'shareout.approved', v_row.id,
          jsonb_build_object('year', v_row.year, 'amount', l.amount, 'currency', v_group.currency));
      end loop;
    else
      perform notify_user(v_row.prepared_by, v_row.group_id, 'shareout.rejected', v_row.id,
        jsonb_build_object('year', v_row.year, 'reason', v_row.decision_note));
    end if;
  exception when others then raise warning 'notification (shareout decision %) failed: %', v_row.id, sqlerrm; end;
  return v_row;
end;
$$;
revoke all on function decide_profit_shareout(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function decide_profit_shareout(uuid, uuid, text, text) to service_role;

-- Treasurer (or Admin) records one member's cash payout.
create or replace function pay_profit_share(
  p_shareout_id uuid, p_member_id uuid, p_officer_id uuid, p_reference text, p_payment_method text
) returns profit_shareout_lines
language plpgsql security definer set search_path = public as $$
declare
  v_row profit_shareouts;
  v_line profit_shareout_lines;
  v_tx transactions;
  v_available numeric;
  v_group groups;
begin
  select * into v_row from profit_shareouts where id = p_shareout_id for update;
  if v_row is null then raise exception 'Share-out not found.'; end if;
  if not exists (select 1 from memberships where group_id = v_row.group_id and user_id = p_officer_id
                 and role in ('group_admin', 'treasurer') and status = 'active') then
    raise exception 'Only the Treasurer or a Group Admin can record a payout.';
  end if;
  if v_row.status <> 'approved' then raise exception 'The share-out must be approved before paying.'; end if;
  select * into v_line from profit_shareout_lines where shareout_id = p_shareout_id and member_id = p_member_id for update;
  if v_line is null then raise exception 'This member has no share in this share-out.'; end if;
  if v_line.paid_at is not null then raise exception 'This share has already been paid.'; end if;

  select coalesce(balance, 0) into v_available from group_balances where group_id = v_row.group_id;
  if v_line.amount > coalesce(v_available, 0) then
    raise exception 'Not enough money in the group fund: only % available.', coalesce(v_available, 0);
  end if;

  insert into transactions (group_id, member_id, type, amount, status, reference, description, payment_method, created_by)
  values (v_row.group_id, p_member_id, 'profit_share', -v_line.amount, 'posted', nullif(btrim(coalesce(p_reference, '')), ''),
          'Profit share ' || v_row.year, p_payment_method, p_officer_id)
  returning * into v_tx;

  update profit_shareout_lines set paid_at = now(), paid_by = p_officer_id, transaction_id = v_tx.id
  where shareout_id = p_shareout_id and member_id = p_member_id returning * into v_line;

  if not exists (select 1 from profit_shareout_lines where shareout_id = p_shareout_id and paid_at is null) then
    update profit_shareouts set status = 'completed', completed_at = now() where id = p_shareout_id;
  end if;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_row.group_id, p_officer_id, 'shareout.paid', 'profit_shareout', v_row.id,
          jsonb_build_object('member', p_member_id, 'amount', v_line.amount, 'transaction', v_tx.id));
  select * into v_group from groups where id = v_row.group_id;
  begin
    perform notify_user(p_member_id, v_row.group_id, 'shareout.paid', v_row.id,
      jsonb_build_object('year', v_row.year, 'amount', v_line.amount, 'currency', v_group.currency));
  exception when others then raise warning 'notification (share paid %) failed: %', v_row.id, sqlerrm; end;
  return v_line;
end;
$$;
revoke all on function pay_profit_share(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function pay_profit_share(uuid, uuid, uuid, text, text) to service_role;
