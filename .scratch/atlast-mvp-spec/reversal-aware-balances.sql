-- Reversal-aware balance views (found in pilot testing, 2026-11-22).
--
-- A reversal is a compensating row (type = 'reversal', negative amount and
-- shares) pointing at the original via reversed_transaction_id. The original
-- views summed only type = 'repayment' / type = 'contribution', so reversing
-- a duplicate repayment left the loan's "Paid" total unchanged, and reversing
-- a contribution would leave total_contributed (and loan eligibility, which
-- is derived from it) overstated.
--
-- Fix: also count a reversal row under the type of the transaction it
-- reverses. Column names, types and order are unchanged, so dependent views
-- (loan_eligibility) and grants are unaffected.

create or replace view public.loan_balances as
select
  t.loan_id,
  coalesce(
    sum(t.amount) filter (
      where t.type = 'repayment' or (t.type = 'reversal' and o.type = 'repayment')
    ),
    0
  ) as total_repaid
from public.transactions t
left join public.transactions o on o.id = t.reversed_transaction_id
where t.loan_id is not null
group by t.loan_id;

create or replace view public.member_contribution_totals as
select
  t.group_id,
  t.member_id,
  coalesce(
    sum(t.amount) filter (
      where t.type = 'contribution' or (t.type = 'reversal' and o.type = 'contribution')
    ),
    0
  ) as total_contributed,
  coalesce(sum(t.shares_earned), 0) as total_shares
from public.transactions t
left join public.transactions o on o.id = t.reversed_transaction_id
group by t.group_id, t.member_id;
