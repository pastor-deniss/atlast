-- SECURITY FIX (2026-11-26, approved by the product owner): five balance
-- views ran with their owner's rights, so anyone holding the public anon key
-- could read every group's totals. security_invoker makes each view obey the
-- caller's row-level security (members still see their own group exactly as
-- before), and anonymous callers lose access entirely. Security-definer SQL
-- functions that read these views still run as the owner, unchanged.
alter view group_balances set (security_invoker = true);
alter view loan_balances set (security_invoker = true);
alter view loan_eligibility set (security_invoker = true);
alter view loan_reviewer_eligibility set (security_invoker = true);
alter view member_contribution_totals set (security_invoker = true);

revoke all on group_balances, loan_balances, loan_eligibility, loan_reviewer_eligibility, member_contribution_totals from anon;
grant select on group_balances, loan_balances, loan_eligibility, loan_reviewer_eligibility, member_contribution_totals to authenticated;
