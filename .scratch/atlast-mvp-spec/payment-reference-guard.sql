-- Duplicate payment-reference guard (found in pilot testing, 2026-11-22).
--
-- A member double-clicked "Confirm Payment" and the same repayment (same
-- mobile-money reference) was posted twice. The app now blocks double
-- submits, but the ledger itself must also refuse it: a mobile-money
-- confirmation code identifies exactly one real payment.
--
-- Rule: within a group, a contribution/repayment reference can be used once
-- (case- and whitespace-insensitive), unless the earlier transaction was
-- reversed — then the reference may be reused for the corrected entry.
--
-- A trigger (not a unique index) because historical duplicates may already
-- exist, and because "unless reversed" depends on other rows.

create or replace function public.prevent_duplicate_payment_reference()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_ref text := upper(btrim(coalesce(new.reference, '')));
begin
  if new.type not in ('contribution', 'repayment') or v_ref = '' then
    return new;
  end if;

  -- Serialize concurrent inserts of the same reference in the same group so
  -- two simultaneous requests can't both pass the check below.
  perform pg_advisory_xact_lock(hashtext(new.group_id::text || ':' || v_ref));

  if exists (
    select 1
    from transactions t
    where t.group_id = new.group_id
      and t.type in ('contribution', 'repayment')
      and upper(btrim(t.reference)) = v_ref
      and not exists (
        select 1 from transactions r
        where r.type = 'reversal' and r.reversed_transaction_id = t.id
      )
  ) then
    raise exception 'This payment reference has already been recorded. Check the mobile money confirmation code.'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_unique_payment_reference on public.transactions;
create trigger transactions_unique_payment_reference
  before insert on public.transactions
  for each row execute function public.prevent_duplicate_payment_reference();
