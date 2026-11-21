Type: grilling
Status: resolved

## Question

Design the core identity & group schema: User, Profile, Group, Membership. Tables, columns, relationships, and constraints — consistent with the domain glossary (CONTEXT.md), the many-to-many User↔Group relationship via Membership (see [scope boundaries decision](06-scope-boundaries-offline-multigroup-identity.md)), and the V1 roles (see [roles decision](04-v1-roles-and-permissions.md)). Update CONTEXT.md as terms sharpen.

## Answer

```
auth.users (Supabase-managed) — id, phone, created_at, ...
  Source of truth for verified phone + session. Phone/OTP confirmed feasible
  via signInWithOtp/verifyOtp — see issue 07.

profiles  (1:1 with auth.users)
  id              uuid PK, references auth.users(id)
  phone           text, unique, not null      -- denormalized for display/search
  first_name      text, not null
  last_name       text, not null
  photo_url       text, nullable              -- Storage path; usage still fog
  is_system_admin boolean, not null, default false   -- global, NOT per-group
  created_at      timestamptz, not null, default now()
  updated_at      timestamptz, not null, default now()

  Reputation (loan-review eligibility) is deliberately NOT a column here — it's
  derived from loan/repayment history at query time (ticket 10), the same
  "derive, don't store" principle already set for Group balances (ticket 03).
  The PIN itself is never stored here either — per issue 07 it's a fully local,
  device-side hash and never touches the database.

groups
  id          uuid PK, default gen_random_uuid()
  name        text, not null
  description text, nullable
  country     text, not null       -- e.g. 'TZ'
  currency    text, not null       -- ISO 4217, e.g. 'TZS'
  created_by  uuid, references profiles(id), not null
  status      text, not null, default 'active'   -- active | archived
  created_at  timestamptz, not null, default now()

  V1 has no in-app "create group" flow: a System Admin creates the pilot Group
  directly and assigns its first Group Admin. created_by is still modeled so a
  self-serve creation flow can be added later without a schema change.
  Contribution-cycle settings (frequency, expected amount) live with ticket 09.

memberships   (many-to-many join; one row per user-group pair, ever)
  id           uuid PK, default gen_random_uuid()
  user_id      uuid, references profiles(id), not null
  group_id     uuid, references groups(id), not null
  role         text, not null, default 'member'   -- member | group_admin
  status       text, not null, default 'pending'  -- pending | active | declined | exited
  applied_at   timestamptz, not null, default now()
  decided_at   timestamptz, nullable
  UNIQUE (user_id, group_id)   -- rejoining after 'exited' updates this row

  Models the mockup's apply -> review -> approve/decline flow as status
  transitions on one row, rather than a separate Application table, so history
  stays attached even if someone rejoins. A bootstrap exception applies: the
  first Group Admin and any seed members of a newly-created group are inserted
  directly as 'active' (no vote possible — there's no one to vote yet).

  decision_motion_id (added by ticket 11, once Motion/Vote schema exists):
  nullable FK to motions(id).

  application_note (added by ticket 18): nullable text — the applicant's
  optional "reason for joining," shown to voters during Governance review.
```

> **Corrected by [ticket 11](11-governance-schema.md)'s grilling**: membership *admission* is decided by a Governance vote — a Group Admin may pre-screen and reject an application outright (no Motion, no vote), but can never admit a member unilaterally. The original wording above ("decided by a Governance vote... not a single Group Admin") is right about admission, but didn't account for the Admin's unilateral-reject path the mockup actually shows.

**Invariant carried forward to ticket 13 (API contract/Edge Functions)**, since it can't be enforced by a column constraint alone: every Group must have at least one Membership with `role='group_admin'` and `status='active'` at all times — the last Group Admin can't leave/be demoted without another being promoted first.
