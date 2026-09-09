Type: research
Status: resolved

## Question

The mockup's auth flow is: phone number → 6-digit SMS OTP → create a Thrive PIN (or Face ID / fingerprint) → subsequent sign-in via PIN/biometric. Does Supabase Auth support phone/OTP verification out of the box (and with what SMS provider requirements/costs), and what's the recommended way to layer an app-level PIN/biometric re-entry on top of a Supabase session for React Native/Expo? Produce a concrete recommendation: which Supabase Auth APIs to call for each step of this flow, any third-party SMS provider needed, and the standard pattern (library/approach) for local PIN/biometric gating of an existing Supabase session in Expo.

## Answer

**Verdict: the mockup's flow is fully feasible, and it maps onto two separate, independently-documented mechanisms that need to be composed by us — Supabase does not provide the local PIN/biometric layer itself.**

### 1. Supabase Auth: phone number + SMS OTP — supported natively

Supabase Auth has first-class phone OTP sign-in (passwordless, same primitive used for magic links, just over SMS instead of email).

- **Send code:** `supabase.auth.signInWithOtp({ phone: '+1...' })` — triggers a 6-digit code sent by SMS (or WhatsApp, for providers that support it).
- **Verify code:** `supabase.auth.verifyOtp({ phone: '+1...', token: '123456', type: 'sms' })` — on success this creates a real Supabase session (access token + refresh token), exactly like any other sign-in method. This *is* the point where the user is "logged in" from Supabase's point of view.
- **Change phone later:** `supabase.auth.updateUser({ phone: ... })`, which re-triggers OTP verification for the new number.

Supabase Auth does **not** send the SMS itself — it requires a third-party SMS provider configured under Auth settings. Supported providers (per docs): **Twilio**, **Twilio Verify**, **MessageBird**, **Vonage**, and community-supported **TextLocal**. Setup is: create an account with one of these providers, obtain API credentials (e.g. Twilio Account SID + Auth Token + a sending number or Messaging Service), then enter those credentials into the Supabase Dashboard's Phone auth provider settings (hosted projects) or the `auth.sms` config block (self-hosted/CLI). No code is needed on our side beyond calling the two functions above — Supabase handles code generation, expiry (default ~60s validity), and verification.

**Cost implication:** each OTP SMS is billed by the chosen provider (Twilio et al.), not by Supabase — this is a real per-message, ongoing operating cost that scales with signups/logins, not a one-time setup cost. Supabase's own guidance is to mitigate abuse/cost risk by configuring **rate limits** and **CAPTCHA (hCaptcha)** on the auth endpoints, since phone OTP endpoints are a known target for "SMS pumping" cost-attacks. Depending on target markets, some providers/countries impose extra registration requirements for SMS sending (e.g. India's TRAI DLT rules) — worth a note if Thrive ever targets those regions.

