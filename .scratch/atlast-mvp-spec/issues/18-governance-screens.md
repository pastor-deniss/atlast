Type: grilling
Status: resolved
Blocked by: 17

## Question

Spec the Governance screens: Vote Notification (how/when a member learns a Motion opened — ticket 09's "notification design" is still an open map item, so at minimum define what triggers this in-app), Applicant Profile (what an active member sees about the applicant before voting), Cast Vote (secret ballot per ticket 12 — approve/decline, one-time), Vote Submitted, Vote Results (via the `motion_tallies` aggregate view — shown when, to whom, before vs. after `closes_at`), Membership Approved/Declined outcome screens, and the admin-side Membership Review (pre-screen: application detail, Reject vs. Initiate Vote per ticket 11's asymmetric gate). Cover the fail-fast-extended-to-Motions behavior from ticket 13 Q1: does a voter ever see "this motion already resolved" if they open Cast Vote after fail-fast fired but before `closes_at`?

## Answer

One schema addition: `memberships.application_note` (nullable text, added to `database-blueprint.sql`, ticket 08, and ticket 13's `applyToJoinGroup`) — the applicant's optional "reason for joining," shown to voters. Deliberately **not** added: `occupation`, or any contribution-history/community-involvement figure for the applicant — same "Atlast doesn't manufacture trust scores" principle ticket 17 already locked for loan reviewers, even more clearly warranted here since an applicant isn't yet a member of the group at all.

| Screen | Content / behavior |
|---|---|
| **Governance tab** (replaces the mockup's push-style "Vote Notification" — no push notifications in V1) | Lists open Motions for the member's group, each showing applicant/subject, "Your vote: Not yet cast / Cast", days remaining |
| **Motion Detail / Applicant view** | Applicant's name, photo, `application_note` if provided — no contribution/community-involvement fields |
| **Cast Vote** | `[Approve]` / `[Decline]`, secret ballot copy | **No running tally shown** — a governance-integrity choice (bandwagon-effect prevention), not just a privacy one; `motion_tallies` stays technically queryable via RLS but this screen never surfaces it while `status='open'` |
| **Vote Submitted** | Confirmation | — |
| **Vote Results** | Aggregate only (`motion_tallies`), shown only once `motions.status != 'open'` | — |
| **Membership Approved / Declined** | Outcome | — |
| **Admin Membership Review** | Applicant's name, photo, `application_note` — `[Reject]` / `[Initiate Vote]` | No contribution-history/community-involvement fields here either (same fix as the voter-facing screen) |

**Fail-fast + concurrency (Q5)**: `castVote` checks `motions.status = 'open'` and re-tallies inside one transaction before inserting — the same atomic check-then-write pattern as `castLoanReviewDecision` (ticket 10/13), so two members voting simultaneously right at the threshold can't both succeed past resolution. A member opening Cast Vote after fail-fast already resolved a motion sees the outcome screen directly, never a vote prompt — enforced server-side, not just a disabled button (two concurrent opens could otherwise race past a client-only check).
