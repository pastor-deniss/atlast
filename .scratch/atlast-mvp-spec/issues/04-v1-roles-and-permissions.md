Type: grilling
Status: resolved

## Question

What roles exist in V1, and does the mockup's Treasurer dashboard need its own role?

## Answer

Only three roles in V1, deliberately not ten:

- **Member** — views own/permitted group info, contributes, requests loans, votes on Governance motions, sits on a Loan Review Panel when eligible.
- **Group Admin** — everything a Member can do, plus manages membership, verifies contributions, manages the loan workflow, initiates governance actions, generates reports, manages group settings. The mockup's Treasurer dashboard capabilities live inside Group Admin for V1 rather than as a separate role.
- **System Admin** — platform-level (support, org management, security, audit); relevant once Atlast runs more than a pilot group, not a V1 build priority.

Treasurer/Secretary/Auditor may split out of Group Admin later, once real group usage shows where the seams actually are — not designed in speculatively now.
