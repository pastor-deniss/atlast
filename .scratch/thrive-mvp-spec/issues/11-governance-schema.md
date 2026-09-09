Type: grilling
Status: resolved

## Question

Design the Governance schema: Motion and Vote tables, and the membership-decision workflow (e.g. "should Grace become a member?") shown in the mockup — quorum/threshold rules, who can raise a Motion, and how a closed vote's outcome is recorded. Confirm and encode the boundary from [loan approval mechanism](05-loan-approval-mechanism.md): Governance covers membership/constitutional decisions only, never loan approval.

Note from [core identity & group schema](08-core-identity-and-group-schema.md): membership applications (`memberships.status: pending → active/declined`) are decided via a Governance Motion+Vote, not a direct Group Admin action. When this ticket resolves, `memberships` will need a nullable `decision_motion_id` column added to link a Membership to the Motion that decided it. The first Group Admin and any seed members of a newly-created group are a bootstrap exception — inserted directly as `active` with no vote, since a brand-new group has no existing members to vote.

## Answer

Grilling this ticket refined — not reversed — ticket 08's membership-decision principle: the mockup's Membership Review screen gives the Group Admin a direct **Reject**, alongside **Initiate Vote**. So it's not "every application goes to a vote"; it's "an Admin may reject unilaterally, but may never admit unilaterally — admission is always decided by the members." Ticket 08 is corrected below to say this precisely.

```
motions
  id                       uuid PK, default gen_random_uuid()
  group_id                 uuid, references groups(id), not null
  type                     text, not null, default 'membership_application'
                                    -- TEXT, not a closed enum — same pattern as transactions.type
                                    -- (ticket 09). V1 supports only 'membership_application', enforced
                                    -- at the application layer even though the column itself stays
                                    -- open for constitutional/other Motion types later (Layer 2).
  subject_membership_id     uuid, references memberships(id), not null
                                    -- the pending Membership this Motion decides. Not-null because V1
                                    -- has exactly one Motion type; a future non-membership type would
                                    -- need this nullable.
  raised_by                  uuid, references profiles(id), not null   -- the Group Admin who Initiated the Vote
  status                     text, not null, default 'open'    -- open | approved | declined
  opens_at                   timestamptz, not null, default now()
  closes_at                  timestamptz, not null
                                    -- opens_at + 7 days (hardcoded V1 constant, not a group setting),
                                    -- computed and stored once at creation rather than derived at read
                                    -- time — so a later change to the standard window doesn't
                                    -- retroactively alter the voting period of a Motion already open.
  decided_at                  timestamptz, nullable
  created_at                  timestamptz, not null, default now()

votes
  id            uuid PK, default gen_random_uuid()
  motion_id     uuid, references motions(id), not null
  voter_id      uuid, references profiles(id), not null
  choice        text, not null    -- approve | decline
  voted_at      timestamptz, not null, default now()
  UNIQUE (motion_id, voter_id)

  Confidential, not anonymous: voter_id and choice are both stored together — needed for
  one-vote-per-member enforcement and the audit trail the mockup itself advertises ("Fraud checks",
  "Audit trail"). Confidentiality is an RLS/application concern (ticket 12): ordinary members only
  ever see aggregate tallies, never who-voted-what. "Secret from members; accountable to the system."

memberships   (addition to the ticket 08 schema, now that `motions` exists)
  decision_motion_id   uuid, references motions(id), nullable
                                    -- set once a Motion resolves this Membership. Stays nullable for
                                    -- two paths that decide a Membership WITHOUT a Motion ever
                                    -- existing: the ticket-08 bootstrap exception (first Group
                                    -- Admin/seed members), and an Admin's direct pre-screen Reject
                                    -- (no vote, no Motion row at all).
```

**Resolution rule**: when `closes_at` passes, tally `votes` for that Motion — `approve` count vs `decline` count decides, no minimum quorum (whatever turnout occurred by the deadline is final). A tie defaults to `declined` (status-quo default — doesn't admit a member on an inconclusive vote); not separately asked in the grilling round, flagged here as a reasonable default rather than a locked decision, in case a real tie in the pilot group calls for revisiting it.

**Scope**: `membership_application` is the only Motion type built in V1. General constitutional Motions (contribution-policy changes, leadership, special expenditure, etc.) are Layer 2 — `motions.type` is left open (TEXT) specifically so they can be added later without a redesign.

**Ticket 08 correction** (see that ticket's file for the amended line): "Membership applications are decided by a Governance vote" is refined to "Membership *admission* is decided by a Governance vote; a Group Admin may pre-screen and reject an application outright, but can never admit a member unilaterally."
