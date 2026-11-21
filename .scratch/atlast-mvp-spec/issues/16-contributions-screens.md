Type: grilling
Status: resolved
Blocked by: 15

## Question

Spec the Contributions screens: Make Contribution (amount input, payment method, reference entry), Contribution Receipt (post-`reportContribution` success state — shares earned, reference, "Confirmed" status), and Contribution History (list of past contributions for this member). Validation/error states: what happens client-side and server-side when the amount isn't an exact multiple of `share_value` (ticket 09's invariant, enforced in `reportContribution` per ticket 13) — does the UI pre-validate/round/suggest before submit, or just surface the server's rejection? What does a `reconciliation_cases` mismatch ever surface to the member, if anything, given reconciliation is Group-Admin-only (ticket 12)?

## Answer

The reconciliation-visibility question this ticket itself raised was already settled by ticket 12's RLS, not a fresh decision: a member cannot query `reconciliation_cases` at all, so their Contribution History always shows "Confirmed" (`transactions.status = 'posted'`) regardless of the underlying reconciliation state — a mismatch is Admin-only (ticket 19), and per ticket 09's reversal principle, a discovered mismatch is never silently applied to the member's original transaction, only corrected via a compensating reversal the member would see as a separate line.

| Screen | Content | Notes |
|---|---|---|
| **Make Contribution** | Amount (free numeric), Payment Method (fixed "Mobile Money" — no selector, matches ticket 03's mobile-money-centric V1 scope), Reference (required free text — the mobile-money confirmation code) | Live client-side validation as the amount is typed: multiple-of-`share_value` → inline "✓ N Shares" or "⚠ Must be a multiple of TZS X", Submit disabled until valid. `reportContribution` (ticket 13) remains the actual enforcement point — this is a UX nicety, not the security boundary. |
| **Contribution Success / Receipt** | Amount, Payment Method, Reference, Shares Earned, Status "Confirmed" | No PDF generation in V1 (same undesigned-capability gap as report export, ticket 13/19). If a share action is kept at all, it's the native OS share sheet with a plain-text summary — not document generation. |
| **Contribution History** | List of the member's own `contribution` transactions: date, amount, status badge (always "Confirmed" per the FYI above) | `[View All]` paginates further back |
| **Your Growth chart** (folded in from ticket 15, Q6) | Bar chart, one bar per contribution period, over the **last 12 periods** (weekly/monthly/etc. per `groups.contribution_frequency`) | **Correctness detail**: must show *net* contribution per period, not just `SUM(amount) WHERE type='contribution'` — that alone would ignore reversals entirely, since a reversal row has `type='reversal'`, not `'contribution'`. The correct query attributes a reversal's amount back to the *original* contribution's period (via `reversed_transaction_id`), not the reversal's own date, so a late correction nets against the period it actually corrects: `union` the member's `contribution` rows with `reversal` rows joined back to a `contribution`-typed `reversed_transaction_id`, then bucket by period and sum. Left as query logic specific to this one chart rather than a new blueprint view — nothing else in the spec needs this shape. |

**Not built in V1**: a payment-method selector (Mobile Money is the only option), PDF receipt generation.
