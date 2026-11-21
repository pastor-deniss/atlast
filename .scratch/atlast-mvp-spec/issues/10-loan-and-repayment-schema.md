Type: grilling
Status: resolved
Blocked by: 09

## Question

Design the Loan & Repayment schema and the Loan Review Panel mechanics: the Loan state machine (requested → under review → approved/declined → disbursed → repaying → repaid/defaulted), how a Repayment ties back into the Transaction ledger (from ticket 09), how reviewer eligibility ("≥1 completed loan, zero defaults") is computed, how the 5-member panel is selected and its votes recorded, and how the 3-of-5 threshold is enforced — per [loan approval mechanism](05-loan-approval-mechanism.md).

## Answer

Grilling this ticket revised [loan approval mechanism](05-loan-approval-mechanism.md) itself: the mockup's screens are explicitly branded "Three-Eye Approval" / "Three-Eye Loan Approval" — 3 reviewers, majority-of-2, fail-fast — not the 5-reviewer/3-of-5 panel ticket 05 originally locked. That ticket has been updated to match; this is now the single source of truth for the review mechanism.

```
loans
  id                   uuid PK, default gen_random_uuid()
  group_id             uuid, references groups(id), not null
  borrower_id          uuid, references profiles(id), not null
  principal             numeric, not null
  purpose               text, nullable
  term_weeks            integer, not null
  installment_amount    numeric, not null
                                  -- principal / term_weeks. Zero-interest in V1 (see below), so total
                                  -- repayable = principal exactly. Stored at approval time as a
                                  -- reference/display figure only — there's no due-date schedule table
                                  -- and nothing enforces it; consistent with ticket 09's schedule-light
                                  -- stance on Contributions (no scheduler/cron in V1 either).
  status                text, not null, default 'pending_review'
                                  -- pending_review | approved | declined | disbursed | repaying |
                                  -- repaid | defaulted
  review_mode           text, not null
                                  -- 'three_eye' | 'admin_fallback' — fixed at request time based on
                                  -- eligible-pool size (see Fallback below). Determines whether
                                  -- loan_reviewers rows get created at all.
  decided_at            timestamptz, nullable
  decided_by            uuid, references profiles(id), nullable
                                  -- set only on the admin_fallback path. On the three_eye path the
                                  -- "decider" is the panel itself — see loan_reviewers, which is
                                  -- already a full audit trail (who/when/what) without needing a
                                  -- separate log row here.
  disbursed_at           timestamptz, nullable
  defaulted_at            timestamptz, nullable
  defaulted_by            uuid, references profiles(id), nullable   -- Group Admin who manually flagged it
  created_at              timestamptz, not null, default now()

  disbursed/repaying/repaid are driven by the ledger, not set by hand: 'disbursed' when a
  loan_disbursement transaction is inserted (ticket 09), 'repaying' on the first repayment
  transaction, 'repaid' once SUM(repayment transaction amounts) for this loan >= principal. Loan
  balance owed is therefore also derived, never stored — same derive-don't-store principle as
  Group/member balance.

loan_reviewers   (the Three-Eye panel — one row per assigned reviewer per loan)
  id             uuid PK, default gen_random_uuid()
  loan_id        uuid, references loans(id), not null
  reviewer_id    uuid, references profiles(id), not null
  decision       text, not null, default 'pending'    -- pending | approve | decline
  decided_at     timestamptz, nullable
  assigned_at    timestamptz, not null, default now()
  UNIQUE (loan_id, reviewer_id)

  Exactly 3 rows per loan under review_mode='three_eye' (none under 'admin_fallback'). Selection:
  random from the pool of eligible members (>=1 completed loan, 0 defaults — per ticket 05),
  excluding the borrower and excluding anyone with their own currently-open loan application
  (conflict of interest). No fairness-rotation algorithm in V1 — random is enough for a small pilot
  group.

  Resolution is fail-fast, not wait-for-all-three: as soon as 2 rows read 'approve', the loan moves
  to 'approved' immediately, regardless of the 3rd reviewer's still-'pending' row (matches the
  mockup, which shows Loan Approved firing while Reviewer 3 is still Pending). Symmetrically, 2
  'decline' rows move the loan straight to 'declined'. A still-pending 3rd reviewer's eventual vote
  is then moot — the row stays 'pending' and the loan's outcome doesn't change.

loan_clarification_requests   (non-blocking — does not count as a vote)
  id            uuid PK, default gen_random_uuid()
  loan_id       uuid, references loans(id), not null
  reviewer_id   uuid, references profiles(id), not null
  message       text, not null
  created_at    timestamptz, not null, default now()

  A reviewer can send one of these at any point without changing their loan_reviewers.decision from
  'pending' — the other two reviewers can still vote and reach the threshold regardless. Kept as its
  own table rather than a third decision value specifically so it can never block the panel.
```

**Loan cost**: zero-interest, zero-fee in V1 — `installment_amount = principal / term_weeks`, total repayable = principal. Deliberately not hard-coded as impossible later: a future interest/fee/penalty column would be additive to `loans`/`transactions`, not a redesign — but nothing beyond zero-cost is built in Layer 1.

**Fallback** (revises ticket 05's "fewer than 5" number to match the 3-reviewer panel): if fewer than 3 members are currently eligible, `review_mode` is set to `admin_fallback` and the Group Admin approves/declines directly (`decided_by`/`decided_at` on `loans`, no `loan_reviewers` rows).

**Reviewer timeout**: none in V1. An unresponsive reviewer leaves the loan at `pending_review` indefinitely unless/until the threshold is reached another way or a Group Admin intervenes through the same admin review screen used for the fallback path. Deliberately no cron/reassignment/escalation engine yet — a known V1 limitation, not an oversight.

**Default detection**: manual only. A Loan becomes `defaulted` solely via a Group Admin action (`defaulted_by`/`defaulted_at`), never an automated overdue check — consistent with there being no due-date schedule table (see `installment_amount` above). A late repayment does not by itself change loan status.

**Repayment**: recorded exactly as ticket 09 defined — a `transactions` row with `type='repayment'`, `loan_id` set, positive signed `amount` (money into the group fund). No separate `repayments` table; the ledger row is the whole record.

**Not decided here, flagged for ticket 13 (API contract)**: the borrower-facing "Eligible Amount" figure (mockup screen: "Eligible amount TZS 100,000 — based on your group rules and standing") is a computed request-time business rule, not a schema element — its formula still needs pinning down.

> **Addition from [ticket 15](15-group-home-members-screens.md)'s grilling**: a member may have only **one open loan at a time** per group (`pending_review`/`approved`/`disbursed`/`repaying`) — this was never explicitly locked here or in ticket 05, surfaced only while spec'ing the Group Dashboard's "Loan availability" label. Enforced by `requestLoan` (ticket 13) and backstopped by a DB partial unique index on `loans (borrower_id, group_id)`.
