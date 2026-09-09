-- THRIVE MVP — V1 ROW LEVEL SECURITY POLICIES  (ticket 12)
-- Applies to the tables created in database-blueprint.sql (tickets 08-11).
--
-- Governing principle (ticket 12, Q1): RLS answers "who can see this row?" —
-- it is NOT the business-rule engine. Every state-changing operation (posting
-- a contribution, casting a vote, approving a loan, reversing a transaction,
-- disbursing, defaulting, reconciling) is a Supabase Edge Function using the
-- service role, which bypasses RLS entirely and is where ticket 13's business
-- rules live (share-value-multiple validation, last-Group-Admin invariant,
-- fail-fast panel/motion resolution, one-vote-per-member, etc). Accordingly,
-- almost every table below gets a SELECT policy and NO client-facing
-- INSERT/UPDATE/DELETE policy at all — those paths simply don't exist for the
-- `authenticated` role; only the service role (Edge Functions) can write there.
-- The one exception is `profiles`, where a user updates their own display info
-- directly (see below) — everything else about "how does a row like this get
-- written" is ticket 13's job, not this one's.
--
-- Two access principles this file has to reconcile row-level-only RLS with:
--   - Q2/Q7: some tables need *column*-level hiding (profiles.phone hidden from
--     peers; loan_reviewers.reviewer_id hidden from the borrower) that plain
--     row-level policies can't express. Handled with `security_invoker = false`
--     views that run as their owner (bypassing the base table's RLS) and apply
--     their own row filter — the standard Supabase pattern for this.
--   - Q5: vote choices must be secret even from Group Admins, but aggregate
--     tallies must still be visible. Handled the same way: a tally view that
--     counts across ALL rows (bypassing per-voter RLS) but only ever returns
--     aggregates, never individual choices.

-- ============================================================================
-- HELPER FUNCTIONS  (security definer — used inside policies and views below)
-- ============================================================================

create or replace function is_system_admin()
returns boolean language sql stable security definer as $$
  select coalesce((select p.is_system_admin from profiles p where p.id = auth.uid()), false)
$$;

create or replace function is_active_member(check_group_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from memberships m
    where m.group_id = check_group_id and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

create or replace function is_group_admin(check_group_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from memberships m
    where m.group_id = check_group_id and m.user_id = auth.uid()
      and m.role = 'group_admin' and m.status = 'active'
  )
$$;

-- Do the caller and target_profile_id share >=1 group where BOTH are active members?
create or replace function shares_active_group(target_profile_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from memberships mine
    join memberships theirs
      on theirs.group_id = mine.group_id and theirs.status = 'active'
    where mine.user_id = auth.uid() and mine.status = 'active'
      and theirs.user_id = target_profile_id
  )
$$;

-- Is the caller an active group_admin in a group where target_profile_id is an active member?
create or replace function is_group_admin_of(target_profile_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from memberships admin_m
    join memberships their_m
      on their_m.group_id = admin_m.group_id and their_m.status = 'active'
    where admin_m.user_id = auth.uid() and admin_m.status = 'active' and admin_m.role = 'group_admin'
      and their_m.user_id = target_profile_id
  )
$$;

-- Is the caller an active group_admin in a group where target_profile_id has a
-- PENDING application? Needed because shares_active_group requires both sides
-- 'active' -- an applicant isn't active yet, so without this a Group Admin's
-- Membership Review screen (ticket 18) can never see the applicant's own name
-- via profiles_public. Found live-testing ticket 19's Admin Control Centre,
-- which links straight into that screen.
create or replace function is_group_admin_reviewing(target_profile_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from memberships admin_m
    join memberships applicant_m
      on applicant_m.group_id = admin_m.group_id and applicant_m.status = 'pending'
    where admin_m.user_id = auth.uid() and admin_m.status = 'active' and admin_m.role = 'group_admin'
      and applicant_m.user_id = target_profile_id
  )
$$;

-- ============================================================================
-- PROFILES  (Q2: name/photo to groupmates, phone restricted to self + admin)
-- ============================================================================

alter table profiles enable row level security;

create policy profiles_select_full on profiles for select
  using (id = auth.uid() or is_group_admin_of(id) or is_system_admin());
  -- Full row (including phone) — self, a Group Admin sharing an active group
  -- with this profile, or System Admin. NOT visible to ordinary groupmates —
  -- they use profiles_public below instead.

create policy profiles_update_self on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
  -- A user may update their own display info (first_name/last_name/photo_url).
  -- phone is Supabase-Auth-verified (OTP), not a plain client-editable column —
  -- changing it is a re-verification flow, not a row UPDATE (ticket 13).
  -- is_system_admin is never client-writable — no policy grants it, so it's
  -- silently protected regardless of what a client attempts.

-- profiles row insert happens via a `handle_new_user` trigger on auth.users
-- (the standard Supabase pattern), not a client-facing RLS-permitted INSERT.

create or replace view profiles_public with (security_invoker = false) as
  select id, first_name, last_name, photo_url
  from profiles
  where id = auth.uid() or shares_active_group(id) or is_system_admin()
    or is_group_admin_reviewing(id);
  -- Runs as the view owner (bypasses profiles' own RLS, which would otherwise
  -- restrict this to self/admin only) and applies its own, broader filter:
  -- name + photo visible to any shared-group active member. This is what the
  -- Member Directory queries — never the base `profiles` table. The last
  -- clause is a narrow addition (ticket 19 fix): a Group Admin reviewing a
  -- still-pending applicant needs their name too, even though the applicant
  -- isn't an active member yet.
grant select on profiles_public to authenticated;

-- ============================================================================
-- GROUPS  (Q3: limited public discovery to any authenticated user)
-- ============================================================================

alter table groups enable row level security;

create policy groups_select_all on groups for select
  to authenticated
  using (true);
  -- No sensitive columns live on `groups` itself (balance/ledger/loans/reports
  -- are separate tables/views, gated separately below) — so the whole row is
  -- safe to expose to any signed-in user, matching the mockup's "Join a Group /
  -- Search groups" browse flow. Group creation/archival has no client INSERT/
  -- UPDATE policy — System-Admin-only, via Edge Function (ticket 04/08).

-- ============================================================================
-- MEMBERSHIPS  (Q6: pending applications Admin-only until a Motion exists)
-- ============================================================================

alter table memberships enable row level security;

create policy memberships_select on memberships for select
  using (
    user_id = auth.uid()
    or is_group_admin(group_id)
    or is_system_admin()
    or (status = 'active' and is_active_member(group_id))
    or (
      status = 'pending' and is_active_member(group_id)
      and exists (select 1 from motions mo where mo.subject_membership_id = memberships.id)
    )
  );
  -- self; Group Admin (sees pending pre-screen + everything); System Admin;
  -- any active member sees the active roster (Member Directory); a pending
  -- application becomes visible to ordinary members only once a Motion has
  -- been raised for it (Initiate Vote) — matches the mockup's Vote
  -- Notification being how members first learn an applicant exists.

-- No INSERT/UPDATE/DELETE policy: applying to join, an Admin's pre-screen
-- reject, Initiate Vote, and the vote-close status transition are all Edge
-- Function operations (the rejoin-updates-existing-row logic from ticket 08
-- alone makes a plain client INSERT unsafe).

-- ============================================================================
-- GOVERNANCE — MOTIONS & VOTES  (ticket 11; Q5: secret ballot even from Admin)
-- ============================================================================

alter table motions enable row level security;

create policy motions_select on motions for select
  using (is_active_member(group_id) or is_system_admin());
  -- A motions row exists at all only once "Initiate Vote" has fired, so by
  -- definition it's meant for the whole group (Q6) — any active member sees it.

-- No INSERT/UPDATE policy: raising a Motion (Group-Admin-only) and resolving
-- one at closes_at are Edge Function / scheduled-job operations.

alter table votes enable row level security;

create policy votes_select_own on votes for select
  using (voter_id = auth.uid());
  -- Secret even from the Group Admin (Q5) — no admin/system-admin bypass here.
  -- A member can see only whether/how THEY voted.

-- No INSERT policy: vote casting is an Edge Function (enforces one-vote-per-
-- member, eligibility, and triggers fail-fast motion resolution atomically).

create view motion_tallies with (security_invoker = false) as
  select
    v.motion_id,
    count(*) filter (where v.choice = 'approve') as approve_count,
    count(*) filter (where v.choice = 'decline') as decline_count
  from votes v
  join motions mo on mo.id = v.motion_id
  where is_active_member(mo.group_id) or is_system_admin()
  group by v.motion_id;
  -- Runs as owner (bypasses votes' own per-voter RLS to count every row) but
  -- exposes only aggregates, scoped to callers who can see the motion at all.
  -- This is the "APPROVE 7 / DECLINE 2" the mockup's Vote Results screen shows.
grant select on motion_tallies to authenticated;

-- ============================================================================
-- LOANS  (Q4: full within-group transparency; Q7: reviewers stay anonymous)
-- ============================================================================

alter table loans enable row level security;

create policy loans_select on loans for select
  using (is_active_member(group_id) or is_system_admin());
  -- Any active member sees every loan in their group — borrower, principal,
  -- purpose, status, disbursed/repaid progress. No borrower-only restriction:
  -- this is the "you can see what is happening" promise applied to loans.

-- No INSERT/UPDATE policy: loan application, panel decision cascades,
-- disbursement, and default-flagging are all Edge Function operations.

alter table loan_reviewers enable row level security;

create policy loan_reviewers_select on loan_reviewers for select
  using (
    reviewer_id = auth.uid()
    or is_group_admin((select l.group_id from loans l where l.id = loan_id))
    or is_system_admin()
  );
  -- Visible only to that reviewer themself and the Group Admin — NEVER the
  -- borrower or other ordinary members, even after the loan resolves (Q7).
  -- Borrowers/members instead read loan_review_progress below.

-- No INSERT/UPDATE policy: panel selection and decision-casting (with its
-- fail-fast cascade into loans.status) are Edge Function operations.

create view loan_review_progress with (security_invoker = false) as
  select
    lr.loan_id,
    array_agg(lr.decision order by lr.assigned_at) as reviewer_decisions
  from loan_reviewers lr
  join loans l on l.id = lr.loan_id
  where is_active_member(l.group_id) or is_system_admin()
  group by lr.loan_id;
  -- Anonymized progress ("Reviewer 1: Approved, Reviewer 2: Pending, Reviewer
  -- 3: Approved" in mockup terms) — decisions without reviewer_id, visible to
  -- the whole group per Q4's loan transparency, without breaking Q7's
  -- reviewer anonymity.
grant select on loan_review_progress to authenticated;

alter table loan_clarification_requests enable row level security;

create policy loan_clarification_requests_select on loan_clarification_requests for select
  using (
    reviewer_id = auth.uid()
    or is_group_admin((select l.group_id from loans l where l.id = loan_id))
    or is_system_admin()
  );
  -- Same visibility as loan_reviewers (raw table includes reviewer_id, so it
  -- can't be shown to the borrower directly without deanonymizing them —
  -- Q7). The borrower reads the message itself, without the sender's
  -- identity, via loan_clarification_messages below.

create view loan_clarification_messages with (security_invoker = false) as
  select lcr.loan_id, lcr.message, lcr.created_at
  from loan_clarification_requests lcr
  join loans l on l.id = lcr.loan_id
  where is_active_member(l.group_id) or is_system_admin();
  -- Reviewer identity dropped entirely — matches Q7's asymmetry (borrower gets
  -- the substance of a clarification request, never who asked it).
grant select on loan_clarification_messages to authenticated;

-- No INSERT policy on loan_clarification_requests: sending one is an Edge
-- Function call (also validates the reviewer is currently assigned/pending).

-- ============================================================================
-- FINANCIAL LEDGER  (ticket 09; Q4: full transparency; reconciliation Admin-only)
-- ============================================================================

alter table transactions enable row level security;

create policy transactions_select on transactions for select
  using (is_active_member(group_id) or is_system_admin());
  -- Every contribution/disbursement/repayment/reversal in a group is visible
  -- to every active member of that group — not just their own (Q4).

-- No INSERT/UPDATE/DELETE policy: every ledger write (contribution posting,
-- disbursement, repayment, reversal) is an Edge Function operation — this is
-- the one table where a direct client write would be most dangerous.

alter table reconciliation_cases enable row level security;

create policy reconciliation_cases_select on reconciliation_cases for select
  using (is_group_admin(group_id) or is_system_admin());
  -- Group-Admin-only (Q4) — internal bookkeeping, not part of the member-
  -- facing transparency promise.

-- No INSERT/UPDATE policy: reconciliation matching/resolution is an Edge
-- Function / scheduled-job operation.

-- ============================================================================
-- AUDIT  (ticket 13 — audit_events didn't exist when this file was first written)
-- ============================================================================

alter table audit_events enable row level security;

create policy audit_events_select on audit_events for select
  using (is_group_admin(group_id) or is_system_admin());
  -- Group-Admin-authorized, Member-restricted — matches the access matrix from
  -- this ticket's own grilling. No client INSERT policy: every Edge Function
  -- that writes a discretionary/corrective action also writes its audit_events
  -- row, atomically, using the service role.

-- loan_eligibility (ticket 13, Q2) needs no policy of its own: it's a plain
-- view (default security_invoker) over member_contribution_totals, which is
-- itself a plain view over `transactions` — so it automatically inherits
-- transactions_select's scoping (is_active_member). No special handling
-- required, unlike the anonymizing views above.

-- ============================================================================
-- RESOLVED ELSEWHERE
-- ============================================================================
-- Ticket 13 (API contract/Edge Functions) specifies every write path named
-- above: request/response shape, validation order, and exactly which
-- service-role operation each one performs — see database-blueprint.sql's
-- audit_events/loan_eligibility additions and ticket 13's own file for the
-- concrete Edge Function/RPC list.
