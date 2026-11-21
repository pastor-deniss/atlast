Type: grilling
Status: resolved
Blocked by: 18

## Question

Spec the Reporting & Admin screens — the mockup's Administrator Experience row (Admin Control Centre/"4 Actions Required" queue, Financial Dashboard, Reports/Generate Report, Audit Log) and Treasurer Experience row (Treasurer Home, Transactions list, Reconciliation Case, Resolved). Cover: what populates the Admin's "Actions Required" queue (pending memberships awaiting pre-screen, loans in `admin_fallback` review_mode, open `reconciliation_cases`, defaulted-loan alerts — is this a single derived query or several); what a generated Report actually contains and whether it's a live view or a persisted/exportable artifact (ticket 13 flagged this as undesigned); the Reconciliation workflow screens against `submitReconciliationRecord`/`resolveReconciliationCase` (ticket 13); and the Audit Log screen against the narrow `audit_events` table (ticket 13, Q3) — does it show literally every row, or is it filtered/paginated by entity type.

## Answer

No schema additions — the standing principle this ticket confirmed: *don't create a database object because the UI has a screen for it; create one only when there's a persistent fact that must be stored.* Reports, the Actions Required queue, and "My Records" are all screens with no such fact behind them, so none of them get a table.

| Screen | Content / behavior |
|---|---|
| **Admin Control Centre — Actions Required** | Client-side merge of three targeted reads, no new table: pending `memberships` (no motion yet), `loans` where `admin_fallback` + `pending_review`, `reconciliation_cases` where `investigate`. Defaults are informational only (V1's manual-flagging stance, ticket 10 Q6, means there's no "resolve this default" workflow to queue). Priority order: memberships → admin-fallback loans → reconciliation cases → default alerts. |
| **Financial Dashboard** | `group_balances.balance` ("Available Funds"), `member_contribution_totals` sums, `loan_balances` — all already-existing derived views, no new formula |
| **Reports** | Monthly / Quarterly / Annual only, period picked from available completed/current periods (no custom range). "Generate Report" = compute live from `transactions`/`loans`/`memberships` and render — no `reports` table, no persistence, no PDF export (same precedent as ticket 16's contribution receipt) |
| **Reconciliation Case / Investigate / Resolved** | Straightforward form over `submitReconciliationRecord`/`resolveReconciliationCase` (ticket 13) — enter provider amount/reference, system matches or flags, Admin adds notes and resolves; an actual correction is a separate `reverseTransaction` call, not part of this flow |
| **Audit Log** | Reverse-chronological, paginated list of `audit_events`, filterable by `entity_type` — already narrow-scoped (ticket 13, Q3), so no further filtering design needed |

**"My Records" (Q3) — resolved as out of scope, not left pending.** Unlike ticket 15's Q4, this one has a clear answer: it would compare "your records" against "group records," but both derive from the same `transactions` ledger — they'd trivially always match. A genuine reconciliation needs an independently-sourced second record, which V1 doesn't have on the member side (only the Admin-facing provider-statement reconciliation, above, has one). Nothing replaces it — the member's existing Contribution History already shows everything real.

**This closes ticket 15's Q4 as the only remaining genuinely-unresolved visual ambiguity in the whole spec** — not inferred, deliberately left open pending a clearer source image.
