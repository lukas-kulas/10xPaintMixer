# Redirect to Dashboard After Sign-In Implementation Plan

## Overview

After a successful sign-in, `src/pages/api/auth/signin.ts` currently redirects the user to `/` — the generic starter landing page — instead of their dashboard. This plan changes that redirect target to `/dashboard` and adds automated regression coverage for it.

## Current State Analysis

- `src/pages/api/auth/signin.ts:19` — on successful `supabase.auth.signInWithPassword`, returns `context.redirect("/")`. The error paths (missing Supabase config, auth failure) already redirect to `/auth/signin?error=...` and are unaffected by this change.
- `src/pages/index.astro` renders `Welcome.astro` unconditionally — it does not branch on `Astro.locals.user`, so today a freshly-signed-in user and an anonymous visitor see the exact same page.
- `src/middleware.ts` protects `/dashboard*` (prefix-matched) by redirecting unauthenticated visitors to `/auth/signin`, but does not pass or read any "return to this page" parameter, and does not redirect an already-authenticated visitor away from `/auth/signin`.
- `src/pages/api/auth/signup.ts` (→ `/auth/confirm-email`) and `signout.ts` (→ `/`) have their own, independent redirect targets and are not touched by this change.
- No existing test asserts the current (`/`) or any post-sign-in redirect target — confirmed via `context/changes/testing-authorization-route-auth-wiring/research.md` and a direct search of the test suite.

### Key Discoveries:

- The codebase's established pattern for testing an auth-flow API route against real Supabase is in `src/pages/api/cross-user-authorization.test.ts`: import the route's exported HTTP-method handler directly, build a minimal `APIContext`-shaped object around a `Request`, call the handler, and assert on the returned `Response`.
- `src/test-support/rls-harness.ts` exports `createTestUser`/`deleteTestUser` (real Supabase user lifecycle for tests) and is gated by `RLS_TEST_SUPABASE_URL` / `RLS_TEST_SUPABASE_ANON_KEY` / `RLS_TEST_SUPABASE_SERVICE_ROLE_KEY` env vars, matching `vitest.config.ts`'s `integration` project (real `workerd`, per CLAUDE.md).
- `vitest.config.ts` defines two projects by name: `unit` and `integration` (`npm run test -- --project unit` / `--project integration`).

## Desired End State

A successful `POST /api/auth/signin` redirects the browser to `/dashboard` instead of `/`. Verified by: signing in with valid credentials in the browser lands on the dashboard, and a new automated integration test asserts the `Location` header on the success response.

## What We're NOT Doing

- Not adding "return to originally requested page" (`?next=`) deep-link preservation for users bounced from a protected sub-route — decided: always land on `/dashboard`.
- Not changing `dashboard.astro`'s copy ("This page is only for authenticated users.") — that belongs to the parallel roadmap change `starter-branding-cleanup` (S-02 / MS-03).
- Not redirecting an already-authenticated visitor away from `GET /auth/signin` (or `/auth/signup`) — a pre-existing gap this change neither introduces nor worsens.
- Not changing `signup.ts`'s or `signout.ts`'s redirect targets.

## Implementation Approach

Single-line behavioral change to the existing route, plus one new integration test using the codebase's established real-Supabase test pattern — giving the fix an automated regression guard consistent with the project's current push (see `testing-authorization-route-auth-wiring`, `testing-critical-path-guardrail-coverage`) to close auth-flow test gaps.

## Phase 1: Redirect to dashboard after sign-in

### Overview

Change the sign-in success redirect target and cover it with an automated test.

### Changes Required:

#### 1. Sign-in route redirect target

**File**: `src/pages/api/auth/signin.ts`

**Intent**: On successful sign-in, send the user to their dashboard instead of the generic landing page.

**Contract**: The success-path return statement's redirect target changes from `"/"` to `"/dashboard"`. Both error-path redirects (`Supabase is not configured`, auth error) are unchanged.

#### 2. Regression test for the redirect target

**File**: `src/pages/api/auth/signin.test.ts` (new)

**Intent**: Guard the new redirect target with an automated test, following the same real-Supabase integration pattern already used for auth-adjacent routes rather than mocking `signInWithPassword`.

**Contract**: New Vitest test in the `integration` project, gated the same way as `cross-user-authorization.test.ts` (skipped when `RLS_TEST_SUPABASE_*` env vars are absent). Creates a test user via `createTestUser`, builds a `Request`/`APIContext` with form-encoded `email`/`password` for that user, calls the exported `POST` handler from `./signin`, asserts the response is a redirect whose `Location` header is `/dashboard`, then cleans up via `deleteTestUser`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro sync && npm run lint`
- Production build succeeds: `npm run build`
- Unit test project passes: `npm run test -- --project unit`
- Integration test project passes: `npm run test -- --project integration`

#### Manual Verification:

- Signing in with a valid account in the browser lands on `/dashboard`, not `/`
- Signing in with invalid credentials still redirects to `/auth/signin?error=...` (unchanged)
- Visiting `/auth/signup` and completing sign-up still redirects to `/auth/confirm-email` (unchanged)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None needed — this route has no pure logic worth isolating from the network/auth call; the behavior is covered end-to-end by the new integration test.

### Integration Tests:

- New: successful sign-in redirects to `/dashboard` (Phase 1, item 2).

### Manual Testing Steps:

1. Sign in with a valid account → confirm the browser ends up on `/dashboard`.
2. Sign in with an invalid password → confirm the existing `?error=` redirect to `/auth/signin` still works.
3. Sign up a new account → confirm the existing redirect to `/auth/confirm-email` still works (unaffected by this change).

## Performance Considerations

None — this is a redirect-target string change with no added computation.

## Migration Notes

None — no data model or schema involved.

## References

- Roadmap: `context/foundation/roadmap.md` — M-2, slice S-03 (`post-signin-dashboard-redirect`)
- Existing integration test pattern: `src/pages/api/cross-user-authorization.test.ts`
- Test user lifecycle helpers: `src/test-support/rls-harness.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Redirect to dashboard after sign-in

#### Automated

- [x] 1.1 Type checking passes — 6ae4dae
- [x] 1.2 Production build succeeds — 6ae4dae
- [x] 1.3 Unit test project passes — 6ae4dae
- [x] 1.4 Integration test project passes — 6ae4dae

#### Manual

- [x] 1.5 Signing in with a valid account lands on `/dashboard`, not `/` — 6ae4dae
- [x] 1.6 Signing in with invalid credentials still redirects to `/auth/signin?error=...` — 6ae4dae
- [x] 1.7 Signing up still redirects to `/auth/confirm-email` — 6ae4dae
