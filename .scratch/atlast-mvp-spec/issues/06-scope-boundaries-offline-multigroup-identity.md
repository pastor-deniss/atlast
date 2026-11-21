Type: grilling
Status: resolved

## Question

Three smaller scope boundaries needed pinning down: does V1 need offline-first sync, can a user belong to more than one group, and is there a formal identity-verification (KYC) step?

## Answer

- **Offline support**: deferred. The mockup's "Low data / Offline-aware" claim is not a V1 requirement — a single pilot group with phone connectivity doesn't need offline-first sync to prove the cycle works, and it's a significant architecture cost (conflict resolution, local queues) better tackled after the core loop is validated.
- **Multi-group membership**: modeled in the schema as many-to-many (Membership as a join table between User and Group, matching the mockup's "My Groups" list) since it costs nothing extra structurally — but only the single-group flow is actually built and tested for the pilot.
- **Identity verification**: phone number + profile info only. No formal KYC/document-upload step in V1, matching the white paper's own "Concept Edition" caution that formal regulatory/KYC review comes before real financial services go live.