Sources: [Phone Login guide](https://supabase.com/docs/guides/auth/phone-login), [Twilio provider guide](https://supabase.com/docs/guides/auth/phone-login/twilio), [`signInWithOtp` reference](https://supabase.com/docs/reference/javascript/auth-signinwithotp), [`verifyOtp` reference](https://supabase.com/docs/reference/javascript/auth-verifyotp).

### 2. Local PIN / biometric re-entry — standard pattern for layering it on top

Important framing: **the "Thrive PIN" and Face ID/fingerprint are not Supabase concepts at all.** Supabase only ever sees the initial phone+OTP sign-in. Everything after that — "unlock with PIN/biometric on reopen instead of OTP" — is a client-side re-entry gate sitting in front of an already-valid, persisted Supabase session. The recommended architecture (documented by Supabase's own React Native guidance and Expo's SDK docs) is:

1. **Persist the Supabase session securely across app restarts**, via a custom `storage` adapter passed to `createClient()`, so the user is never forced back through OTP just because they closed the app. Supabase's official React Native/Expo guidance is the **`LargeSecureStore`** pattern:
   - `expo-secure-store` alone is backed by the iOS Keychain, which is only reliable for values up to ~2048 bytes — a full Supabase session (JWT access token + refresh token + metadata) commonly exceeds that and can throw on `setItemAsync`.
   - The fix: generate a random AES-256 key (via `react-native-get-random-values`), store *that small key* in `expo-secure-store`, and store the actual session **encrypted** (via `aes-js`, CTR mode) in `@react-native-async-storage/async-storage`, which has no such size limit. This is Supabase's documented, supported pattern, not a community hack.
   - Sources: [Getting started with React Native authentication (Supabase blog)](https://supabase.com/blog/react-native-authentication), [Social Auth with Expo quickstart](https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth), [`expo-secure-store` docs](https://docs.expo.dev/versions/latest/sdk/securestore/).
2. **Keep the session alive/refreshing while the app is foregrounded**, using React Native's `AppState` to call `supabase.auth.startAutoRefresh()` on `'active'` and `supabase.auth.stopAutoRefresh()` otherwise (documented in Supabase's [`stopAutoRefresh` reference](https://supabase.com/docs/reference/javascript/auth-stopautorefresh) and the [React Native quickstart](https://supabase.com/docs/guides/auth/quickstarts/react-native)). This same `AppState` transition is the natural hook point for the lock-screen gate below.
3. **Gate the UI, not the session, with a PIN/biometric check on cold start and on resume-from-background.** Concretely: wrap the authenticated app (post-navigation-root) in an `AppLockGate` that renders a lock screen instead of the app whenever (a) the app just launched with a valid persisted session, or (b) `AppState` transitions to `'active'` after being backgrounded past some idle threshold. The Supabase session keeps refreshing normally underneath; the gate is purely a local check before rendering the real screens.
   - **Biometric check:** `expo-local-authentication` — `hasHardwareAsync()` and `isEnrolledAsync()` to detect capability, `supportedAuthenticationTypesAsync()` to know Face ID vs fingerprint vs iris, and `authenticateAsync()` to actually prompt and get a pass/fail result. ([docs](https://docs.expo.dev/versions/latest/sdk/local-authentication/))
   - **PIN check:** there is no Supabase or Expo primitive for this — it's fully custom app logic. Standard practice: never store the raw PIN; store a salted hash of it (e.g. via `expo-crypto`'s digest functions) in `expo-secure-store`, and compare hashes locally on re-entry. The PIN never touches Supabase or the network — it's purely a local unlock mechanism, symmetric to how banking apps implement this.
   - Concrete library set for this layer: `expo-secure-store`, `@react-native-async-storage/async-storage`, `aes-js` + `react-native-get-random-values` (for `LargeSecureStore`), `expo-local-authentication`, `expo-crypto`, and React Native's built-in `AppState`.

### 3. Gotchas specific to Expo (managed workflow) + this flow

- **Face ID does not work in Expo Go.** It requires a custom development build (`expo-dev-client` / EAS build) — a spec/build-order implication: biometric re-entry can't be manually tested in Expo Go during development, only in a dev client or production build.
- **iOS requires `NSFaceIDUsageDescription`** in `app.json`/`app.config` (`ios.infoPlist`) or the Face ID prompt will crash/fail silently — easy to miss since Android has no equivalent requirement.
- **`expo-secure-store` (and `expo-local-authentication`) do not support Web.** Since Thrive is a universal Expo Router app that also ships as a web PWA, the "PIN/biometric on reopen" gate as specced (Face ID/fingerprint) is a **native-only feature** — on web there is no OS-level biometric or secure-enclave equivalent available through these APIs. The spec should explicitly scope this gate to iOS/Android and define separate (likely simpler — e.g. normal session-cookie/expiry behavior, no local re-lock) behavior for the web target, rather than implying feature parity.
- **SecureStore's ~2KB item ceiling is a real, silent failure mode** if a naive `ExpoSecureStoreAdapter` is used directly as the Supabase storage adapter without the `LargeSecureStore` encryption/chunking wrapper — this has bitten other teams (see open community reports on the Supabase GitHub) and should be built in from day one rather than discovered after a session-persistence bug.
- **Biometric re-enrollment invalidates trust:** if the user adds/changes an enrolled fingerprint or Face ID at the OS level after enabling in-app biometric unlock, some platforms silently invalidate keys tied to the old biometric set. The PIN must always remain available as a fallback/reset path, not just a "if biometrics unavailable" edge case.
- **OTP cost/abuse controls are opt-in, not automatic** — rate limiting and CAPTCHA on the phone-OTP endpoint must be deliberately configured in the Supabase dashboard; left default, phone auth is exposed to SMS-pumping cost attacks.
- **Regional SMS compliance** (e.g. India's TRAI DLT registration) is a provider-side setup cost that only applies if Thrive expands beyond initial pilot markets — worth flagging as a future consideration, not a V1 blocker.

### Recommendation for the spec

Use `signInWithOtp` / `verifyOtp` for the phone+OTP step (provider: Twilio to start, given its ubiquity and Twilio Verify option); persist the resulting session via a `LargeSecureStore`-style adapter (`expo-secure-store` + `AsyncStorage` + `aes-js`); drive session refresh via the `AppState` → `startAutoRefresh`/`stopAutoRefresh` pattern; and implement the "Thrive PIN"/biometric step as a fully local, Supabase-independent `AppLockGate` using `expo-local-authentication` (biometric) and a locally-hashed PIN via `expo-secure-store`/`expo-crypto` (PIN fallback), scoped to native platforms only, with web falling back to standard session behavior without a local re-lock screen.
