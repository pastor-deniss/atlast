<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="app/assets/images/logo-reversed.png">
    <img src="app/assets/images/logo-primary.png" alt="AtLast" width="320">
  </picture>
</p>

# AtLast

A community-finance app for savings groups: membership, contributions, loans, governance and reporting.

AtLast is a universal [Expo](https://expo.dev) app (iOS, Android and web) backed by [Supabase](https://supabase.com). V1 covers one complete cycle for a single pilot group: join, membership vote, contribution, loan request, Loan Review Panel approval, disbursement, repayment and report.

## Repository layout

| Path | What it is |
| --- | --- |
| `app/` | The Expo Router app (TypeScript). Screens live in `app/src/app/`. |
| `supabase/functions/` | Supabase Edge Functions for actions that move money or change membership (loans, votes, contributions, reconciliation). |
| `.scratch/atlast-mvp-spec/` | The V1 engineering spec: database blueprint, RLS policies, SQL functions and per-area tickets. |
| `.scratch/setup/` | Guided scripts for connecting Supabase and enabling SMS sign-in through Twilio. |
| `CONTEXT.md` | Domain glossary: the terms the code and spec are written against. |

## Getting started

1. Install dependencies:

   ```bash
   cd app
   npm install
   ```

2. Copy `app/.env.example` to `app/.env` and fill in your Supabase project URL and anon key. `.scratch/setup/get-supabase-credentials.sh` walks you through finding them.

3. Start the app:

   ```bash
   npx expo start
   ```

   Then open it in Expo Go, an iOS simulator, an Android emulator or the browser.

Phone sign-in needs SMS enabled in Supabase; run `.scratch/setup/setup-twilio-sms.sh` for a step-by-step guide.

## Brand

| Colour | Hex |
| --- | --- |
| AtLast Green | `#0F3D2E` |
| AtLast Gold | `#F2B33D` |
| Cream | `#F6F3EC` |

The palette lives in `app/src/constants/theme.ts`, and the logo is the `AtlastLogo` component (`app/src/components/atlast-logo.tsx`).
