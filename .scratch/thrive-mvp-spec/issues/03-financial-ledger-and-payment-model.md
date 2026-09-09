Type: grilling
Status: resolved

## Question

What is the source of truth for money in the system, and does V1 move real money through a live payment integration?

## Answer

- **Event-sourced ledger**: the system's financial truth is the stream of Transactions (Contribution +50,000, Loan -300,000, Repayment +50,000, ...). A Group's balance is **never** a stored field — it is always derived by summing its Transactions. This keeps the record auditable and reconcilable, per the white paper's trust-architecture requirement that material financial events be traceable.
- **No live payment gateway in V1**: contributions and repayments are record-and-verify — a member reports having paid (e.g. a mobile-money reference), and a Group Admin verifies and marks it received. No payment API moves real money in this version.
- Rationale: this keeps V1 inside the "AI + product owner" build boundary from [Scope & build philosophy](01-scope-and-build-philosophy.md) — real payment integration is exactly the kind of "real money movement" that should wait for specialist involvement.
