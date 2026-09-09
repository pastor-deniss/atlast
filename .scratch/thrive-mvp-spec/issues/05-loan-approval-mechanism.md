Type: grilling
Status: resolved

## Question

How does a loan get approved in V1? The white paper's "complete cycle" puts Governance/Approval between loan request and disbursement, the mockup shows a "Three-Eye Approval" pattern (independent Reviewer 1/2/3), but V1's role model has only one Group Admin role and no separate reviewer role — how do these reconcile, and what exactly counts as reviewer eligibility?

## Answer

> **Revised during [ticket 10](10-loan-and-repayment-schema.md)'s grilling**: the panel size/threshold below was originally set to 5 members / 3-of-5. That's now superseded — the mockup's screens are explicitly and repeatedly branded "Three-Eye Approval" / "Three-Eye Loan Approval," which is stronger evidence than the original reasoning gave it credit for. The numbers below reflect the corrected, locked model; see ticket 10 for full schema (`loans`, `loan_reviewers`, `loan_clarification_requests`) and the additional mechanics (fail-fast resolution, conflict-of-interest exclusion, zero-interest cost, manual default flagging).

A **Three-Eye (Loan Review) Panel**, distinct from both Group Admin and full-membership Governance voting:

- **Selection**: for each loan request, the system auto-selects 3 currently-eligible members fresh, based on reputation — no standing committee, no election, no admin hand-picking. Random selection, excluding the borrower and anyone with their own currently-open loan application (conflict of interest — see ticket 10).
- **Eligibility ("clean loan history")**: a member qualifies if they have completed at least one loan with zero defaults (no missed final repayment / write-off). Computed from the ledger, not a manually-assigned score.
- **Approval threshold**: 2 of the 3 panelists must approve for the loan to proceed to disbursement — majority quorum, resolved fail-fast (the loan is decided the moment 2 reviewers agree, without waiting for the 3rd).
- **Fallback**: if fewer than 3 members are eligible yet (expected for a young pilot group), approval falls back to Group Admin review.
- **Relationship to Governance**: full-membership Governance (Motions/Votes) stays reserved for membership and constitutional decisions (e.g. "should Grace become a member?") — it does not route loan approvals. This keeps the loan workflow lightweight and avoids overloading every member with a vote on every loan.

This reconciles the mockup's multi-reviewer "Three-Eye Approval" screens with the simplified V1 role model: panelists are Members (not a new role), just ones the system currently trusts based on their own track record.
