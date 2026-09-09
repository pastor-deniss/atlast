Type: grilling
Status: resolved

## Question

What technology stack and distribution model does the spec target — mobile only, or mobile+web, and via what backend?

## Answer

- **Mobile + web from one codebase**: Expo + React Native + TypeScript, with Expo Router for navigation. Expo Router targets iOS, Android, and web from the same codebase, so "the webapp" is *not* a separate frontend project (e.g. not a second Next.js app) — it's the same screens rendering responsively in a browser.
- **Web distribution**: ships as an installable PWA so people can use it straight from a browser and add it to their home screen; native App Store / Play Store builds come later via EAS Build from the same codebase, once that channel is wanted.
- **Backend**: Supabase — Postgres as the database, Supabase Auth for identity, Postgres Row Level Security (RLS) enforced in the database (not just the client) for permissions, Supabase Edge Functions / database functions for server-side business logic, Supabase Storage for any file needs.
- Rationale: Supabase's own documentation supports this Expo/React Native + Auth + Postgres + RLS combination directly, and recommends enabling RLS on every exposed table with explicit per-role policies — matching Thrive's trust-architecture requirements from the white paper.
