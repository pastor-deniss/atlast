-- PAYMENT METHOD (2026-11-26). Members now say how they paid a contribution
-- or loan repayment: M-Pesa, Airtel Money, Tigo Pesa or Cash. This replaces
-- ticket 16's fixed "Mobile Money".
--
-- Rows recorded before this change keep payment_method = NULL and show as
-- "Mobile Money". It is TEXT + CHECK, like transactions.type, so a provider
-- (e.g. HaloPesa, bank) is added later by widening the CHECK.
--
-- A reference is still required for mobile money (the confirmation code,
-- protected by the duplicate-reference guard). For cash it is optional: a
-- receipt number if the member got one. Cash posts immediately like every
-- other contribution; the group balance check (group-balance-checks.sql)
-- and reconciliation are how it is verified.

alter table transactions
  add column if not exists payment_method text
    check (payment_method is null or payment_method in ('mpesa', 'airtel_money', 'tigo_pesa', 'cash'));


-- record_loan_repayment gains p_payment_method. The default keeps the
-- currently deployed Edge Function (which sends 4 named arguments) working
-- during the switchover; the old 4-argument version is dropped so PostgREST
-- has exactly one candidate.
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
  v_outstanding numeric;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if v_loan is null then raise exception 'Loan not found.'; end if;
  if v_loan.borrower_id != p_member_id then raise exception 'You can only repay your own loan.'; end if;
  if v_loan.status not in ('disbursed', 'repaying') then raise exception 'This loan is not currently repayable.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive.'; end if;

  select coalesce(total_repaid, 0) into v_repaid from loan_balances where loan_id = p_loan_id;
  v_outstanding := v_loan.principal - coalesce(v_repaid, 0);

  if p_amount > v_outstanding then
    raise exception 'Amount exceeds the outstanding balance of %.', v_outstanding;
  end if;

  insert into transactions (group_id, member_id, loan_id, type, amount, status, reference, payment_method, created_by)
  values (v_loan.group_id, v_loan.borrower_id, v_loan.id, 'repayment', p_amount, 'posted',
          nullif(btrim(p_reference), ''), p_payment_method, p_member_id);

  if (coalesce(v_repaid, 0) + p_amount) >= v_loan.principal then
    update loans set status = 'repaid' where id = p_loan_id returning * into v_loan;
  else
    update loans set status = 'repaying' where id = p_loan_id returning * into v_loan;
  end if;

  return v_loan;
end;
$$;

drop function if exists record_loan_repayment(uuid, uuid, numeric, text);

revoke all on function record_loan_repayment(uuid, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function record_loan_repayment(uuid, uuid, numeric, text, text) to service_role;
