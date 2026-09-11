# Authorization & Route-Auth Wiring — Plan Brief

> Full plan: `context/changes/testing-authorization-route-auth-wiring/plan.md`
> Research: `context/changes/testing-authorization-route-auth-wiring/research.md`

## What & Why

Rollout Phase 2 of the project's test plan. Two gaps: (1) every `/api/*`
route hand-rolls its own 401 check since `PROTECTED_ROUTES` explicitly
excludes `/api/*`, but nothing tests that check exists or fires correctly;
(2) RLS on `user_paints`/`recipes` looks correctly scoped in the live
migrations, but the only "proof" is a one-time manual check from an archived
slice, and today's only integration test mocks Supabase's HTTP edge — so it
structurally cannot catch an RLS regression.

## Starting Point

Phase 1 of the rollout already built the Vitest + `@cloudflare/vitest-pool-workers`
+ `@msw/cloudflare` integration-test infrastructure (`src/pages/api/recipe.test.ts`
is the reference). `paints.ts` and `paints/[id].ts` have zero tests today.
No service-role client, no shared auth helper, and no test-user seeding
mechanism exist anywhere in the project yet.

## Desired End State

Every `/api/*` route/method is proven, by an automated test, to reject an
unauthenticated request with `401` before touching Supabase. Cross-user
access to `user_paints`/`recipes` is proven blocked by real RLS — via two
freshly-seeded local Supabase users, through both the app's real routes and
direct database calls — runnable locally against `npx supabase start`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test-user creation | Fresh users per test file, admin-created, cascade-deleted in `afterAll` | Self-contained, safe to re-run, no cross-file state bleed | Plan (interview) |
| Service-role key location | New `SUPABASE_SERVICE_ROLE_KEY` in local `.dev.vars`, read only by test setup | Matches the project's existing `.dev.vars` convention, never touches app code | Plan (interview) |
| RLS assertion scope | Two layers: via real routes AND direct authenticated DB calls bypassing routes | Every current route already filters by session `user_id`, so route-only testing can't isolate an RLS regression from an app-filter regression | Plan (interview) |
| Test isolation | Fresh users + `on delete cascade` teardown per file | Repeatable locally without manual `supabase db reset` | Plan (interview) |
| 401 sweep scope | Exactly `locals.user === null`, no expired-cookie simulation, no auth-route "stays unguarded" tests | Middleware already collapses any session failure to `null` before a route sees it | Plan (interview) |
| Route duplication (no shared `requireAuth`) | Test only, don't refactor | Test-plan.md's lesson boundaries scope this phase to testing, not refactoring | Plan (interview) |
| `workerd` → real local Supabase network access | Confirmed unrestricted, no Miniflare config needed | Verified via Context7 against `cloudflare/workers-sdk` docs | Research (gap-fill) |
| Real env values into the test sandbox | `miniflare.bindings` in `vitest.config.ts`, sourced from `.dev.vars` via `process.loadEnvFile` | Documented Cloudflare pattern for test-only bindings; `.dev.vars` auto-load isn't confirmed for the test runner | Plan |

## Scope

**In scope:**
- 401 tests for every self-checking `/api/*` route/method (`paints.ts`, `paints/[id].ts`, `recipe.ts`)
- A reusable real-Supabase test-user harness (`src/test-support/rls-harness.ts`)
- Two-seeded-user ownership matrix for `user_paints`/`recipes`, via-route and direct-DB
- Cookbook updates (`test-plan.md` §6.2, §6.4) and a stale-CLAUDE.md fix

**Out of scope:**
- Wiring either suite into CI (rollout Phase 4)
- Extracting a shared `requireAuth` helper
- Auth-flow route (signin/signup/signout) guard tests
- Expired/malformed session cookie simulation
- The pre-existing `recipe.ts` missing-try/catch gap

## Architecture / Approach

Two techniques for two risks. Risk #2 reuses Phase 1's mocked-HTTP,
direct-handler-invocation pattern exactly — no new infra. Risk #3 needs a
new harness (real local Postgres, real seeded users, a service-role key for
admin operations) and two assertion layers, because the app's existing
per-route `user_id` filters would otherwise mask an actual RLS regression.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. 401 sweep | Every `/api/*` route/method proven to 401 when unauthenticated | Low — mechanical, reuses existing pattern |
| 2. RLS test harness | Seeded-user create/sign-in/teardown against real local Supabase | Medium — new env/bindings plumbing, only verified locally (Docker required) |
| 3. Ownership matrix | Cross-user access proven blocked, via-route + direct-DB, for `user_paints`/`recipes` | Medium — two distinct test layers, `recipes`' no-update/delete-for-anyone case needs care |
| 4. Cookbook + doc fix | `test-plan.md` §6.2/§6.4 filled in, stale CLAUDE.md line fixed | Low |

**Prerequisites:** Docker + local Supabase CLI (`npx supabase start`) available wherever Phases 2–3 run/verify.
**Estimated effort:** ~3-4 sessions across 4 phases.

## Open Risks & Assumptions

- Phases 2-3's automated verification requires Docker/local Supabase running — not runnable in a sandboxed CI-less environment; manual verification steps depend on the developer's own machine.
- `process.loadEnvFile(".dev.vars")` requires Node ≥20.6 (project already targets Node 22 in CI) — confirm the same holds for whichever local dev Node version is used.

## Success Criteria (Summary)

- `npm run test -- --project integration` is fully green with local Supabase running, covering every `/api/*` route's 401 path and the full cross-user ownership matrix.
- A future contributor adding a new `/api/*` route or a new per-user table can follow `test-plan.md` §6.2/§6.4 without guessing the pattern.
