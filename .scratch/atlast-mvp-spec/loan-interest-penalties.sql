-- LOAN INTEREST (Riba) AND LATE PENALTIES (Adhabu), 2026-11-26.
-- Replaces V1's zero-interest, zero-fee rule at the product owner's request.
--
-- Decisions (product owner):
--   * Interest: a flat % of the amount borrowed, charged once. Member repays
--     principal + interest. E.g. 10% of TZS 100,000 -> repay TZS 110,000.
--   * Penalty: each full week past the due date adds a % of the amount still
--     owed (principal + interest - repaid). Not compounded: penalties are
--     never charged on earlier penalties. Stops once nothing is owed, and at
--     the moment a loan is flagged as defaulted.
--   * Due date = disbursed_at + term_weeks.
--   * The Group Admin sets both rates; every change is audited and members
--     are notified. A loan keeps the rates of the moment it was requested.
--   * Interest and penalties are paid through ordinary repayments, so the
--     extra money lands in the group fund through the ledger like any other
--     repayment. Nothing is stored as a balance: what a borrower owes is
--     derived (loan_dues view), like every other balance in Atlast.
--
-- Existing groups start at 0% / 0%, so nothing changes until an admin sets
-- rates; existing loans keep 0% / 0%.

alter table groups
  add column if not exists loan_interest_rate numeric not null default 0
    check (loan_interest_rate >= 0 and loan_interest_rate <= 100),
  add column if not exists late_penalty_weekly_rate numeric not null default 0
    check (late_penalty_weekly_rate >= 0 and late_penalty_weekly_rate <= 20);

alter table loans
  add column if not exists interest_rate numeric not null default 0,
  add column if not exists penalty_weekly_rate numeric not null default 0,
  add column if not exists interest_amount numeric not null default 0;


-- Lock the group's current rates onto each new loan. A trigger rather than a
-- change to request_loan(), so every way a loan is created gets the same rule.
create or replace function trg_lock_loan_rates() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_group groups;
begin
  select * into v_group from groups where id = new.group_id;
  new.interest_rate := coalesce(v_group.loan_interest_rate, 0);
  new.penalty_weekly_rate := coalesce(v_group.late_penalty_weekly_rate, 0);
  new.interest_amount := round(new.principal * new.interest_rate / 100);
  -- The weekly installment now covers principal + interest.
  new.installment_amount := round((new.principal + new.interest_amount) / new.term_weeks);
  return new;
end;
$$;
drop trigger if exists lock_loan_rates on loans;
create trigger lock_loan_rates before insert on loans
  for each row execute function trg_lock_loan_rates();


-- Repayments (net of reversed repayments) recorded before a moment.
create or replace function loan_repaid_before(p_loan_id uuid, p_before timestamptz) returns numeric
language sql stable set search_path = public as $$
  select coalesce(sum(t.amount), 0)
  from transactions t
  left join transactions o on o.id = t.reversed_transaction_id
  where t.loan_id = p_loan_id
    and t.created_at < p_before
    and (t.type = 'repayment' or (t.type = 'reversal' and o.type = 'repayment'))
$$;

-- Late penalty accrued by a moment: for each full week k past the due date,
-- rate% of what was still owed (principal + interest - repaid) at due + k weeks.
create or replace function loan_penalty_as_of(p_loan loans, p_as_of timestamptz) returns numeric
language plpgsql stable set search_path = public as $$
declare
  v_due timestamptz;
  v_stop timestamptz;
  v_weeks integer;
begin
  if p_loan.disbursed_at is null or coalesce(p_loan.penalty_weekly_rate, 0) <= 0 then
    return 0;
  end if;
  v_due := p_loan.disbursed_at + make_interval(days => p_loan.term_weeks * 7);
  v_stop := least(p_as_of, coalesce(p_loan.defaulted_at, p_as_of));
  v_weeks := least(520, floor(extract(epoch from (v_stop - v_due)) / 604800)::integer);
  if v_weeks < 1 then
    return 0;
  end if;
  return coalesce((
    select sum(round(p_loan.penalty_weekly_rate / 100 *
             greatest(0, p_loan.principal + p_loan.interest_amount
                         - loan_repaid_before(p_loan.id, v_due + make_interval(days => k * 7)))))
    from generate_series(1, v_weeks) as k
  ), 0);
end;
$$;

