Type: grilling
Status: resolved
Blocked by: 09, 10

## Question

Decide the API contract shape: which operations go through Supabase's auto-generated REST/GraphQL directly from the client (simple CRUD, protected by RLS), and which need a Supabase Edge Function / database function instead because they involve business logic that shouldn't live in the client (e.g. loan-panel selection, reputation computation, approval-threshold aggregation, contribution verification). Produce the concrete list of Edge Functions/RPCs needed for the flows defined in tickets 09 and 10.

## Answer

The read/write split itself was already settled by [ticket 12](12-rls-policy-design.md): reads are plain RLS-protected REST/views, writes are Edge Functions using the service role. This ticket's job was the residual open items ticket 12 flagged, plus the concrete Edge Function list.

**Motion resolution (Q1)**: a `pg_cron` job, not lazy-on-read or a manual Admin close — resolving an expired vote is purely mechanical (tally, set status), unlike loan timeout/default which stayed manual precisely because those need human judgment (ticket 10). One addition beyond what ticket 11 explicitly locked: **fail-fast is extended to membership Motions**, not just the Three-Eye panel — a Motion resolves the moment one side becomes mathematically unreachable (`approve_count > decline_count + remaining_eligible_voters`, or the reverse), rather than always waiting the full 7 days. This is inferred from your own Q1 answer ("the same principle applies... if configured") rather than a clean restatement of a prior lock — flagging it plainly in case that inference overreached. A shared Postgres function (`resolve_motion_if_settled(motion_id)`) implements the check; it's called inline after every vote insert (fail-fast path) and swept by the cron job (catches anything that only settles at the deadline, since there's no quorum forcing early settlement).

**Eligible Loan Amount (Q2)**: `eligible_amount = total_contributed × 3`, hardcoded, no new group setting. Implemented as a plain view (`loan_eligibility`, added to `database-blueprint.sql`) rather than an Edge Function — it's a pure derived read with no side effects, same category as `group_balances`/`member_contribution_totals`. "The app must never calculate its own eligibility figure" is satisfied by it being server-derived data, not by it requiring a dedicated function. It's a ceiling on what a member may *request*, not an auto-granted amount.

**`audit_events` scope (Q3)**: narrow — only discretionary/corrective actions, not a duplicate of routine per-row timestamps. Schema added to `database-blueprint.sql`:

```
audit_events
  id            uuid PK
  group_id      uuid, references groups(id), nullable   -- null for platform-level events
  actor_id      uuid, references profiles(id), nullable  -- null for system-triggered (cron resolution)
  action        text, not null   -- open TEXT, e.g. 'membership.rejected', 'loan.disbursed',
                                  -- 'loan.defaulted', 'transaction.reversed', 'reconciliation.resolved'
  entity_type   text, not null   -- 'membership' | 'loan' | 'transaction' | 'reconciliation_case'
  entity_id     uuid, not null
  reason        text
  metadata      jsonb
  created_at    timestamptz, not null default now()
```
RLS (added to `rls-policies.sql`): Group-Admin/System-Admin SELECT only, no client INSERT — every Edge Function below that performs a discretionary action writes its own `audit_events` row atomically.

**Disbursement (Q4)**: a separate explicit `disburseLoan` call, never auto-triggered by approval — matches Contribution's manual record-not-gateway-integrated pattern (no live payment gateway, ticket 03). Guarded by `status = 'approved'` and idempotency (can't disburse twice); disbursement transaction + `loans.status` update + `audit_events` row happen in one DB transaction (all-or-nothing), so the ledger and the loan's status can never disagree about whether money moved.

### Edge Functions / RPCs (service role; the complete write-path list)

