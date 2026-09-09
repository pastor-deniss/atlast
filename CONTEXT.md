# Thrive — Domain Glossary

Community-finance mobile+web app. A digital operating system for savings groups: membership, contributions, loans, governance, reporting.

## Terms

**User** — a person with an account (phone-based identity, no formal KYC in V1).

**Profile** — a User's display info (name, photo) plus their derived reputation data (used for loan-reviewer eligibility).

**Group** — a savings group/community-finance circle. A User can belong to more than one Group (many-to-many via Membership), though V1 builds and tests only the single-group flow for the pilot. V1 has no in-app "create a group" flow — a System Admin creates each Group directly and assigns its first Group Admin.

**Membership** — the join between a User and a Group; exactly one row per (User, Group) pair, ever — rejoining after leaving updates the existing row rather than creating a new one. Carries `role` (Member, Group Admin) and `status`, which moves through `pending → active | declined | exited` to model the apply → review → approve/decline flow as state transitions rather than a separate Application entity. Membership *admission* is decided by a Governance vote (see Motion/Vote below) — a Group Admin may pre-screen an application and reject it outright (no vote), but can never admit a member unilaterally, only a passed vote can. Bootstrap exception: a new Group's first Group Admin and seed members go straight to `active` with no vote or Motion, since there's no one yet to vote. An applicant may optionally state a "reason for joining" (`application_note`) shown to voters — no other application fields (e.g. occupation) are collected, and no reputation/contribution-history score is shown for an applicant, consistent with Thrive not manufacturing trust it can't actually compute (ticket 18).

**System Admin** is a global flag on a User (platform-wide), not a Membership role — it isn't scoped to any one Group.

**Contribution** — a member's periodic payment into the Group. Recorded as a Transaction, not integrated with a live payment gateway in V1 — the member reports the payment (e.g. mobile-money reference) and it posts immediately (member sees "Confirmed"); verification happens after the fact via Reconciliation (see below), not as a pre-posting admin gate.

**Share** — a unit representing a member's stake in the Group. Confirmed in V1 scope (not deferred): each Group sets a `share_value` (e.g. TZS 10,000), and a Contribution must be an exact multiple of it — 1 share per `share_value` contributed, no fractional shares in V1. A member's share count is derived by summing `shares_earned` across their Transactions, never stored as a running total.

**Transaction** (Ledger Event) — the authoritative financial record, one append-only table covering Contribution, Loan Disbursement, Repayment, and Reversal. **Group balance is never stored as a field — it is always derived by summing Transactions' (signed) `amount`.** This is a foundational principle, not an implementation detail: it keeps the financial record auditable and reconcilable. Posting is immediate (a Contribution shows as "Confirmed" to the member as soon as it's recorded) and is distinct from verification — see Reconciliation below. Mistakes are never edited or deleted; a wrong entry is fixed only by a compensating reversal Transaction pointing back at the one it corrects.

**Reconciliation** — the actual verification mechanism for Contributions in V1, replacing any per-Contribution admin-approval gate. A `reconciliation_cases` row compares a posted Transaction against the payment provider's record (e.g. mobile-money statement), run after the fact and in bulk by a Group Admin/Treasurer, not before posting. A match marks the Transaction `reconciled`; a mismatch opens a case for investigation and, once resolved, is corrected via the normal reversal mechanism — Reconciliation itself never edits a Transaction.

**Loan** — a member's borrowing request against the Group, up to their Eligible Amount (V1: 3× the member's total Contributions — a ceiling on what they may request, not an auto-granted amount, always server-computed, never client-calculated). Zero-interest, zero-fee in V1: total repayable = principal. Goes through the Three-Eye Panel (see below) before Disbursement, then tracks Repayments against it. Disbursement is always a separate, explicit Group Admin/Treasurer action after approval — never automatic — since V1 has no live payment gateway (same manual "I sent it, recording it now" pattern as Contribution).

**Repayment** — a payment against an outstanding Loan; recorded as a Transaction.

