Type: grilling
Status: resolved (Q4 pending — see below)
Blocked by: 14

## Question

Spec the Home, Group, and Members screens: Home dashboard (post-login landing — what does a brand-new user with no group see vs. an active member?), Join a Group (search/browse per ticket 12's public `groups` discovery, apply), Group Dashboard (own-group summary: balance, contributions, loan status, shares — which of ticket 09's derived views feed which widget), and Member Directory (roster, using `profiles_public` from ticket 12 — what's shown per member: name/photo/role/status, anything else). Also the application-pending state: what does an applicant see while their `memberships` row is `pending` (pre-vote and mid-vote), and what does a `declined` applicant see.

## Answer

One item surfaced here changed a schema/API file, not just this one — see the "one open loan per member" addition now in [ticket 10](10-loan-and-repayment-schema.md), `database-blueprint.sql`, and ticket 13's `requestLoan`.

| Screen | Content | Notes |
|---|---|---|
| **Home** | Greeting, group name, "Your Contributions" (`member_contribution_totals.total_contributed`), "Your Shares" (`.total_shares`), "View details →", 4 shortcuts (Contribute → 16, Loan → 17, Vote → 18, Reports → 19) | Personal snapshot + action center (Q1) |
| **Group Dashboard** | Group name, active member count, `contribution_frequency`/`contribution_amount`, `share_value`, "Loan availability" (Q2: per-member — `Available` iff the viewer has no row in `loans` with a non-terminal status in *this* group, per the new one-open-loan rule), `[Member Directory]`, "Your Status" (`memberships.role`/`status`, e.g. "Active Member" / "Group Admin") | Group-wide info (Q1) |
| **Member Directory** | Active memberships only, joined to `profiles_public` (ticket 12): name, photo, role badge. Sorted alphabetically. | Exited/declined members excluded (Q3) — their transaction history stays visible elsewhere per ticket 12's transparency rule, just not in this roster |
| **Member Profile** (tap-through) | Name, photo, role, join date — `coalesce(decided_at, applied_at)` so bootstrap admins/seed members (who never had a `decided_at` set, having skipped the vote) still show a sensible date | No phone, no financial detail about that member — matches ticket 12's `profiles_public` scoping exactly (Q3) |
| **Join a Group** | Search input; results from `groups` (public discovery, ticket 12): name, description, member count, `contribution_frequency`/`contribution_amount`, `share_value`; `[Apply to Join]` | No "chosen by N friends" badge (Q5) — that needs contacts-permission + phone matching, undesigned anywhere in this spec |
| **Application Received** | Confirmation + `[Back to Home]` | Copy corrected from the mockup's "You will be notified after voting" — inaccurate given ticket 11's flow: the *first* step is an Admin pre-screen (which may reject outright, no vote at all). Uses neutral wording instead: "Your application has been received and is being reviewed." |
| **Welcome / Approved** | `[Enter My Group]` | Shown once, the first time the app detects this membership's `status` has become `active` since it was last seen `pending` (a simple local "have I shown this" flag — V1 has no push notifications, so this is how the applicant finds out at all) |

**Q4 — left open, no design decision made from it.** The third "Membership"-titled screen (unclear figures, possibly a per-member-vs-group Shares breakdown) doesn't create any new table, column, view, or navigation destination. If a higher-resolution source becomes available, revisit; until then this ticket's scope is exactly the screens above.
