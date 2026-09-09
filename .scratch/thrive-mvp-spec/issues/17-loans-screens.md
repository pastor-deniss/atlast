Type: grilling
Status: resolved
Blocked by: 16

## Question

Spec the Loans screens across all three vantage points the mockup shows: **borrower** (My Loan/Eligibility from `loan_eligibility` view, Loan Application form, Under Review, Three-Eye Approval progress via the anonymized `loan_review_progress` view, Loan Approved, Disbursement/"Money Sent", Make Repayment, Loan Progress); **reviewer** (Three-Eye Approval review screen — approve/decline/request-clarification, using `loan_reviewer_eligibility` and the borrower's visible history); **admin fallback** (when `review_mode = 'admin_fallback'`, ticket 10's <3-eligible-reviewers path). For each: validation (can't request above `eligible_amount`, can't submit with missing purpose/term), error/edge states (loan already has an open application, reviewer trying to vote twice, borrower viewing a declined loan), and exactly which Edge Function from ticket 13's list each action calls.

## Answer

**Q1, deliberately left unresolved rather than guessed**: no Group Admin override during an active Three-Eye review is built in V1. The mockup's "Loan Review" screen is treated as an ambiguous visual, not an approved capability — the working assumption (recorded here, not silently assumed elsewhere) is that both reviewer-facing tiles are plain panelist vote screens. Three-Eye stays fully authoritative; the Admin's only loan-decision power is the already-locked `admin_fallback` path (<3 eligible reviewers). If a higher-resolution source later shows a genuine override screen, it needs its own ticket — it is not retroactively in scope now.

Two rules from this round changed ticket 13's `recordLoanRepayment`: **no overpayment** (amount capped at the outstanding balance) is now in that function's spec.

| Screen | Content / behavior | Notes |
|---|---|---|
| **My Loan / Eligibility** | `eligible_amount` (from `loan_eligibility`), `[Apply for Loan]` | Button disabled/hidden if the member has any open loan (Q2) — the mockup's "Current loan + enabled Apply" tile is illustrative of fields, not a reachable state |
| **Loan Application** | Amount (≤ `eligible_amount`), Purpose, Term (weeks) | `requestLoan` (ticket 13) rejects over-eligible amounts and existing-open-loan attempts |
| **Under Review** | Static confirmation | Same copy regardless of `three_eye`/`admin_fallback` — both are legitimately "under review" |
| **Three-Eye Approval** (borrower view) | Anonymized progress via `loan_review_progress` ("Reviewer 1: Approved / Reviewer 2: Approved / Reviewer 3: Pending") | No reviewer identity (ticket 12, Q7) |
| **Reviewer's own vote screen** | Borrower's identity + an evidence panel (not a score — see below), `[Approve]` / `[Decline]` / `[Request Clarification]` | Approve/Decline call `castLoanReviewDecision`; Clarification calls `sendLoanClarificationRequest` (non-blocking, ticket 10) |
| **Loan Approved** | Outcome notice | → `disburseLoan` still pending, a separate Admin action (ticket 13, Q4) |
| **Loan Declined** *(new — not in the mockup)* | "2 of 3 reviewers declined your application. You may submit a new application." | Aggregate count only, no individual votes/reasoning (`loan_reviewers` has no reason field). Reapplication allowed immediately — declined is terminal, doesn't hold the one-open-loan slot (Q3) |
| **Disbursement** | "Money Sent!" | Fires once `disburseLoan` actually runs |
| **Make Repayment** | Amount (free entry, `installment_amount` pre-filled as an editable suggestion), Mobile Money, Reference | **New rule (Q4)**: amount capped at the outstanding balance (`principal - loan_balances.total_repaid`) — no overpayment. Otherwise flexible/partial, no schedule enforcement (matches ticket 10 Q6) |
| **Loan Progress** | Donut/percent repaid, Paid vs. Remaining | Derived from `loan_balances`, never stored |
| **Payment Success** | Confirmation | — |

**Reviewer evidence panel** (replaces the mockup's "Contribution history: Good / Repayment history: Good" — V1 has no reputation score, ticket 13 Q2 already ruled that out): factual figures only — total contributed, previous loans count, previous loans repaid, defaults (0, since `loan_reviewer_eligibility` already requires this), recent-contribution yes/no, current loan status. Thrive presents evidence; the reviewer judges — no invented scoring.
