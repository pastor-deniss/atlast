-- Ticket 17 — Postgres functions backing the loan Edge Functions.
-- Same pattern ticket 13 already established for resolve_motion_if_settled:
-- multi-step / atomicity-sensitive operations live in a single plpgsql
-- function (one function call = one transaction) rather than several
-- sequential client-side calls. Edge Functions are thin wrappers that do
-- auth/role checks, then call these via supabaseAdmin.rpc(...).
--
-- SECURITY: security definer functions default to PUBLIC execute privilege
-- in Postgres. That would let any authenticated client call these directly
-- via RPC, bypassing the Edge Function's auth/role checks entirely — so
-- every function here explicitly revokes PUBLIC/authenticated/anon execute
-- and grants only to service_role.

create or replace function request_loan(
  p_borrower_id uuid,
  p_group_id uuid,
  p_principal numeric,
  p_purpose text,
  p_term_weeks integer
) returns loans
language plpgsql
security definer set search_path = public
as $$
declare
  v_eligible numeric;
  v_open_count integer;
  v_review_mode text;
  v_loan loans;
  v_pool uuid[];
begin
  select count(*) into v_open_count
  from loans
  where borrower_id = p_borrower_id and group_id = p_group_id
    and status in ('pending_review', 'approved', 'disbursed', 'repaying');
  if v_open_count > 0 then
    raise exception 'You already have an open loan in this group.';
  end if;

  if p_principal is null or p_principal <= 0 or p_term_weeks is null or p_term_weeks <= 0 then
    raise exception 'Invalid principal or term.';
  end if;

  select eligible_amount into v_eligible
  from loan_eligibility
  where member_id = p_borrower_id and group_id = p_group_id;

  if p_principal > coalesce(v_eligible, 0) then
    raise exception 'Requested amount exceeds your eligible amount.';
  end if;

  -- Random reviewer pool: eligible (>=1 repaid loan, 0 defaults), excluding
  -- the borrower and anyone with their own currently-open loan (ticket 05/10).
  select array_agg(member_id) into v_pool
  from (
    select lre.member_id
    from loan_reviewer_eligibility lre
    where lre.group_id = p_group_id
      and lre.member_id != p_borrower_id
      and not exists (
        select 1 from loans l2
        where l2.borrower_id = lre.member_id and l2.group_id = p_group_id
          and l2.status in ('pending_review', 'approved', 'disbursed', 'repaying')
      )
    order by random()
    limit 3
  ) eligible_pool;

  v_review_mode := case when coalesce(array_length(v_pool, 1), 0) >= 3 then 'three_eye' else 'admin_fallback' end;

  insert into loans (group_id, borrower_id, principal, purpose, term_weeks, installment_amount, status, review_mode)
  values (p_group_id, p_borrower_id, p_principal, p_purpose, p_term_weeks, p_principal / p_term_weeks, 'pending_review', v_review_mode)
  returning * into v_loan;

  if v_review_mode = 'three_eye' then
    insert into loan_reviewers (loan_id, reviewer_id)
    select v_loan.id, unnest(v_pool);
  end if;

  return v_loan;
end;
$$;
revoke all on function request_loan(uuid, uuid, numeric, text, integer) from public;
grant execute on function request_loan(uuid, uuid, numeric, text, integer) to service_role;


create or replace function cast_loan_review_decision(
  p_loan_id uuid,
  p_reviewer_id uuid,
  p_decision text
) returns loans
language plpgsql
security definer set search_path = public
as $$
declare
  v_loan loans;
  v_approve_count integer;
  v_decline_count integer;
begin
  if p_decision not in ('approve', 'decline') then
    raise exception 'Invalid decision.';
  end if;

  select * into v_loan from loans where id = p_loan_id for update;
  if v_loan is null then raise exception 'Loan not found.'; end if;
  if v_loan.review_mode != 'three_eye' then raise exception 'This loan is not under Three-Eye review.'; end if;
  if v_loan.status != 'pending_review' then raise exception 'This loan has already been decided.'; end if;

  update loan_reviewers
  set decision = p_decision, decided_at = now()
  where loan_id = p_loan_id and reviewer_id = p_reviewer_id and decision = 'pending';

  if not found then
    raise exception 'You are not an assigned reviewer, or you have already voted.';
  end if;

  select count(*) filter (where decision = 'approve'), count(*) filter (where decision = 'decline')
  into v_approve_count, v_decline_count
  from loan_reviewers where loan_id = p_loan_id;

  -- Fail-fast: resolve the instant 2-of-3 is reached, don't wait for the third.
  if v_approve_count >= 2 then
    update loans set status = 'approved', decided_at = now() where id = p_loan_id returning * into v_loan;
  elsif v_decline_count >= 2 then
    update loans set status = 'declined', decided_at = now() where id = p_loan_id returning * into v_loan;
  else
    select * into v_loan from loans where id = p_loan_id;
  end if;

  return v_loan;
