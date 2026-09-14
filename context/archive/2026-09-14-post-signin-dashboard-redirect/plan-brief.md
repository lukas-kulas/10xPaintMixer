# Redirect to Dashboard After Sign-In — Plan Brief

> Full plan: `context/changes/post-signin-dashboard-redirect/plan.md`

## What & Why

After a successful sign-in, users are sent to `/` — the generic starter landing page — instead of their dashboard. They see the same anonymous marketing page they'd see logged out, and have to click through manually. This plan changes the sign-in success redirect to `/dashboard`, matching roadmap slice S-03 (MS-02).

## Starting Point

`src/pages/api/auth/signin.ts` redirects to `"/"` on success today; `/` renders `Welcome.astro` unconditionally, without checking auth state. No existing test asserts the redirect target.

## Desired End State

Signing in with valid credentials lands the user directly on `/dashboard`. Nothing else about the sign-in, sign-up, or sign-out flows changes.

## Key Decisions Made

| Decision                                              | Choice                                | Why (1 sentence)                                                                 | Source |
| ------------------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| Redirect target after sign-in                          | Always `/dashboard`                    | Matches the roadmap's literal scope (MS-02); deep-link preservation is new, unscoped complexity. | Plan   |
| Deep-link preservation (`?next=`) for protected sub-routes | Not added                              | Would meaningfully grow the diff for what the roadmap scoped as a small fix.       | Plan   |
| Overlap with dashboard copy fix (S-02 / MS-03)          | Left to the parallel `starter-branding-cleanup` change | Avoids duplicating work already scoped there and conflicts between two parallel plans. | Plan   |
| Already-authenticated visits to `GET /auth/signin`      | Left unchanged                         | Pre-existing gap, not introduced or worsened by this change; out of the stated scope. | Plan   |
| Regression coverage                                     | New integration test, real Supabase auth | Matches the codebase's existing pattern (`cross-user-authorization.test.ts` + `rls-harness`) and the project's active push to close auth-flow test gaps. | Plan   |

## Scope

**In scope:**
- Change `signin.ts`'s success-path redirect from `/` to `/dashboard`.
- Add one integration test asserting the `Location` header on success.

**Out of scope:**
- `?next=` deep-link preservation.
- `dashboard.astro` copy changes (owned by `starter-branding-cleanup`).
- `signup.ts` / `signout.ts` redirect targets.
- Redirecting already-authenticated users away from `/auth/signin`.

## Architecture / Approach

One-line change to an existing Astro API route, plus one new Vitest integration test following the established real-Supabase test pattern (`createTestUser` → call the route handler directly → assert on the `Response` → `deleteTestUser`).

## Phases at a Glance

| Phase                                       | What it delivers                                              | Key risk                                   |
| -------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| 1. Redirect to dashboard after sign-in       | `/dashboard` redirect on success + regression test coverage     | Low — single-file change, no existing test to break |

**Prerequisites:** A local Supabase instance configured for the `integration` test project (`RLS_TEST_SUPABASE_*` env vars), same as existing RLS-dependent suites.
**Estimated effort:** Single short session, one phase.

## Open Risks & Assumptions

- Assumes `/` has no other role for authenticated users today (confirmed: `Welcome.astro` doesn't branch on `Astro.locals.user`).

## Success Criteria (Summary)

- Signing in with valid credentials lands on `/dashboard`, not `/`.
- Error paths (bad credentials, sign-up, sign-out) are unaffected.
- A new automated integration test guards the redirect target going forward.
