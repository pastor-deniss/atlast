-- THRIVE MVP — V1 DATABASE BLUEPRINT
-- Consolidates the resolved schema decisions from:
--   ticket 08 (core identity & group), 09 (financial ledger), 10 (loan & repayment),
--   11 (governance: motion/vote)
-- Source of truth for rationale/trade-offs remains each ticket file — this is the
-- build-ready DDL those decisions compile down to. Not yet covered: RLS policies
-- (ticket 12) and the API/Edge Function contract (ticket 13) — both still open.
--
-- Standing principles carried through every table below:
--   - "Derive, don't store": balances, reputation, and loan progress are never
--     stored columns — they're views over transactions/loans (see the bottom
--     of this file).
--   - No Postgres ENUM types: every category column is TEXT + a CHECK constraint
--     naming only the values V1 supports. Extending scope later (e.g. a
--     profit_distribution transaction type, a constitutional motion type) means
--     widening a CHECK constraint, never an ALTER TYPE migration.
--   - Nothing financial is ever UPDATEd or DELETEd once posted — corrections are
--     always a new compensating row (a reversal transaction, a fresh loan).

-- ============================================================================
-- IDENTITY & GROUP  (ticket 08)
-- ============================================================================

-- auth.users is Supabase-managed (id, phone, created_at, ...). Source of truth
-- for verified phone + session (signInWithOtp/verifyOtp — ticket 07).

create table profiles (
  id                uuid primary key references auth.users(id),
  phone             text not null unique,        -- denormalized for display/search
  first_name        text not null,
  last_name         text not null,
  photo_url         text,                         -- Storage path; V1 usage still undecided
  is_system_admin   boolean not null default false,  -- global flag, NOT per-group
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
  -- Reputation and PIN are deliberately NOT columns here: reputation is derived
  -- (see loan_reviewer_eligibility view below), PIN is a fully local device-side
  -- hash that never touches the database (ticket 07).
);

create table groups (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  description             text,
  country                 text not null,          -- e.g. 'TZ'
  currency                text not null,           -- ISO 4217, e.g. 'TZS'
  created_by              uuid not null references profiles(id),
  status                  text not null default 'active'
                            check (status in ('active', 'archived')),
  contribution_frequency  text not null,           -- e.g. 'weekly'      (ticket 09)
  contribution_amount     numeric not null,        -- expected contribution/cycle (ticket 09)
  share_value             numeric not null,        -- e.g. 10000; contribution must be an
                                                     -- exact multiple to earn shares (ticket 09)
  created_at              timestamptz not null default now()
  -- V1 has no in-app "create group" flow — a System Admin creates the pilot Group
  -- directly and assigns its first Group Admin. created_by is still modeled so a
  -- self-serve flow can be added later without a schema change.
);

create table memberships (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references profiles(id),
  group_id             uuid not null references groups(id),
  role                 text not null default 'member'
                         check (role in ('member', 'group_admin')),
  status               text not null default 'pending'
                         check (status in ('pending', 'active', 'declined', 'exited')),
  applied_at           timestamptz not null default now(),
  decided_at           timestamptz,
  decision_motion_id   uuid,        -- FK added below, after `motions` exists (circular reference)
  application_note     text,        -- optional "reason for joining", shown to voters (ticket 18) —
                                     -- nullable so the UI can encourage it without requiring it
  unique (user_id, group_id)        -- rejoining after 'exited' updates this row, never a new one
);
-- INVARIANT (enforced at the API layer, ticket 13 — not expressible as a column
-- constraint): every group must have >=1 membership with role='group_admin' AND
-- status='active' at all times. The last Group Admin can't leave/be demoted
-- without another being promoted first.

-- ============================================================================
-- GOVERNANCE  (ticket 11)
-- ============================================================================

