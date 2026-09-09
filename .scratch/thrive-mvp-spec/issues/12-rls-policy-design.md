Type: grilling
Status: resolved
Blocked by: 08, 09, 10, 11

## Question

Design Postgres Row Level Security policies for every V1 table (from tickets 08/09/10/11), per role (Member, Group Admin, System Admin — see [roles decision](04-v1-roles-and-permissions.md)). For each table, answer: who can read which rows, who can insert, who can update, who can delete — including the Loan Review Panel's need to see (only) the loans they're currently panelists for, and a Member's need to see only their own Group's data.

## Answer

Full policies: [rls-policies.sql](rls-policies.sql). Summary of the decisions that shaped it:

- **RLS is read-access control, not a business-rule engine** (the central call). Every state-changing operation — contribution posting, vote casting, loan approval/disbursement, reversals, reconciliation, default-flagging — is a Supabase Edge Function using the service role (bypasses RLS), consistent with several rules already flagged "for ticket 13" in tickets 08/09/10/11. Almost every table gets a SELECT policy and *no* client-facing INSERT/UPDATE/DELETE at all. The one exception: a user updates their own `profiles` row directly.
- **Radical within-group financial transparency** (revises the instinct to scope by "own data only"): any active member of a group sees every `transactions` row and every `loans` row in that group — not just their own — matching the mockup's "Transparent: you can see what is happening" / "Accountable: every action is recorded" framing. `reconciliation_cases` stays Group-Admin-only (internal bookkeeping, not part of that promise).
- **Secret ballot, including from the Group Admin**: `votes` SELECT is `voter_id = auth.uid()` only, no admin bypass. Aggregate tallies (`motion_tallies` view) run as the view owner specifically to count across all voters while still exposing only counts, never individual choices.
- **Reviewer anonymity from the borrower** (Q7, new — not previously decided): `loan_reviewers` and `loan_clarification_requests` are visible only to the reviewer themself + Group Admin, even after the loan resolves. Two anonymized views (`loan_review_progress`, `loan_clarification_messages`) give the borrower/group the substance (decision progress, message text) without the reviewer's identity — reconciling this with the full loan-transparency rule above.
- **Membership applications**: pending, Admin-only, until a `motions` row exists for one (Initiate Vote) — then visible to the whole group. Confirms/implements ticket 11's Admin-pre-screen-can't-unilaterally-admit design at the data-access level.
- **Profile visibility split by column, not just row**: since RLS is row-level only, phone-vs-name/photo (Q2) needed a `profiles_public` view running as its owner (bypassing the base table's stricter RLS) rather than a second policy on the same table.
- **Group discovery**: any authenticated user can read the full `groups` row (no sensitive columns live there — balance/ledger/loans are separate tables, gated separately), supporting the mockup's browse-and-apply flow without a restricted view.

**Not resolved here, flagged for ticket 13**: there's no `audit_events` table in the blueprint yet (ticket 09 flagged it as open) — the access matrix's "Audit records: Member restricted, Group Admin authorized" row can't become an actual RLS policy until that table exists, which is tied to what Edge Functions choose to log.