**Audit Event** — a record of a *discretionary or corrective* action (who did it, why) for traceability — deliberately narrow, not a duplicate of routine activity. Routine events already carry their own audit trail on their own row (`loan_reviewers.decided_at`, `votes.voted_at`, `transactions.created_by`/`created_at`); an Audit Event exists only for things like a Group Admin's pre-screen rejection, a manual default flag, a transaction reversal, or a reconciliation resolution — cases where the "why" isn't otherwise self-evident from the record alone.

**Reputation (loan-reviewer eligibility)** — a member qualifies to sit on a Three-Eye Panel if they have completed at least one Loan with zero defaults. Computed from the ledger, not stored as a manually-assigned trust score in V1.

**Three-Eye Panel** (Loan Review Panel) — for each Loan request, the system auto-selects 3 currently-eligible members (by Reputation), randomly, excluding the borrower and anyone with their own currently-open loan application (conflict of interest). The loan is approved once 2 of the 3 panelists approve — resolved fail-fast, not waiting on an unresponsive 3rd reviewer; symmetrically, 2 declines fail the loan immediately. Distinct from Group Admin and distinct from full-membership Governance voting. If fewer than 3 eligible members exist yet (e.g. a young pilot group), approval falls back to the Group Admin. A reviewer may send a non-blocking Clarification Request to the borrower without it counting as a vote. Reviewer identity is hidden from the borrower and other ordinary members even after the loan resolves — visible only to that reviewer and the Group Admin (ticket 12); the borrower sees only anonymized progress ("Reviewer 1/2/3"). *(Originally scoped as a 5-member/3-of-5 panel; corrected to 3/2-of-3 once the mockup's explicit "Three-Eye Approval" branding was checked against it.)*

**Financial transparency** — within a Group, any active member can see every Transaction and every Loan belonging to that Group, not just their own — this is a deliberate product principle ("Transparent: you can see what is happening"), not an oversight. The one exception is Reconciliation, which stays Group-Admin-only (internal bookkeeping, not the member-facing promise).

**Governance** — the group's decision-making mechanism for membership and constitutional matters (e.g. "should Grace become a member?") via Motions and Votes. Loan approval is **not** routed through Governance — it uses the Three-Eye Panel instead (see above). V1 builds only the `membership_application` Motion type; general constitutional Motions (contribution policy, leadership, special expenditure, etc.) are Layer 2.

**Motion** — a proposal put to a Governance vote. In V1, raised only by a Group Admin choosing "Initiate Vote" on a membership application (never by an ordinary member); resolved by simple majority of Votes cast when its 7-day window closes — no minimum quorum in V1.

**Vote** — a member's recorded position (`approve`/`decline`) on a Motion. A confidential ballot, not an anonymous one: the system stores who voted and what they chose (needed for one-vote-per-member enforcement and the audit trail), but only aggregate tallies are ever shown to *anyone else* — secret even from the Group Admin, not just from ordinary members (ticket 12). "Secret from people, accountable to the system."

**Report** — a generated summary (financial, contribution, loan, governance) over Groups' data.

## Roles (V1)

- **Member** — views own/permitted group info, contributes, requests loans, votes, sits on Three-Eye Panels when eligible.
- **Group Admin** — everything a Member can do, plus manages membership, verifies contributions, manages group settings, generates reports. Treasurer is *not* a separate role in V1 — its responsibilities live inside Group Admin until real usage shows a need to split them out.
- **System Admin** — platform-level (support, security, audit) — deferred until Thrive operates more than a pilot group.

## Out of scope for V1 (deferred to later platform layers)

Analytics/insights dashboards, in-app group chat, help center, payments marketplace, advanced admin dashboards beyond the core financial dashboard, multi-language support (beyond English baseline), sophisticated/AI-driven notifications, live payment-gateway integration, offline-first sync, formal KYC/document verification, Treasurer/Secretary/Auditor as distinct roles, end-of-year Share Valuation and Profit Distribution.