create table motions (
  id                       uuid primary key default gen_random_uuid(),
  group_id                 uuid not null references groups(id),
  type                     text not null default 'membership_application'
                             check (type in ('membership_application')),
                             -- V1 builds only this one type. Column is TEXT so a
                             -- 'constitutional' type (Layer 2) can be added later
                             -- by widening this CHECK, not an enum migration.
  subject_membership_id    uuid not null references memberships(id),
  raised_by                uuid not null references profiles(id),  -- the Group Admin who Initiated the Vote
  status                   text not null default 'open'
                             check (status in ('open', 'approved', 'declined')),
  opens_at                 timestamptz not null default now(),
  closes_at                timestamptz not null,   -- opens_at + 7 days, computed & stored at
                                                     -- creation (not derived), so a later change
                                                     -- to the standard window doesn't retroactively
                                                     -- change an already-open Motion
  decided_at               timestamptz,
  created_at               timestamptz not null default now()
);

-- Circular reference: memberships.decision_motion_id -> motions, motions.subject_membership_id -> memberships.
alter table memberships
  add constraint memberships_decision_motion_id_fkey
  foreign key (decision_motion_id) references motions(id);
  -- Stays nullable: two paths decide a Membership with NO Motion ever created —
  -- the ticket-08 bootstrap exception (first admin/seed members), and a Group
  -- Admin's direct pre-screen reject (see motions.status check above: an
  -- outright reject never creates a motions row at all).

create table votes (
  id           uuid primary key default gen_random_uuid(),
  motion_id    uuid not null references motions(id),
  voter_id     uuid not null references profiles(id),
  choice       text not null check (choice in ('approve', 'decline')),
  voted_at     timestamptz not null default now(),
  unique (motion_id, voter_id)
  -- Confidential, not anonymous: voter_id + choice are both stored (one-vote-
  -- per-member enforcement, audit trail). RLS (ticket 12) restricts ordinary
  -- members to aggregate tallies only — never who-voted-what.
);
-- Resolution rule: when closes_at passes, approve-count vs decline-count decides;
-- no minimum quorum. A tie defaults to 'declined' (status-quo default — an
-- implementation default, not a separately-grilled decision).

