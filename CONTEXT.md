# AtLast — Domain Glossary

Community-finance mobile+web app. A digital operating system for savings groups: membership, contributions, loans, governance, reporting.

## Terms

**User** — a person with an account (phone-based identity, no formal KYC in V1).

**Profile** — a User's display info (name, photo) plus their derived reputation data (used for loan-reviewer eligibility).

**Group** — a savings group/community-finance circle. A User can belong to more than one Group (many-to-many via Membership), though V1 builds and tests only the single-group flow for the pilot. V1 has no in-app "create a group" flow — a System Admin creates each Group directly and assigns its first Group Admin.

**Membership** — the join between a User and a Group; exactly one row per (User, Group) pair, ever — rejoining after leaving updates the existing row rather than creating a new one. Carries `role` (Member, Group Admin) and `status`, which moves through `pending → active | declined | exited` to model the apply → review → approve/decline flow as state transitions rather than a separate Application entity. Membership *admission* is decided by a Governance vote (see Motion/Vote below) — a Group Admin may pre-screen an application and reject it outright (no vote), but can never admit a member unilaterally, only a passed vote can. Bootstrap exception: a new Group's first Group Admin and seed members go straight to `active` with no vote or Motion, since there's no one yet to vote. An applicant may optionally state a "reason for joining" (`application_note`) shown to voters — no other application fields (e.g. occupation) are collected, and no reputation/contribution-history score is shown for an applicant, consistent with AtLast not manufacturing trust it can't actually compute (ticket 18).

**System Admin** is a global flag on a User (platform-wide), not a Membership role — it isn't scoped to any one Group.

**Contribution** — a member's periodic payment into the Group. Recorded as a Transaction, not integrated with a live payment gateway in V1 — the member reports the payment (e.g. mobile-money reference) and it posts immediately (member sees "Confirmed"); verification happens after the fact via Reconciliation (see below), not as a pre-posting admin gate.

**Share** — a unit representing a member's stake in the Group. Confirmed in V1 scope (not deferred): each Group sets a `share_value` (e.g. TZS 10,000), and a Contribution must be an exact multiple of it — 1 share per `share_value` contributed, no fractional shares in V1. A member's share count is derived by summing `shares_earned` across their Transactions, never stored as a running total.

**Transaction** (Ledger Event) — the authoritative financial record, one append-only table covering Contribution, Loan Disbursement, Repayment, and Reversal. **Group balance is never stored as a field — it is always derived by summing Transactions' (signed) `amount`.** This is a foundational principle, not an implementation detail: it keeps the financial record auditable and reconcilable. Posting is immediate (a Contribution shows as "Confirmed" to the member as soon as it's recorded) and is distinct from verification — see Reconciliation below. Mistakes are never edited or deleted; a wrong entry is fixed only by a compensating reversal Transaction pointing back at the one it corrects.

**Transaction Number** — the app's own reference for one Transaction, e.g. `ATL-2611-7K3M9Q` (year+month, then 6 random characters). The database sets it on every Transaction of every type and payment method; it is unique and never changes. It is shown on receipts, history, statements and the admin ledger, and used to look a Transaction up when a question arises. Not the same as the **Payment Reference** (`transactions.reference`), which is the provider's code the member types in, such as the M-Pesa confirmation code.

**Reconciliation** — the actual verification mechanism for Contributions in V1, replacing any per-Contribution admin-approval gate. A `reconciliation_cases` row compares a posted Transaction against the payment provider's record (e.g. mobile-money statement), run after the fact and in bulk by a Group Admin/Treasurer, not before posting. A match marks the Transaction `reconciled`; a mismatch opens a case for investigation and, once resolved, is corrected via the normal reversal mechanism — Reconciliation itself never edits a Transaction.

**Jamii** — the Group's welfare pot for members who fall ill (added 2026-11-26). Funded by its own regular Jamii contribution (amount set by the Group Admin; any amount accepted, no shares), kept apart from savings: never counts towards Contributions, shares or loan eligibility, and the main fund balance excludes it (`group_balances.jamii_balance`). A Jamii payout is a Spend Request for a named member, paid only from the pot.

