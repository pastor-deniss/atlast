Type: grilling
Status: resolved

## Question

Spec the Identity & Access screens end to end: Splash → Welcome → Create Account → Verify Phone (OTP) → Create Thrive PIN, and the Profile/Settings/Security section (own profile view/edit, PIN/biometric re-entry gate, sign out). For each screen: what fields/inputs exist, validation rules, error states (bad OTP, expired code, duplicate phone, weak PIN, biometric unavailable), what happens on success, and how it maps onto the already-locked backend: `auth.users`/`profiles` (ticket 08), Supabase `signInWithOtp`/`verifyOtp`, and the local `AppLockGate` (PIN/biometric, never touches the DB) from ticket 07. Also: what happens after Verify Phone for a brand-new phone number (no group yet) vs. re-authenticating on a returning device.

## Answer

No schema changes: everything here is either client/local (`AppLockGate`, `expo-secure-store`) or Supabase Auth configuration — `database-blueprint.sql` and `rls-policies.sql` are unaffected. `profiles.phone unique not null` (ticket 08) already prevents the duplicate-account race Q1's refinement worried about — a concurrent second creation attempt just hits that constraint and fails, no new DB logic needed.

**Routing rule (Splash)**: checks local state, not a network call — valid Supabase session (`LargeSecureStore`) + a local PIN hash on this device → PIN unlock screen; valid session but *no* local PIN on this device (new/reinstalled device signing back into an existing account) → Create PIN; no session → Welcome. This single rule is what makes "Sign In" correctly re-prompt Create PIN on a new device (the PIN is device-local, per ticket 07 — an existing *account* signing in on a device that's never set a local PIN still needs to set one here) while a cold start on an already-set-up device skips straight to PIN unlock.

| Screen | Fields / inputs | Validation | Error states | On success |
|---|---|---|---|---|
| Splash | — | — | — | Routes per the rule above |
| Welcome | [Create Account] / [Sign In] | — | — | → Create Account or Sign In (phone-only variant) |
| Create Account | First Name, Last Name, Phone, Country (dropdown, dials the +country prefix — not a stored `profiles` column; `profiles` has no `country`, only `groups` does per ticket 08) | All required; phone valid E.164 for selected country; names non-empty | — | Calls `signInWithOtp({ phone, options: { shouldCreateUser: true, data: { first_name, last_name } } })` — metadata carries the name through to the `handle_new_user` trigger, since the `profiles` row can't exist until `auth.users` does. → Verify Phone |
| Sign In (phone-only) | Phone, Country | Phone valid E.164 | — | Calls `signInWithOtp({ phone, options: { shouldCreateUser: false } })` → Verify Phone |
| Verify Phone | 6-digit OTP (auto-advance per digit) | 6 digits | Wrong code (inline error, retry); expired code ("Code expired — resend"); Sign-In-only: OTP send/verify fails because no account exists → "No Thrive account found for this number — Create Account?"; resend disabled during the mockup's 30s cooldown | `verifyOtp(...)` succeeds → `handle_new_user` trigger creates `profiles` (Create Account path) or the existing row is found (Sign In path) → check local secure store for a PIN on *this device*: none → Create PIN; exists → Home |
| Create PIN | 6-digit PIN, Confirm PIN, biometric toggle (shown only if `expo-local-authentication` reports device capability) | Both 6 digits, must match; reject a short blocklist of trivial PINs (`000000`, `123456`, `111111`, etc. — a reasonable default, not separately re-confirmed) | Mismatch → inline error, re-enter | Hash via `expo-crypto`, store via `expo-secure-store`; if biometric enabled, register the platform biometric credential → Home |
| Forgot PIN (from the PIN-unlock screen) | Phone | same as Sign In | same as Verify Phone | `verifyOtp` succeeds → old local PIN/biometric secret invalidated (Q3) → Create PIN (reused) |
| Settings → Profile | Name (edit), Photo (add/change — optional, V1's *only* photo entry point; no onboarding photo step, Q4) | Name non-empty | Upload failure → retry | `UPDATE profiles` (self, via ticket 12's `profiles_update_self` policy) / Supabase Storage upload → `photo_url` |
| Settings → Security | Change PIN (re-enter current PIN, then Create-PIN flow), Biometric toggle | Current PIN must verify locally before allowing a change | Wrong current PIN → inline error | Local secure-store update only, no server call |
| Settings → Account | Sign Out (confirmation dialog — it's destructive to local state) | — | — | Q6: Supabase session cleared **and** local PIN/biometric secret wiped entirely → Welcome |

**Deferred, per Q5**: no Change Phone Number flow in V1 — nothing else in the spec needs it, and it would touch `profiles.phone`'s unique constraint in a way that deserves its own design pass later.
