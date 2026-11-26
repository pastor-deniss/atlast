-- Security fix (2026-11-26). Every security-definer function was meant to be
-- callable by service_role only (see governance-sql-functions.sql header),
-- but `revoke ... from public` does not remove Supabase's default direct
-- grants to anon and authenticated. So anyone holding the public anon key
-- could call e.g. disburse_loan() through /rest/v1/rpc and pass any admin id.
-- The app never calls these directly: only Edge Functions (service_role),
-- pg_cron (postgres) and triggers do, none of which need these grants.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.proname in (
        'admin_decide_loan','cast_loan_review_decision','cast_vote','disburse_loan',
        'flag_loan_default','handle_new_user','initiate_membership_vote','post_announcement',
        'prevent_duplicate_payment_reference','record_loan_repayment',
        'reject_membership_application','request_loan','resolve_expired_motions',
        'resolve_motion_if_settled','resolve_reconciliation_case','reverse_transaction',
        'submit_reconciliation_record')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- Functions created later must not pick up the default grant either.
alter default privileges in schema public revoke execute on functions from anon, authenticated;