**Miscellaneous Charge** — any other group expense (meeting costs, fees, stationery, transport…), paid from the main fund through a Spend Request. Shown to all members when paid; kept off personal statements.

**Spend Request** — how Jamii payouts and Miscellaneous Charges are approved. A Group Admin starts it; 3 Approvers are drawn at random from members in good standing (active ≥ 3 months, contributed in each of the last 3 contribution periods, loan default rate ≤ 20%, no defaulted/overdue loan, never the beneficiary or the initiating admin). ALL 3 must approve; one decline declines it. If fewer than 3 qualify, the app suggests members (best standing first) and the admin picks 3; if the group has fewer than 3 other members, the admin decides alone. Every path is audited. After approval the admin records the payout (manual "I sent it" pattern) as a `jamii_payout` / `group_expense` ledger entry.

**Loan** — a member's borrowing request against the Group, up to their Eligible Amount (V1: 3× the member's total Contributions — a ceiling on what they may request, not an auto-granted amount, always server-computed, never client-calculated). Cost (changed 2026-11-26 from zero-interest at the product owner's request): a flat **Interest** % of the principal, charged once, plus a **Late Penalty** % per full week past the due date (disbursement + term) on what is still owed — never on earlier penalties, and stopping when the loan is flagged defaulted. The Group Admin sets both rates (audited, members notified); each loan keeps the rates of the moment it was requested; existing groups start at 0%/0%. Total repayable = principal + interest + penalties so far, always derived (the `loan_dues` view), never stored. Interest and penalties are paid through ordinary Repayments into the group fund. Goes through the Three-Eye Panel (see below) before Disbursement, then tracks Repayments against it. Disbursement is always a separate, explicit Group Admin/Treasurer action after approval — never automatic — since V1 has no live payment gateway (same manual "I sent it, recording it now" pattern as Contribution).

**Repayment** — a payment against an outstanding Loan; recorded as a Transaction.

**Audit Event** — a record of a *discretionary or corrective* action (who did it, why) for traceability — deliberately narrow, not a duplicate of routine activity. Routine events already carry their own audit trail on their own row (`loan_reviewers.decided_at`, `votes.voted_at`, `transactions.created_by`/`created_at`); an Audit Event exists only for things like a Group Admin's pre-screen rejection, a manual default flag, a transaction reversal, or a reconciliation resolution — cases where the "why" isn't otherwise self-evident from the record alone.

**Reputation (loan-reviewer eligibility)** — a member qualifies to sit on a Three-Eye Panel if they have completed at least one Loan with zero defaults. Computed from the ledger, not stored as a manually-assigned trust score in V1.

**Three-Eye Panel** (Loan Review Panel) — for each Loan request, the system auto-selects 3 currently-eligible members (by Reputation), randomly, excluding the borrower and anyone with their own currently-open loan application (conflict of interest). The loan is approved once 2 of the 3 panelists approve — resolved fail-fast, not waiting on an unresponsive 3rd reviewer; symmetrically, 2 declines fail the loan immediately. Distinct from Group Admin and distinct from full-membership Governance voting. If fewer than 3 eligible members exist yet (e.g. a young pilot group), approval falls back to the Group Admin. A reviewer may send a non-blocking Clarification Request to the borrower without it counting as a vote. Reviewer identity is hidden from the borrower and other ordinary members even after the loan resolves — visible only to that reviewer and the Group Admin (ticket 12); the borrower sees only anonymized progress ("Reviewer 1/2/3"). *(Originally scoped as a 5-member/3-of-5 panel; corrected to 3/2-of-3 once the mockup's explicit "Three-Eye Approval" branding was checked against it.)*

**Financial transparency** — within a Group, any active member can see every Transaction and every Loan belonging to that Group, not just their own — this is a deliberate product principle ("Transparent: you can see what is happening"), not an oversight. The one exception is Reconciliation, which stays Group-Admin-only (internal bookkeeping, not the member-facing promise).

**Governance** — the group's decision-making mechanism for membership and constitutional matters (e.g. "should Grace become a member?") via Motions and Votes. Loan approval is **not** routed through Governance — it uses the Three-Eye Panel instead (see above). V1 builds only the `membership_application` Motion type; general constitutional Motions (contribution policy, leadership, special expenditure, etc.) are Layer 2.

**Motion** — a proposal put to a Governance vote. In V1, raised only by a Group Admin choosing "Initiate Vote" on a membership application (never by an ordinary member); resolved by simple majority of Votes cast when its 7-day window closes — no minimum quorum in V1.

**Vote** — a member's recorded position (`approve`/`decline`) on a Motion. A confidential ballot, not an anonymous one: the system stores who voted and what they chose (needed for one-vote-per-member enforcement and the audit trail), but only aggregate tallies are ever shown to *anyone else* — secret even from the Group Admin, not just from ordinary members (ticket 12). "Secret from people, accountable to the system."

**Report** — a generated summary (financial, contribution, loan, governance) over Groups' data.

**Year-end Share-out** — once a year the group's profit is paid to members in cash (added 2026-11-26). Profit = loan interest + late penalties collected in the year − Miscellaneous Charges paid that year (Jamii never counts). Split by shares held at year end, each share rounded down to the shilling (the remainder stays in the fund); savings are untouched. The Treasurer prepares it, the Group Admin approves or rejects (with a reason), then the Treasurer records each member's payout (`profit_share` ledger entry). Year boundaries in East Africa Time.

**Announcement status** — Draft (only Admin/Treasurer see it), Active (members see it; notified the first time only), Archived (still readable in the archive; can be activated again), Deleted (Group Admin only; hidden from everyone, its text kept in the audit log). Edits show "Edited" with date and time and keep the old text in the audit log.

**Locked Group Rules** — contribution amount and frequency, share value, loan interest, weekly late penalty and Jamii amount, once the AtLast admin locks them (added 2026-11-26). Nobody can change them directly, not the Group Admin and not AtLast; a database guard blocks every other path. A change: the Group Admin proposes it with a reason → the AtLast admin opens an ordinary secret-ballot vote open to every active member (7 days) → once at least a third of active members (rounded up) vote yes, the AtLast admin approves (the new values apply) or rejects. Every step audited; members notified.

**Clean record** — what Home's Top Contributors board requires (2026-11-26): never a defaulted loan, nothing overdue, never a late penalty, every open loan at a 0% default rate.

## Roles (V1)

- **Member** — views own/permitted group info, contributes, requests loans, votes, sits on Three-Eye Panels when eligible.
- **Group Admin** — everything a Member can do, plus manages membership, verifies contributions, manages group settings, generates reports, appoints the Treasurer and approves the Year-end Share-out.
- **Treasurer** (added 2026-11-26) — one Member per Group, appointed by the Group Admin (never the admin themself, so money always has two people on it). Handles the money side: pays out approved loans, Jamii and charges, reconciliation and balance checks, reports, prepares the Year-end Share-out and records its payouts, posts and manages announcements. Cannot approve members, loans, rates, reversals or the share-out, and cannot delete announcements.
- **AtLast admin** (System Admin, `profiles.is_system_admin`) — the platform owner's oversight of each group (added 2026-11-26). Enters a group's key rules and locks them; opens member votes on proposed changes and approves or rejects them. Can never be the Group Admin of the group they oversee. Works from the AtLast Console (More → AtLast Console), which lists every group without needing membership.

## Out of scope for V1 (deferred to later platform layers)

Analytics/insights dashboards, in-app group chat, help center, payments marketplace, advanced admin dashboards beyond the core financial dashboard, multi-language support (beyond English baseline), sophisticated/AI-driven notifications, live payment-gateway integration, offline-first sync, formal KYC/document verification, Treasurer/Secretary/Auditor as distinct roles, end-of-year Share Valuation and Profit Distribution.