-- ============================================================================
-- LOANS  (ticket 10, revising ticket 05's panel size)
-- ============================================================================

create table loans (
  id                    uuid primary key default gen_random_uuid(),
  group_id              uuid not null references groups(id),
  borrower_id           uuid not null references profiles(id),
  principal             numeric not null,
  purpose               text,
  term_weeks            integer not null,
  installment_amount    numeric not null,     -- principal / term_weeks; zero-interest V1 (see below),
                                                -- so total repayable = principal. Reference/display
                                                -- only — no due-date schedule table, nothing enforces it.
  status                text not null default 'pending_review'
                          check (status in (
                            'pending_review', 'approved', 'declined',
                            'disbursed', 'repaying', 'repaid', 'defaulted'
                          )),
  review_mode           text not null
                          check (review_mode in ('three_eye', 'admin_fallback')),
  decided_at            timestamptz,
  decided_by            uuid references profiles(id),   -- set only on the admin_fallback path
  disbursed_at          timestamptz,
  defaulted_at          timestamptz,
  defaulted_by          uuid references profiles(id),   -- Group Admin who manually flagged it
  created_at            timestamptz not null default now()
  -- disbursed/repaying/repaid are ledger-driven, never set by hand: 'disbursed'
  -- when a loan_disbursement transaction posts, 'repaying' on the first
  -- repayment, 'repaid' once SUM(repayment amounts) >= principal (see
  -- loan_balances view below). Loan cost: zero-interest, zero-fee in V1.
);

-- One open loan per member per group (ticket 15, Q2 — surfaced while spec'ing
-- the Group Dashboard's "Loan availability" label; never explicitly locked in
-- ticket 05/10). DB-level backstop for the same rule requestLoan enforces
-- (ticket 13) — 'open' = anything not yet at a terminal status.
create unique index one_open_loan_per_borrower on loans (borrower_id, group_id)
  where status in ('pending_review', 'approved', 'disbursed', 'repaying');

create table loan_reviewers (
  id             uuid primary key default gen_random_uuid(),
  loan_id        uuid not null references loans(id),
  reviewer_id    uuid not null references profiles(id),
  decision       text not null default 'pending'
                   check (decision in ('pending', 'approve', 'decline')),
  decided_at     timestamptz,
  assigned_at    timestamptz not null default now(),
  unique (loan_id, reviewer_id)
  -- Exactly 3 rows per loan under review_mode='three_eye' (none under
  -- 'admin_fallback'). Random selection from loan_reviewer_eligibility (below),
  -- excluding the borrower and anyone with their own currently-open loan
  -- application. Fail-fast resolution: the loan resolves the instant 2 rows
  -- agree ('approve' -> approved, 'decline' -> declined) — the 3rd reviewer's
  -- still-'pending' row becomes moot, not waited on.
);

create table loan_clarification_requests (
  id            uuid primary key default gen_random_uuid(),
  loan_id       uuid not null references loans(id),
  reviewer_id   uuid not null references profiles(id),
  message       text not null,
  created_at    timestamptz not null default now()
  -- Non-blocking: does NOT change loan_reviewers.decision, does not count as a
  -- vote, and does not stop the other two reviewers from reaching the threshold.
);

-- ============================================================================
-- FINANCIAL LEDGER  (ticket 09)
-- ============================================================================

create table transactions (
  id                          uuid primary key default gen_random_uuid(),
  group_id                    uuid not null references groups(id),
  member_id                   uuid not null references profiles(id),
  loan_id                     uuid references loans(id),   -- set for loan_disbursement/repayment only
  type                        text not null
                                check (type in (
                                  'contribution', 'loan_disbursement', 'repayment', 'reversal'
                                )),
                                -- TEXT, not an enum: profit_distribution/fee/penalty/adjustment
                                -- (Layer 2) get added by widening this CHECK, never an ALTER TYPE.
  amount                      numeric not null,     -- SIGNED: positive = into group fund, negative = out
  shares_earned               integer not null default 0,  -- signed; stored on the row (a deliberate
                                                              -- exception to derive-don't-store: it's a
                                                              -- fact fixed at that specific ledger event)
  status                      text not null default 'posted'
                                check (status in ('posted', 'reconciled', 'investigate')),
                                -- 'posted' = member-visible "Confirmed". Recording != verification —
                                -- see reconciliation_cases, the actual verification mechanism, which
                                -- runs after the fact and never gates posting.
  reference                   text,          -- e.g. mobile-money reference, member-supplied
  description                 text,
  reversed_transaction_id     uuid references transactions(id),
                                -- set only on a type='reversal' row; mistakes are never edited or
                                -- deleted, only reversed (compensating -amount/-shares_earned row)
                                -- plus a fresh correct transaction if needed.
  created_by                  uuid not null references profiles(id),
  created_at                  timestamptz not null default now()
);

create table reconciliation_cases (
  id                    uuid primary key default gen_random_uuid(),
  group_id              uuid not null references groups(id),
  transaction_id        uuid not null references transactions(id),
  provider              text not null,          -- e.g. 'mpesa'
  provider_reference    text,
  provider_amount       numeric not null,
  provider_timestamp    timestamptz,
  status                text not null default 'investigate'
                          check (status in ('matched', 'investigate', 'resolved')),
  discrepancy_reason    text,
  notes                 text,
  resolved_by           uuid references profiles(id),
  resolved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
  -- A match sets the linked transaction's status to 'reconciled'; a mismatch sets
  -- it to 'investigate' and opens this case. Reconciliation never edits the
  -- transaction itself — a confirmed discrepancy is corrected via the normal
  -- reversal mechanism; this table tracks the investigation, not the fix.
);

-- ============================================================================
-- AUDIT  (ticket 13)
-- ============================================================================

create table audit_events (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid references groups(id),      -- nullable: platform/system-level events
  actor_id      uuid references profiles(id),     -- nullable: system-triggered (e.g. cron motion resolution)
  action        text not null,                     -- TEXT, not enum — same open-vocabulary pattern as
                                                     -- transactions.type/motions.type. V1 values:
                                                     -- 'membership.rejected', 'loan.disbursed',
                                                     -- 'loan.defaulted', 'transaction.reversed',
                                                     -- 'reconciliation.resolved'
  entity_type   text not null,                     -- 'membership' | 'loan' | 'transaction' | 'reconciliation_case'
  entity_id     uuid not null,
  reason        text,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);
-- Deliberately narrow (ticket 13, Q3): only discretionary Admin actions and
-- corrections get a row here. Routine events already carry their own audit
-- trail on their own table (loan_reviewers.decided_at, votes.voted_at,
-- transactions.created_by/created_at) — this table does not duplicate those.

create index on audit_events (group_id, created_at);

-- ============================================================================
-- DERIVED VIEWS — "derive, don't store" made concrete.
-- Implements rules already locked in tickets 03/05/08/09/10; not a new decision.
-- ============================================================================

-- Group balance = sum of the ledger. Never a stored column (ticket 03).
create view group_balances as
select group_id, coalesce(sum(amount), 0) as balance
from transactions
group by group_id;

-- Member contribution total + share count (ticket 09).
create view member_contribution_totals as
select
  group_id,
  member_id,
  coalesce(sum(amount) filter (where type = 'contribution'), 0) as total_contributed,
  coalesce(sum(shares_earned), 0) as total_shares
from transactions
group by group_id, member_id;

-- Loan repayment progress (ticket 10): drives loans.status transitions.
create view loan_balances as
select
  loan_id,
  coalesce(sum(amount) filter (where type = 'repayment'), 0) as total_repaid
from transactions
where loan_id is not null
group by loan_id;

-- Loan-reviewer / Three-Eye-Panel eligibility (ticket 05 + ticket 10):
-- a member qualifies if they have >=1 completed (repaid) loan in the group AND
-- have never had a loan default in that group.
create view loan_reviewer_eligibility as
select m.user_id as member_id, m.group_id
from memberships m
where m.status = 'active'
  and exists (
    select 1 from loans l
    where l.borrower_id = m.user_id and l.group_id = m.group_id and l.status = 'repaid'
  )
  and not exists (
    select 1 from loans l
    where l.borrower_id = m.user_id and l.group_id = m.group_id and l.status = 'defaulted'
  );

-- Borrower's "Eligible Amount" (ticket 13, Q2): hardcoded V1 rule, not a new
-- group setting — 3x a member's total contribution. This is the maximum a
-- member may request, not an auto-granted amount; the Three-Eye/Admin review
-- still decides the actual loan. A plain view, not an Edge Function: it's a
-- pure derived read with no side effects, same category as the views above —
-- the "backend, not the client, computes this" principle (ticket 13) is
-- satisfied by it being server-side derived data, not client-side arithmetic.
create view loan_eligibility as
select group_id, member_id, total_contributed * 3 as eligible_amount
from member_contribution_totals;

-- ============================================================================
-- INDEXES — common filters (group-scoped lists, per-member lookups, status filters).
-- Not a separately-grilled decision; baseline hygiene for a build-ready blueprint.
-- ============================================================================

create index on memberships (group_id, status);
create index on memberships (user_id);
create index on motions (group_id, status);
create index on votes (motion_id);
create index on loans (group_id, status);
create index on loans (borrower_id);
create index on loan_reviewers (loan_id);
create index on transactions (group_id, created_at);
create index on transactions (member_id);
create index on transactions (loan_id) where loan_id is not null;
create index on reconciliation_cases (group_id, status);

-- ============================================================================
-- RESOLVED ELSEWHERE
-- ============================================================================
-- Access control: rls-policies.sql (ticket 12) — RLS is read-only; every write
--   to the tables above goes through a Supabase Edge Function using the
--   service role (see ticket 13's Edge Function/RPC list, which is also where
--   the last-Group-Admin invariant (ticket 08) and the contribution-multiple-
--   of-share_value validation (ticket 09) are enforced).