**Membership**
- `applyToJoinGroup(group_id, application_note?)` — member; inserts/updates the caller's `memberships` row (handles the rejoin-updates-existing-row rule from ticket 08); `application_note` is the optional "reason for joining" shown to voters (ticket 18).
- `rejectMembershipApplication(membership_id)` — Group Admin; pre-screen reject, no Motion created; `status → 'declined'`; writes `audit_events('membership.rejected')`.
- `initiateMembershipVote(membership_id)` — Group Admin; creates the `motions` row (`opens_at = now()`, `closes_at = +7d`).
- `castVote(motion_id, choice)` — member; inserts into `votes`; calls `resolve_motion_if_settled` (fail-fast).
- `resolve_motion_if_settled(motion_id)` — shared function (not directly client-callable), used by `castVote` and the cron sweep; tallies, sets `motions.status`/`decided_at` and cascades `memberships.status`/`decided_at`/`decision_motion_id`.
- `resolveExpiredMotions()` — `pg_cron` job; sweeps `status='open' AND closes_at < now()`.

**Loans**
- `requestLoan(group_id, principal, purpose, term_weeks)` — member; rejects if the borrower already has an open loan in this group — `pending_review`/`approved`/`disbursed`/`repaying` (ticket 15, Q2 — a rule surfaced while spec'ing the Group Dashboard's "Loan availability" label, backstopped by a DB partial unique index); validates `principal <= loan_eligibility.eligible_amount`; sets `review_mode` from `loan_reviewer_eligibility` pool size (`three_eye` if ≥3, else `admin_fallback`); if `three_eye`, randomly assigns 3 reviewers (excludes borrower + anyone with their own open loan application) and creates `loan_reviewers` rows — all in one DB transaction.
- `castLoanReviewDecision(loan_id, decision)` — assigned reviewer; updates their `loan_reviewers` row; fail-fast-resolves `loans.status` at 2-of-3.
- `sendLoanClarificationRequest(loan_id, message)` — assigned reviewer; inserts `loan_clarification_requests` (non-blocking, ticket 10).
- `adminDecideLoan(loan_id, decision)` — Group Admin; only valid when `review_mode = 'admin_fallback'`.
- `disburseLoan(loan_id)` — Group Admin/Treasurer; see Q4 above.
- `recordLoanRepayment(loan_id, amount, reference)` — member; rejects if `amount` exceeds the outstanding balance (`principal - loan_balances.total_repaid`, ticket 17 Q4 — no overpayment/positive loan balance allowed); otherwise free-form (partial payments allowed, no schedule enforcement, ticket 10 Q6); inserts a `repayment` transaction; cascades `loans.status` to `repaying`/`repaid` via `loan_balances`.
- `flagLoanDefault(loan_id, reason)` — Group Admin; `status → 'defaulted'`; writes `audit_events('loan.defaulted')`.

**Financial ledger**
- `reportContribution(group_id, amount, reference)` — member; validates `amount` is an exact multiple of `groups.share_value` (ticket 09's invariant, enforced here — reject/flag otherwise); computes `shares_earned`; inserts the `contribution` transaction.
- `reverseTransaction(transaction_id, reason)` — Group Admin; inserts the compensating `reversal` row; writes `audit_events('transaction.reversed')`.
- `submitReconciliationRecord(transaction_id, provider, provider_reference, provider_amount, provider_timestamp)` — Group Admin/Treasurer; V1 has no automated provider-statement import (no live gateway, ticket 03), so this is a manual entry of what the provider's statement says; matches or opens a `reconciliation_cases` row.
- `resolveReconciliationCase(case_id, status, notes)` — Group Admin/Treasurer; the actual correction (if any) is a separate `reverseTransaction` call, not part of this one; writes `audit_events('reconciliation.resolved')` when `status → 'resolved'`.

**Invariant enforcement**: the last-Group-Admin invariant (ticket 08) lives inside whichever Edge Function can change a `memberships.role`/`status` for a `group_admin` — no such function is in the list above yet (V1's mockup doesn't show a "demote/remove admin" flow), so it's noted here as unbuilt rather than silently dropped; add it if that flow turns out to be needed for the pilot.

**Not designed here**: report generation (mockup's "Reports" screen) — the underlying data is already queryable via the existing derived views (`group_balances`, `member_contribution_totals`, `loan_balances`), so no new Edge Function is obviously needed, but formatting/export (PDF, etc.) is a screen/UI concern outside this ticket's schema-and-API scope.
