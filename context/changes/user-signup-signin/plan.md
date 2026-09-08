# User Signup and Signin (Email + Password) Implementation Plan

## Overview

Close out roadmap slice S-01 (FR-001: "użytkownik może założyć konto i zalogować się") by verifying the already-implemented email+password auth flow end-to-end, confirming its error-handling edge cases behave correctly, and recording the result — no new code.

## Current State Analysis

The full flow is already implemented and live in production:

- `src/lib/supabase.ts` — per-request Supabase client factory; returns `null` when `SUPABASE_URL`/`SUPABASE_KEY` are unset, and every caller already handles that case.
- `src/pages/api/auth/signup.ts` — `POST` handler: reads `email`/`password` from form data, calls `supabase.auth.signUp`, redirects to `/auth/confirm-email` on success or back to `/auth/signup?error=...` on failure.
- `src/pages/api/auth/signin.ts` — `POST` handler: `supabase.auth.signInWithPassword`, redirects to `/` on success or back to `/auth/signin?error=...` on failure.
- `src/pages/api/auth/signout.ts` — `POST` handler: `supabase.auth.signOut`, redirects to `/`.
- `src/middleware.ts` — resolves `context.locals.user` per request from the Supabase session; redirects any path under `PROTECTED_ROUTES` (currently `["/dashboard"]`) to `/auth/signin` when unauthenticated.
- `src/components/Topbar.astro` — reads `Astro.locals.user`; shows the signed-in user's email + Dashboard/Sign out links, or Sign in/Sign up links when logged out. This is why signin redirects to `/` rather than `/dashboard` — `/` is the page that reflects session state, by design, not an oversight.
- `src/components/auth/{SignInForm,SignUpForm}.tsx` — native form POSTs (no fetch/JSON) to the API routes above, per the project's documented auth-flow convention.

No test runner is configured in this project (confirmed in `CLAUDE.md`), so there is no existing automated coverage for this flow to extend.

## Desired End State

The auth flow is confirmed, by manual verification, to satisfy FR-001 and its relevant error paths. `change.md` and this plan's `## Progress` reflect that verification. The roadmap's S-01 entry is ready to move to `done` via `/10x-archive`.

Verification: all checklist items under Phase 1 are checked off, and `npx astro sync && npm run lint && npm run build` succeed.

### Key Discoveries:

- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]` is the single source of truth for route protection; no other page does ad hoc auth checks.
- `src/pages/api/auth/signin.ts:19` and `signup.ts:19` — failures are surfaced via a `?error=` query param on redirect, not a JSON body; the sign-in/up forms must be checked for reading and displaying that param (`src/components/auth/ServerError.tsx`).
- `src/components/Topbar.astro` — confirms the `/` redirect after signin is intentional, not a gap.

## What We're NOT Doing

- No code changes to the auth flow (redirect targets, error messages, session handling) — the roadmap and PRD (FR-001) are already satisfied as implemented.
- No password reset flow, rate limiting, or session-expiry handling — none of these are in FR-001 or elsewhere in the PRD; out of scope for this slice.
- No automated test suite or new test tooling — the project has none today, and adding one is disproportionate to closing an already-shipped slice.
- No verification of the actual email-confirmation link delivery/click (that depends on the configured Supabase email provider) — only that `signUp` succeeds and redirects to `/auth/confirm-email`, and that Supabase's own confirmation gate behaves correctly on a subsequent signin attempt (Phase 1 edge case).

## Implementation Approach

Manual click-through verification against a running dev server (`npm run dev`), using the local/cloud Supabase project per the README's Supabase Configuration section. No implementation work — this phase is verification-only, followed by updating `change.md` and the roadmap status.

## Phase 1: Verify auth flow against FR-001

### Overview

Confirm signup, signin, signout, and protected-route redirection work as implemented, and that the three selected error-handling edge cases are handled gracefully rather than crashing or failing silently.

### Changes Required:

None — this phase is verification-only. No files are modified.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes without error
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Sign up with a new email/password redirects to `/auth/confirm-email`
- After confirming the email (per the configured Supabase project's confirmation flow), signing in with the same credentials redirects to `/` and the Topbar shows the signed-in email with Dashboard/Sign out links
- Visiting `/dashboard` while signed in succeeds (no redirect)
- Signing out redirects to `/` and the Topbar reverts to the signed-out state (Sign in/Sign up links)
- Visiting `/dashboard` directly while signed out redirects to `/auth/signin`
- Signing in with a wrong password or an unregistered email shows a readable error message on `/auth/signin` (via `?error=`) instead of a blank failure or crash
- Signing up with an email that's already registered shows a readable error message on `/auth/signup` (via `?error=`) instead of a blank failure or crash
- Attempting to sign in before confirming the email shows a readable, Supabase-driven error rather than a silent failure

**Implementation Note**: After all automated verification passes, pause here for manual confirmation from the human that every manual checklist item above passed, before marking this plan complete and moving to `/10x-archive`.

---

## Testing Strategy

### Manual Testing Steps:

1. Run `npm run dev` against a configured Supabase project (local or cloud, per README).
2. Walk the happy path: signup → confirm email → signin → `/dashboard` → signout → confirm `/dashboard` redirects when signed out.
3. Walk the three edge cases: wrong password/unknown email on signin, duplicate email on signup, signin attempt before email confirmation.
4. Record the outcome of each checklist item in this plan's `## Progress` section.

## Performance Considerations

Not applicable — no code changes, no new load paths introduced.

## Migration Notes

Not applicable — no data model or schema changes.

## References

- Roadmap slice: `context/foundation/roadmap.md` — S-01 (`user-signup-signin`)
- PRD requirement: `context/foundation/prd.md` — FR-001
- Implementation: `src/lib/supabase.ts`, `src/middleware.ts`, `src/pages/api/auth/{signin,signup,signout}.ts`, `src/pages/auth/*.astro`, `src/components/auth/*`, `src/components/Topbar.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Verify auth flow against FR-001

#### Automated

- [x] 1.1 `npx astro sync` completes without error — 9c1a19c
- [x] 1.2 `npm run lint` passes — 9c1a19c
- [x] 1.3 `npm run build` passes — 9c1a19c

#### Manual

- [x] 1.4 Sign up with a new email/password redirects to `/auth/confirm-email` — 9c1a19c
- [x] 1.5 Signing in after confirmation redirects to `/` with Topbar showing signed-in state — 9c1a19c
- [x] 1.6 Visiting `/dashboard` while signed in succeeds — 9c1a19c
- [x] 1.7 Signing out redirects to `/` with Topbar showing signed-out state — 9c1a19c
- [x] 1.8 Visiting `/dashboard` while signed out redirects to `/auth/signin` — 9c1a19c
- [x] 1.9 Wrong password / unknown email on signin shows a readable `?error=` message — 9c1a19c
- [x] 1.10 Duplicate signup email shows a readable `?error=` message — 9c1a19c
- [x] 1.11 Signin before email confirmation shows a readable, Supabase-driven error — 9c1a19c
