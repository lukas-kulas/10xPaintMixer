# User Signup and Signin (Email + Password) — Plan Brief

> Full plan: `context/changes/user-signup-signin/plan.md`

## What & Why

Close out roadmap slice S-01 / FR-001 ("user can create an account and sign in with email + password") by verifying the already-implemented auth flow works correctly, rather than building it — it's already live in production.

## Starting Point

The full flow already exists end-to-end: `signup.ts` → `supabase.auth.signUp` → `/auth/confirm-email`; `signin.ts` → `signInWithPassword` → `/`; `signout.ts` → `signOut`; `middleware.ts` gates `/dashboard` behind an authenticated session. No test runner exists in this project to extend.

## Desired End State

The flow's happy path and three key error paths are manually confirmed working, the plan's checklist is checked off, and S-01 is ready to move to `done` via `/10x-archive`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope | Pure backfill, no code changes | Roadmap explicitly says S-01 needs no new implementation; flow already matches FR-001. | Plan |
| Verification method | Manual click-through checklist | No test runner is configured in this project; adding one just to close this slice is disproportionate. | Plan |
| Edge cases to verify | Wrong password/unknown email, duplicate signup email, signin before confirmation | These are the failure modes most likely to silently break or crash rather than show a readable error. | Plan |
| Done definition | Checklist passes + Progress checkboxes ticked | Matches the standard `/10x-implement` → `/10x-archive` rhythm used for every other slice. | Plan |
| Signin redirect target | Confirmed intentional (`/`, not `/dashboard`) | `Topbar.astro` renders session state on `/`, so redirecting there — not to `/dashboard` — is by design. | Plan |

## Scope

**In scope:**
- Manual verification of signup, signin, signout, and protected-route redirection
- Manual verification of 3 error-handling edge cases
- Automated sanity check via `astro sync && lint && build`

**Out of scope:**
- Password reset, rate limiting, session-expiry handling (not in FR-001 or the PRD)
- Any code changes to the auth flow
- New automated test tooling
- Verifying actual email-confirmation link delivery (provider-dependent)

## Architecture / Approach

No new architecture — this plan walks the existing flow (`src/lib/supabase.ts`, `src/middleware.ts`, `src/pages/api/auth/*`, `src/pages/auth/*.astro`, `src/components/auth/*`, `Topbar.astro`) against FR-001 and its edge cases using a running dev server.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Verify auth flow against FR-001 | Confirmed working flow + checked-off Progress section | Low — verification only, no code touched |

**Prerequisites:** A configured Supabase project (local or cloud) per the README's Supabase Configuration section.
**Estimated effort:** Well under one session — a single manual walkthrough.

## Open Risks & Assumptions

- Assumes the currently configured Supabase project has email confirmation enabled and reachable (local dev inbox or cloud provider) — if not, the confirm-email checklist item can't be completed as written.

## Success Criteria (Summary)

- Signup → confirm-email → signin → dashboard access → signout all work as expected
- Wrong password, duplicate email, and pre-confirmation signin all show readable errors instead of failing silently
- `npx astro sync && npm run lint && npm run build` pass
