Type: grilling
Status: resolved

## Question

What does "developing the Atlast mobile app" actually mean as a destination — a build-ready spec vs. working code, how much of the white paper's long-term vision it covers, and who builds it once the spec exists?

## Answer

- **Destination artifact**: a build-ready engineering & product spec (screen behavior, data model, API contracts, RLS rules, financial model, validation, acceptance criteria) — not code. This map produces the spec only.
- **Scope**: not "build every screen in the mockup." It is: build **one complete community-finance cycle** end to end — User → Account → Join Group → Membership → Contribution → Group Balance → Loan Request → Loan Review Panel Approval → Disbursement → Repayment → Report. This is the Layer-1 MVP per the white paper's own "start with one group" philosophy.
- **Screen scope trimmed accordingly** to ~32 screens across 9 sections: Access (Splash/Welcome/Sign Up/Sign In/Phone Verify/Profile Setup), Home, Group (My Groups/Group Dashboard), Members, Contributions, Loans, Governance, Reporting, Profile/Settings/Security. Deferred out of V1 entirely: Analytics, in-app chat, help center, payments marketplace, advanced admin dashboards beyond the core financial dashboard, multi-language beyond English, AI-driven/sophisticated notifications (see map's Out of scope).
- **Who builds it**: the user remains product owner; initial build is AI-assisted (Claude Code) rather than an agency or technical co-founder. A human specialist (security/payments/compliance) is brought in once the product approaches real money movement, payment integration, production security, or regulatory exposure — not before.
- **Product philosophy**: build the smallest *complete* system, not the smallest number of screens.