-- What each loan costs and what is still owed, right now. security_invoker:
-- callers see exactly the loans RLS lets them see.
create or replace view loan_dues with (security_invoker = true) as
select
  l.id as loan_id,
  l.group_id,
  l.borrower_id,
  l.status,
  l.principal,
  l.interest_rate,
  l.interest_amount,
  l.penalty_weekly_rate,
  case when l.disbursed_at is not null
       then l.disbursed_at + make_interval(days => l.term_weeks * 7) end as due_at,
  pen.penalty,
  rep.repaid,
  l.principal + l.interest_amount + pen.penalty as total_due,
  greatest(0, l.principal + l.interest_amount + pen.penalty - rep.repaid) as outstanding,
  (l.status in ('disbursed', 'repaying')
    and l.disbursed_at + make_interval(days => l.term_weeks * 7) < now()
    and l.principal + l.interest_amount + pen.penalty - rep.repaid > 0) as is_overdue
from loans l
cross join lateral (select loan_repaid_before(l.id, 'infinity') as repaid) rep
cross join lateral (select loan_penalty_as_of(l, now()) as penalty) pen;

revoke all on loan_dues from anon;
grant select on loan_dues to authenticated;

-- A member's total still owed on loans at a moment (statements for past
-- periods). security invoker: RLS decides what the caller may see.
create or replace function member_loans_outstanding_as_of(
  p_group_id uuid, p_member_id uuid, p_as_of timestamptz
) returns numeric
language sql stable set search_path = public as $$
  select coalesce(sum(greatest(0,
           l.principal + l.interest_amount + loan_penalty_as_of(l, p_as_of)
           - loan_repaid_before(l.id, p_as_of))), 0)
  from loans l
  where l.group_id = p_group_id and l.borrower_id = p_member_id
    and l.disbursed_at is not null and l.disbursed_at < p_as_of
$$;

revoke all on function loan_repaid_before(uuid, timestamptz) from public, anon;
revoke all on function loan_penalty_as_of(loans, timestamptz) from public, anon;
revoke all on function member_loans_outstanding_as_of(uuid, uuid, timestamptz) from public, anon;
grant execute on function loan_repaid_before(uuid, timestamptz) to authenticated, service_role;
grant execute on function loan_penalty_as_of(loans, timestamptz) to authenticated, service_role;
grant execute on function member_loans_outstanding_as_of(uuid, uuid, timestamptz) to authenticated, service_role;
revoke all on function trg_lock_loan_rates() from public, anon, authenticated;


-- Repayments now cap at, and close the loan on, the full amount owed:
-- principal + interest + penalties so far.
create or replace function record_loan_repayment(
  p_loan_id uuid,
  p_member_id uuid,
  p_amount numeric,
  p_reference text,
  p_payment_method text default null
) returns loans
language plpgsql
security definer set search_path = public
as $$
declare
  v_loan loans;
  v_repaid numeric;
  v_total_due numeric;
  v_outstanding numeric;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if v_loan is null then raise exception 'Loan not found.'; end if;
  if v_loan.borrower_id != p_member_id then raise exception 'You can only repay your own loan.'; end if;
  if v_loan.status not in ('disbursed', 'repaying') then raise exception 'This loan is not currently repayable.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive.'; end if;

  v_repaid := loan_repaid_before(p_loan_id, 'infinity');
  v_total_due := v_loan.principal + v_loan.interest_amount + loan_penalty_as_of(v_loan, now());
  v_outstanding := v_total_due - v_repaid;

  if p_amount > v_outstanding then
    raise exception 'Amount exceeds the outstanding balance of %.', v_outstanding;
  end if;

  insert into transactions (group_id, member_id, loan_id, type, amount, status, reference, payment_method, created_by)
  values (v_loan.group_id, v_loan.borrower_id, v_loan.id, 'repayment', p_amount, 'posted',
          nullif(btrim(p_reference), ''), p_payment_method, p_member_id);

  if v_repaid + p_amount >= v_total_due then
    update loans set status = 'repaid' where id = p_loan_id returning * into v_loan;
  else
    update loans set status = 'repaying' where id = p_loan_id returning * into v_loan;
  end if;

  return v_loan;
end;
$$;
revoke all on function record_loan_repayment(uuid, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function record_loan_repayment(uuid, uuid, numeric, text, text) to service_role;


-- Group Admin sets the rates. Audited, and every active member is told.
create or replace function set_group_loan_rates(
  p_group_id uuid,
  p_admin_id uuid,
  p_interest_rate numeric,
  p_penalty_weekly_rate numeric
) returns groups
language plpgsql
security definer set search_path = public
as $$
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
$$;
revoke all on function set_group_loan_rates(uuid, uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function set_group_loan_rates(uuid, uuid, numeric, numeric) to service_role;
