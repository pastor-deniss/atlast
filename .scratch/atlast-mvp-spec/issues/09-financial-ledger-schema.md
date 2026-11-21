Type: grilling
Status: resolved

## Question

Design the financial ledger schema: Contribution, Share, and the Transaction (ledger event) table(s), plus how Group balance is derived (view/function, not a stored column) — consistent with the event-sourced principle in [financial ledger & payment model](03-financial-ledger-and-payment-model.md). Define what a Transaction row looks like precisely enough that Contributions, Loan disbursements, and Repayments (see the loan schema ticket) can all be expressed as Transactions.

## Answer

Grilled against the mockup (Treasurer Transactions list, Contribution Receipt, Reconciliation flow, Membership share-value screen), which surfaced two decisions not implied by ticket 03's wording alone: contributions post immediately rather than sitting in a pending/admin-verify gate, and reconciliation — not per-contribution approval — is the actual verification mechanism.

```
transactions   (the authoritative ledger — append-only, never edited or deleted)
  id                       uuid PK, default gen_random_uuid()
  group_id                 uuid, references groups(id), not null
  member_id                uuid, references profiles(id), not null
  loan_id                  uuid, references loans(id), nullable
                                        -- set for loan_disbursement/repayment only (ticket 10); null
                                        -- for contribution/reversal
  type                     text, not null
                                        -- contribution | loan_disbursement | repayment | reversal
                                        -- TEXT + app/DB check constraint, deliberately NOT a Postgres
                                        -- ENUM, so a future type (profit_distribution, fee, penalty,
                                        -- adjustment — see Out of scope below) can be added without a
                                        -- migration that alters an enum type.
  amount                   numeric, not null
                                        -- SIGNED: positive = into group fund, negative = out.
                                        -- Matches the mockup's Treasurer Transactions list directly
                                        -- ("Contribution +10,000", "Loan disbursement -80,000").
  shares_earned             integer, not null, default 0
                                        -- signed; set on contribution, negated on a reversal of one.
                                        -- Stored directly on the row (an exception to "derive, don't
                                        -- store") because it's a fact fixed at the moment of that
                                        -- specific ledger event, not an aggregate — same reasoning as
                                        -- amount itself.
  status                   text, not null, default 'posted'
                                        -- posted | reconciled | investigate
                                        -- "posted" is what the member sees as "Confirmed" — recording
                                        -- is not the same as verification. See reconciliation_cases:
                                        -- verification happens after the fact, in bulk, and never
                                        -- blocks posting.
  reference                 text, nullable    -- e.g. mobile-money reference, member-supplied at report time
  description                text, nullable
  reversed_transaction_id    uuid, references transactions(id), nullable
                                        -- set only on a type='reversal' row; points at the row it
                                        -- corrects. Mistakes are never edited/deleted — always a
                                        -- compensating reversal (-amount, -shares_earned), plus a fresh
                                        -- correct transaction if needed. Full history stays visible.
  created_by                 uuid, references profiles(id), not null
  created_at                 timestamptz, not null, default now()

  Group balance = SUM(amount) over a group's transactions — a view/function, never a stored column,
  per the derive-don't-store principle from ticket 03. Member contribution total / share count =
  SUM(amount) / SUM(shares_earned) filtered by member_id — also derived at query time, same as
  Reputation in ticket 08.

reconciliation_cases   (lightweight — the actual verification mechanism, per-transaction, run in bulk)
  id                    uuid PK, default gen_random_uuid()
  group_id              uuid, references groups(id), not null
  transaction_id        uuid, references transactions(id), not null
  provider              text, not null              -- e.g. 'mpesa'
  provider_reference    text, nullable
  provider_amount       numeric, not null
  provider_timestamp    timestamptz, nullable
  status                text, not null, default 'investigate'   -- matched | investigate | resolved
  discrepancy_reason    text, nullable
  notes                 text, nullable
  resolved_by           uuid, references profiles(id), nullable
  resolved_at           timestamptz, nullable
  created_at            timestamptz, not null, default now()
  updated_at            timestamptz, not null, default now()

  A match sets the linked transaction's status to 'reconciled'; a mismatch sets it to 'investigate'
  and opens a case row here. Reconciliation never edits the transaction itself — a confirmed
  discrepancy is corrected the same way any other mistake is, via a reversal (above); this table
  tracks the investigation, not the fix.

groups   (additions to the ticket 08 schema — the "frequency, expected amount" ticket 08 deferred here)
  contribution_frequency   text, not null       -- e.g. 'weekly'
  contribution_amount      numeric, not null    -- expected contribution per cycle
  share_value              numeric, not null    -- e.g. 10000
                                        -- a contribution amount must be an exact multiple of this to
                                        -- earn shares. V1 has no fractional shares — a non-multiple
                                        -- amount is rejected/flagged at entry (validated where the
                                        -- transaction is created — see ticket 13 — not silently rounded).
```

**Out of scope for this ticket, deferred to Layer 2**: end-of-year Share Valuation and Profit Distribution (the mockup's annual Valuation → Distribution flow). It's a once-a-year batch process orthogonal to the single pilot-group cycle this spec targets, and pulls in valuation-methodology decisions not yet scoped. `type` is kept as open TEXT specifically so `profit_distribution` can be added later without redesigning the ledger.

**Invariant carried forward to ticket 13** (API/Edge Functions, alongside the last-Group-Admin invariant from ticket 08): a contribution's amount-must-be-a-multiple-of-`share_value` rule needs a user-facing reject/flag response, so it's enforced at the API layer (with a DB check constraint as a backstop), not left to the client.

**Central principle locked here**: record once, never erase, reconcile later, correct through reversal, derive the truth from the ledger.