end;
$$;
revoke all on function cast_loan_review_decision(uuid, uuid, text) from public;
grant execute on function cast_loan_review_decision(uuid, uuid, text) to service_role;


create or replace function admin_decide_loan(
  p_loan_id uuid,
  p_admin_id uuid,
  p_decision text
) returns loans
language plpgsql
security definer set search_path = public
as $$
declare
  v_loan loans;
begin
  if p_decision not in ('approve', 'decline') then raise exception 'Invalid decision.'; end if;

  select * into v_loan from loans where id = p_loan_id for update;
  if v_loan is null then raise exception 'Loan not found.'; end if;
  if v_loan.review_mode != 'admin_fallback' then raise exception 'This loan is not in admin fallback review.'; end if;
  if v_loan.status != 'pending_review' then raise exception 'This loan has already been decided.'; end if;

  update loans
  set status = case when p_decision = 'approve' then 'approved' else 'declined' end,
      decided_at = now(),
      decided_by = p_admin_id
  where id = p_loan_id
  returning * into v_loan;

  return v_loan;
end;
$$;
revoke all on function admin_decide_loan(uuid, uuid, text) from public;
grant execute on function admin_decide_loan(uuid, uuid, text) to service_role;


create or replace function disburse_loan(
  p_loan_id uuid,
  p_admin_id uuid
) returns loans
language plpgsql
security definer set search_path = public
as $$
declare
  v_loan loans;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if v_loan is null then raise exception 'Loan not found.'; end if;
  if v_loan.status != 'approved' then raise exception 'Only approved loans can be disbursed.'; end if;

  insert into transactions (group_id, member_id, loan_id, type, amount, status, created_by)
  values (v_loan.group_id, v_loan.borrower_id, v_loan.id, 'loan_disbursement', -v_loan.principal, 'posted', p_admin_id);

  update loans set status = 'disbursed', disbursed_at = now() where id = p_loan_id returning * into v_loan;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_loan.group_id, p_admin_id, 'loan.disbursed', 'loan', v_loan.id, jsonb_build_object('amount', v_loan.principal));

  return v_loan;
end;
$$;
revoke all on function disburse_loan(uuid, uuid) from public;
grant execute on function disburse_loan(uuid, uuid) to service_role;


create or replace function record_loan_repayment(
  p_loan_id uuid,
  p_member_id uuid,
  p_amount numeric,
  p_reference text
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

  insert into transactions (group_id, member_id, loan_id, type, amount, status, reference, created_by)
  values (v_loan.group_id, v_loan.borrower_id, v_loan.id, 'repayment', p_amount, 'posted', p_reference, p_member_id);

  if (coalesce(v_repaid, 0) + p_amount) >= v_loan.principal then
    update loans set status = 'repaid' where id = p_loan_id returning * into v_loan;
  else
    update loans set status = 'repaying' where id = p_loan_id returning * into v_loan;
  end if;

  return v_loan;
end;
$$;
revoke all on function record_loan_repayment(uuid, uuid, numeric, text) from public;
grant execute on function record_loan_repayment(uuid, uuid, numeric, text) to service_role;


create or replace function flag_loan_default(
  p_loan_id uuid,
  p_admin_id uuid,
  p_reason text
) returns loans
language plpgsql
security definer set search_path = public
as $$
declare
  v_loan loans;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if v_loan is null then raise exception 'Loan not found.'; end if;
  if v_loan.status not in ('disbursed', 'repaying') then
    raise exception 'Only disbursed/repaying loans can be defaulted.';
  end if;

  update loans set status = 'defaulted', defaulted_at = now(), defaulted_by = p_admin_id
  where id = p_loan_id returning * into v_loan;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason)
  values (v_loan.group_id, p_admin_id, 'loan.defaulted', 'loan', v_loan.id, p_reason);

  return v_loan;
end;
$$;
revoke all on function flag_loan_default(uuid, uuid, text) from public;
grant execute on function flag_loan_default(uuid, uuid, text) to service_role;
