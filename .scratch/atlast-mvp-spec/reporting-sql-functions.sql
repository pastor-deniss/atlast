-- Ticket 19 — Postgres functions backing the reporting/reconciliation Edge
-- Functions. Same pattern tickets 13/17/18 already established: multi-step /
-- atomicity-sensitive operations live in a single plpgsql function (one
-- function call = one transaction). Edge Functions are thin wrappers that do
-- auth/role checks, then call these via supabaseAdmin.rpc(...).
--
-- No new tables or views (ticket 19's own conclusion): reconciliation_cases
-- and audit_events already exist (ticket 13); Reports and the Financial
-- Dashboard read the existing group_balances/member_contribution_totals/
-- loan_balances views directly, so nothing below backs those screens.
--
-- SECURITY: security definer functions default to PUBLIC execute privilege
-- in Postgres. That would let any authenticated client call these directly
-- via RPC, bypassing the Edge Function's auth/role checks entirely — so
-- every function here explicitly revokes PUBLIC/authenticated/anon execute
-- and grants only to service_role.

-- reverseTransaction (ticket 13). The only way a posted ledger entry is ever
-- corrected — transactions are never edited/deleted (ticket 03/09). Guards
-- against reversing a reversal and against double-reversing the same row;
-- everything else about the original transaction (group, member, loan link)
-- is inherited so the compensating row always nets the ledger back to zero.
create or replace function reverse_transaction(
  p_transaction_id uuid,
  p_admin_id uuid,
  p_reason text
) returns transactions
language plpgsql
security definer set search_path = public
as $$
declare
  v_original transactions;
  v_reversal transactions;
begin
  select * into v_original from transactions where id = p_transaction_id for update;
  if v_original is null then raise exception 'Transaction not found.'; end if;
  if v_original.type = 'reversal' then
    raise exception 'A reversal cannot itself be reversed.';
  end if;
  if exists (select 1 from transactions where reversed_transaction_id = p_transaction_id) then
    raise exception 'Transaction has already been reversed.';
  end if;

  insert into transactions (
    group_id, member_id, loan_id, type, amount, shares_earned, status,
    reference, description, reversed_transaction_id, created_by
  )
  values (
    v_original.group_id, v_original.member_id, v_original.loan_id, 'reversal',
    -v_original.amount, -v_original.shares_earned, 'posted',
    v_original.reference, p_reason, v_original.id, p_admin_id
  )
  returning * into v_reversal;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason)
  values (v_original.group_id, p_admin_id, 'transaction.reversed', 'transaction', v_original.id, p_reason);

  return v_reversal;
end;
$$;
revoke all on function reverse_transaction(uuid, uuid, text) from public;
grant execute on function reverse_transaction(uuid, uuid, text) to service_role;

-- submitReconciliationRecord (ticket 13). Manual entry of the provider
-- statement (V1 has no automated import, ticket 03) — matches immediately
-- or opens an investigate case. No audit_events row here: this is a routine
-- data-entry step, not the discretionary/corrective action (that's the
-- resolve step below) — matches ticket 13 Q3's narrow-audit-log stance.
create or replace function submit_reconciliation_record(
  p_transaction_id uuid,
  p_provider text,
  p_provider_reference text,
  p_provider_amount numeric,
  p_provider_timestamp timestamptz
) returns reconciliation_cases
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn transactions;
  v_case reconciliation_cases;
  v_status text;
  v_discrepancy text;
begin
  select * into v_txn from transactions where id = p_transaction_id for update;
  if v_txn is null then raise exception 'Transaction not found.'; end if;
  if v_txn.status = 'reconciled' then
    raise exception 'Transaction is already reconciled.';
  end if;

  if p_provider_amount = abs(v_txn.amount) then
    v_status := 'matched';
    v_discrepancy := null;
  else
    v_status := 'investigate';
    v_discrepancy := format(
      'Recorded %s vs provider %s (difference %s)',
      abs(v_txn.amount), p_provider_amount, abs(v_txn.amount) - p_provider_amount
    );
  end if;

  insert into reconciliation_cases (
    group_id, transaction_id, provider, provider_reference, provider_amount,
    provider_timestamp, status, discrepancy_reason
  )
  values (
    v_txn.group_id, v_txn.id, p_provider, p_provider_reference, p_provider_amount,
    p_provider_timestamp, v_status, v_discrepancy
  )
  returning * into v_case;

  -- transactions.status has no 'matched' value (ticket 09) — a clean match
  -- reconciles the transaction immediately; a mismatch flags it for
  -- investigation until resolve_reconciliation_case below closes the loop.
  update transactions
  set status = case when v_status = 'matched' then 'reconciled' else 'investigate' end
  where id = p_transaction_id;

  return v_case;
end;
$$;
revoke all on function submit_reconciliation_record(uuid, text, text, numeric, timestamptz) from public;
grant execute on function submit_reconciliation_record(uuid, text, text, numeric, timestamptz) to service_role;

-- resolveReconciliationCase (ticket 13). The discretionary/corrective step:
-- Admin/Treasurer closes an investigate case out as either 'matched' (the
-- discrepancy turned out to be a data-entry slip, no ledger correction
-- needed) or 'resolved' (explained, and separately corrected via a
-- reverseTransaction call — this function never issues the correction
-- itself). Only 'resolved' writes an audit_events row (ticket 13's exact
-- wording); either outcome reconciles the underlying transaction, since both
-- mean the investigation is closed.
create or replace function resolve_reconciliation_case(
  p_case_id uuid,
  p_admin_id uuid,
  p_status text,
  p_notes text
) returns reconciliation_cases
language plpgsql
security definer set search_path = public
as $$
declare
  v_case reconciliation_cases;
begin
  if p_status not in ('matched', 'resolved') then
    raise exception 'status must be matched or resolved.';
  end if;

  select * into v_case from reconciliation_cases where id = p_case_id for update;
  if v_case is null then raise exception 'Reconciliation case not found.'; end if;
  if v_case.status != 'investigate' then
    raise exception 'Only a case under investigation can be resolved.';
  end if;

  update reconciliation_cases
  set status = p_status, notes = p_notes, resolved_by = p_admin_id,
      resolved_at = now(), updated_at = now()
  where id = p_case_id
  returning * into v_case;

  update transactions set status = 'reconciled' where id = v_case.transaction_id;

  if p_status = 'resolved' then
    insert into audit_events (group_id, actor_id, action, entity_type, entity_id, reason, metadata)
    values (
      v_case.group_id, p_admin_id, 'reconciliation.resolved', 'reconciliation_case', v_case.id,
      p_notes, jsonb_build_object('transaction_id', v_case.transaction_id)
    );
  end if;

  return v_case;
end;
$$;
revoke all on function resolve_reconciliation_case(uuid, uuid, text, text) from public;
grant execute on function resolve_reconciliation_case(uuid, uuid, text, text) to service_role;
