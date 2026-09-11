# Authorization & Route-Auth Wiring — Implementation Plan

## Overview

Rollout Phase 2 of `context/foundation/test-plan.md` §3. This plan closes two
test-coverage gaps identified in `research.md`:

- **Risk #2** — every `/api/*` route hand-rolls its own `401` check before
  touching Supabase, but no test exercises that path on any route.
- **Risk #3** — RLS on `user_paints`/`recipes` is correctly scoped in the live
  migrations, but the only "proof" it works is a one-time manual check from
  the archived F-01 slice, and the current integration suite mocks
  Supabase's HTTP edge, so it structurally cannot detect an RLS regression.

## Current State Analysis

- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]`, prefix-matched
  via `startsWith`. `/api/*` is never covered; every data-touching route must
  self-enforce.
- Every data-touching route repeats the identical inline check before any
  Supabase table query: `src/pages/api/paints.ts:32-35,80-83`,
  `src/pages/api/paints/[id].ts:17-20`, `src/pages/api/recipe.ts:56-59`. No
  shared helper exists. The three auth-flow routes
  (`src/pages/api/auth/{signin,signup,signout}.ts`) have no such check by
  design — they respond via `redirect()`, not JSON, and are correctly out of
  scope for a 401 check.
- No test in the repo exercises the unauthenticated path: `src/pages/api/paints.ts`
  and `src/pages/api/paints/[id].ts` have zero tests today;
  `src/pages/api/recipe.test.ts` always injects `locals: { user: fakeUser() }`.
- `supabase/migrations/20260909192830_create_paint_catalog_schema.sql:75-110`
  and `supabase/migrations/20260910120000_create_recipes_schema.sql:6-30`
  define correct, currently-live RLS: `auth.uid() = user_id` on every
  `user_paints` operation; `recipes` has SELECT/INSERT policies only —
  UPDATE/DELETE are unreachable for *everyone*, including the owner, by
  deliberate design (append-only).
- No service-role/admin Supabase client exists anywhere in the app — every
  route uses the same request-scoped, anon-key, cookie-bound client from
  `src/lib/supabase.ts:5-24`. RLS is the real, load-bearing boundary.
- The project already has a working local-Supabase Docker workflow
  documented in `README.md:73-112` (`npx supabase init` / `start`, real
  Postgres+PostgREST+GoTrue at `http://127.0.0.1:54321`, credentials into
  `.dev.vars`). Confirmed via Context7 against `cloudflare/workers-sdk` docs:
  Miniflare/`workerd` does not sandbox or block outbound `fetch()` to
  loopback addresses — a Worker under test can reach that local instance
  with zero extra network config.
- The existing `integration` Vitest project (`vitest.config.ts:21-32`) runs
  `@cloudflare/vitest-pool-workers`'s `cloudflareTest()` against
  `wrangler.jsonc`, which currently declares no `vars`/bindings at all.
  `src/pages/api/recipe.test.ts:8-11` mocks `astro:env/server` with literal
  fake values — the RLS suite needs real local values instead, and a new
  `SUPABASE_SERVICE_ROLE_KEY` that doesn't exist anywhere in the project yet.

## Desired End State

Every `/api/*` route handler is proven, per route and per HTTP method it
exports, to reject an unauthenticated request with a `401` JSON body before
any Supabase call — proven by automated tests, not by inspection. Cross-user
access to `user_paints`/`recipes` is proven blocked by the *real* RLS
policies — using two real, freshly-seeded local Supabase users — across
select, insert-as, update, and delete, both through the app's real routes
and by calling Supabase directly (bypassing the app's own scoping). All new
suites run locally against `npx supabase start` via
`npm run test -- --project integration`.

### Key Discoveries:

- No network call happens before any of the three self-checking routes'
  `401` return (`paints.ts:32-35`, `paints.ts:80-83`, `paints/[id].ts:17-20`,
  `recipe.ts:56-59`) — the Phase 1 401 tests don't need `@msw/cloudflare`'s
  network interception at all, only the `astro:env/server` mock, since the
  request never reaches Supabase.
- `src/lib/supabase.ts:12` reads session cookies from the raw `Cookie`
  request header via `parseCookieHeader`, not from `context.cookies` — so a
  test can hydrate a *real* authenticated session for the via-route RLS
  layer purely by setting a `Cookie` header on the constructed `Request`,
  using the same cookie names `@supabase/ssr` itself would set.
- `paints.ts`'s POST and `recipe.ts`'s POST never accept a client-supplied
  `user_id` at all — "insert-as-another-user" is not reachable through
  either route's request contract, so that specific assertion is only
  testable at the direct-DB layer (an authenticated-as-A client attempting
  `.insert({ user_id: B.id, ... })` directly).
- `recipes`' missing UPDATE/DELETE policies (deliberate, append-only) mean
  the correct assertion for those operations is "fails for everyone,
  including the owner" — not an A-vs-B comparison.

## What We're NOT Doing

- Not wiring either new suite into CI — `context/foundation/test-plan.md`
  §5 already scopes that to rollout Phase 4 ("Quality-gates wiring"), which
  also has to solve running local Supabase inside CI.
- Not extracting a shared `requireAuth` helper to remove the per-route
  duplication — test-plan.md's lesson boundaries scope this rollout phase to
  testing, not refactoring; the duplication is noted as an observation for a
  future change instead.
- Not adding 401-guard tests to the auth-flow routes (`signin`/`signup`/
  `signout`) — they are intentionally unguarded, and per the confirmed scope
  decision this phase doesn't add "stays unguarded" assertions for them.
- Not simulating an expired/malformed session cookie as a distinct case —
  `src/middleware.ts:9-13` already collapses any `getUser()` failure to
  `locals.user = null` before a route ever sees it, so that state is not
  distinguishable from "no cookie at all" at the route level.
- Not fixing the pre-existing `recipe.ts:114-126` missing-try/catch gap
  documented in Phase 1's impl-review — separate, already-tracked issue.
- Not touching e2e, accessibility, or the recipe-engine regression suite —
  those are rollout Phases 3/4 and out of `test-plan.md` §4's scope for this
  phase.

## Implementation Approach

Two genuinely different test techniques for two genuinely different risks:

- **Risk #2** reuses Phase 1's existing pattern exactly (direct handler
  invocation + `astro:env/server` mock) — no new infrastructure, just new
  test files covering the routes Phase 1 didn't touch.
- **Risk #3** needs a new harness: real local Supabase, two freshly-seeded
  users per test file, a service-role key for admin user management, and
  two assertion layers (via real routes, and directly against the database)
  because every current route already filters by session `user_id` — a
  via-route-only test can't distinguish "RLS works" from "the app's own
  `.eq(user_id)` filter works."

## Critical Implementation Details

**Passing real Supabase values into the `workerd` sandbox.** Unlike
`wrangler dev`, `.dev.vars` auto-loading is not confirmed for
`@cloudflare/vitest-pool-workers`'s `cloudflareTest()` plugin. The documented,
Cloudflare-confirmed mechanism for test-only values is `miniflare.bindings`
in `vitest.config.ts`, populated from `process.env` at Vite/Node config-load
time (not inside the worker):

```ts
// vitest.config.ts, before defineConfig(...)
try {
  process.loadEnvFile(".dev.vars"); // Node ≥20.6; matches CI's Node 22
} catch {
  /* .dev.vars absent (e.g. CI) — integration project's RLS tests are skipped there until rollout Phase 4 */
}

// inside the "integration" project's cloudflareTest({...}) call:
miniflare: {
  bindings: {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
},
```

Inside a test file, `import { env } from "cloudflare:test"` reads these back
(confirmed working import surface, `test-plan.md` §4). The developer adds
`SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start's output>`
to their local `.dev.vars` alongside the existing `SUPABASE_URL`/`SUPABASE_KEY`.

**Hydrating a real session for the via-route layer.** `src/lib/supabase.ts`
only reads cookies from the `Cookie` request header. Signing in with a
cookie-capturing jar (instead of Astro's) and replaying the captured
`Set-Cookie` values as a `Cookie` header reproduces exactly what a real
browser session would send:

```ts
function captureSessionCookieHeader(url: string, anonKey: string, email: string, password: string) {
  const captured: { name: string; value: string }[] = [];
  const client = createServerClient(url, anonKey, {
    cookies: { getAll: () => [], setAll: (cs) => captured.push(...cs) },
  });
  await client.auth.signInWithPassword({ email, password });
  return captured.map(({ name, value }) => `${name}=${value}`).join("; ");
}
```

This header, set on the constructed `Request`, makes the route's own
`createClient()` call hydrate a real, RLS-carrying session — `locals.user`
is set separately (as today) to satisfy the app's own `user.id` filter logic.

## Phase 1: Self-enforced 401 sweep across all `/api/*` routes (Risk #2)

### Overview

Prove every self-checking route rejects an unauthenticated request (`locals.user === null`) with a `401` JSON body, for every HTTP method it exports, before any Supabase call.

### Changes Required:

#### 1. New unauthenticated-path tests for `paints.ts`

**File**: `src/pages/api/paints.test.ts` (new)

**Intent**: Cover `GET` and `POST` — both currently untested for any behavior — for the unauthenticated case specifically.

**Contract**: Mock `astro:env/server` with truthy literal values (same shape as `recipe.test.ts:8-11`); no `@msw/cloudflare` network setup needed, since the `401` return in `paints.ts:32-35,80-83` happens before any `.from(...)` call. Build an `APIContext` with `locals: { user: null }`, a minimal `Request` (body content is irrelevant — the check runs before body parsing), invoke `GET`/`POST` directly, assert `status === 401` and a non-empty string `error` field (reuse the `expectCleanError`-style assertion pattern from `recipe.test.ts:62-67`).

#### 2. New unauthenticated-path test for `paints/[id].ts`

**File**: `src/pages/api/paints/[id].test.ts` (new)

**Intent**: Cover `DELETE`, currently untested for any behavior, for the unauthenticated case.

**Contract**: Same mock/no-network approach as above. `context.params.id` value is irrelevant (check at `paints/[id].ts:17-20` runs before the params read at `:22`). Assert `401` + clean error body.

#### 3. New unauthenticated-path test for `recipe.ts`

**File**: `src/pages/api/recipe.test.ts` (modify)

**Intent**: Add the one missing case — every existing test in this file authenticates via `fakeUser()`; none exercise `locals.user === null`.

**Contract**: Add a second context-builder (or a parameter on the existing `buildContext`) that sets `locals: { user: null }` instead of `fakeUser()`. New `it("returns 401 when unauthenticated", ...)` case asserting `401` + clean error body. No new network mocks needed (check at `recipe.ts:56-59` runs before the rate limiter and before any table query).

### Success Criteria:

#### Automated Verification:

- Integration tests pass: `npm run test -- --project integration`
- Type checking passes: `npx astro sync && npm run lint`

#### Manual Verification:

- Confirm no regression in `recipe.test.ts`'s existing five test cases after adding the new one.

---

## Phase 2: Real-Postgres RLS test harness (Risk #3 infrastructure)

### Overview

Build the reusable pieces the ownership-matrix tests in Phase 3 need: real
Supabase values reaching the `workerd` sandbox, and per-test-file user
seeding/teardown against a real local Supabase instance.

### Changes Required:

#### 1. Wire real Supabase values into the `integration` Vitest project

**File**: `vitest.config.ts`

**Intent**: Make the local instance's real `SUPABASE_URL`/`SUPABASE_KEY` and a new `SUPABASE_SERVICE_ROLE_KEY` reachable from inside test files, without touching the app's own `astro:env` schema.

**Contract**: Add `process.loadEnvFile(".dev.vars")` (guarded, see Critical Implementation Details) before `defineConfig`, and a `miniflare.bindings` block on the `integration` project's `cloudflareTest({...})` call, exactly as shown above.

#### 2. Seeded-user harness module

**File**: `src/test-support/rls-harness.ts` (new)

**Intent**: One place for "create a real test user," "get a real authenticated client or cookie header for them," and "delete them" — used by every Phase 3 test file. Lives outside `src/lib` (which the cookbook reserves for pure, no-I/O unit-tested code) and outside `src/pages` (not itself a route or a test file).

**Contract**: Exports:
- `createTestUser(env)` — admin-creates a user with a random `+`-suffixed email and a generated password via `supabase.auth.admin.createUser({ email, password, email_confirm: true })`, returns `{ id, email, password }`.
- `signInForCookieHeader(env, email, password)` — returns the `Cookie` header string described in Critical Implementation Details, for the via-route layer.
- `signInForClient(env, email, password)` — returns a plain, signed-in `@supabase/supabase-js` client for the direct-DB layer.
- `deleteTestUser(env, id)` — admin-deletes the user; relies on `on delete cascade` (`supabase/migrations/20260909192830_...sql:76`, `.../20260910120000_...sql:8`) to remove their `user_paints`/`recipes` rows.

`env` here is `{ url, anonKey, serviceRoleKey }`, sourced by callers from `cloudflare:test`'s `env` import.

#### 3. Harness smoke test

**File**: `src/pages/api/rls-harness.smoke.test.ts` (new)

**Intent**: Verify the harness itself works in isolation before Phase 3 builds the full matrix on top of it — an early, cheap failure signal if seeding/sign-in/teardown breaks, independent of the larger suite.

**Contract**: `beforeAll` creates one test user via `createTestUser`, asserts `signInForClient` returns a client whose `auth.getUser()` resolves to that user's id, `afterAll` deletes the user and asserts a subsequent sign-in attempt fails.

### Success Criteria:

#### Automated Verification:

- Harness smoke test passes against a running local Supabase: `npm run test -- --project integration rls-harness.smoke`
- Type checking passes: `npx astro sync && npm run lint`

#### Manual Verification:

- `npx supabase start` running locally, `.dev.vars` has `SUPABASE_SERVICE_ROLE_KEY` set from the CLI's printed output, and the smoke test passes on a clean run.
- Re-run the smoke test twice in a row locally to confirm teardown leaves no leftover user (no unique-email collisions, no leftover rows).

---

## Phase 3: Two-seeded-user ownership matrix (Risk #3 assertions)

### Overview

Using the Phase 2 harness, prove cross-user access is blocked — both through
the app's real routes and directly against the database — for
`user_paints` and `recipes`.

### Changes Required:

#### 1. Via-route layer

**File**: `src/pages/api/cross-user-authorization.test.ts` (new)

**Intent**: Regression-test the current app-level scoping against real Postgres, using two real authenticated sessions.

**Contract**:
- `beforeAll`/`afterAll` per Phase 2's harness: two fresh users A and B.
- `GET /api/paints` as A after B has added different owned paints (via a direct insert using B's client, not through the route) asserts A's returned `owned` flags reflect only A's rows, never B's — invoke `paints.ts`'s `GET` with A's cookie header.
- `DELETE /api/paints/[id]` as A supplying B's actual `paint_id` (a real row B owns) asserts: the route responds without asserting deletion of B's data, and a direct read (via B's own client) confirms B's row still exists afterward. This is the literal "via a route, supplying B's row id directly" scenario from `change.md`.

#### 2. Direct-DB layer

**File**: `src/pages/api/cross-user-authorization.test.ts` (same file, separate `describe` block)

**Intent**: Isolate the RLS boundary itself from any app-level filtering, per `test-plan.md` §2's explicit "must challenge RLS alone is sufficient" framing — this is the layer that would actually catch an RLS regression the app's own `.eq(user_id)` filters would mask.

**Contract**, using `signInForClient` for both A and B directly (no route involved):
- `user_paints`: A's client `select` filtered to B's row → empty result; A's client `insert` with `user_id: B.id` → rejected by `WITH CHECK`; A's client `update` on B's row → no rows affected; A's client `delete` on B's row → no rows affected, B's client confirms the row still exists.
- `recipes`: A's client `select` filtered to B's row → empty result; A's client `insert` with `user_id: B.id` → rejected by `WITH CHECK`; **both** A's and B's own clients attempting `update`/`delete` on B's own recipe row fail (no policy exists for either operation, for anyone — locks in the deliberate append-only design, not an A-vs-B comparison).

### Success Criteria:

#### Automated Verification:

- Full integration suite passes: `npm run test -- --project integration`
- Type checking passes: `npx astro sync && npm run lint`

#### Manual Verification:

- With local Supabase running, run the suite twice consecutively to confirm no flakiness from user/row cleanup between files.
- Manually inspect the local Studio UI (`http://localhost:54323`) after a run to confirm no leftover test users/rows.

---

## Phase 4: Cookbook update and doc cleanup

### Overview

Close out the rollout phase: document the new pattern for future contributors and fix the one stale fact `research.md` surfaced.

### Changes Required:

#### 1. Cookbook — two-seeded-user pattern

**File**: `context/foundation/test-plan.md`

**Intent**: Replace §6.2's "Still TBD: the two-seeded-user authorization/RLS pattern — see §3 Phase 2" line with the actual pattern (harness location, naming convention, reference test, run command, the local-Supabase prerequisite), matching the precedent set by Phase 1's own Phase 4 (`context/foundation/test-plan.md` §6.6 entry from the prior rollout phase).

**Contract**: New content under §6.2 (or a new §6.2b) naming `src/test-support/rls-harness.ts` and `src/pages/api/cross-user-authorization.test.ts` as the reference, and the `npx supabase start` prerequisite.

#### 2. Cookbook — new-endpoint checklist

**File**: `context/foundation/test-plan.md`

**Intent**: Replace §6.4's "TBD — see §3 Phase 2" with the actual self-enforced-401 checklist for a new `/api/*` route, referencing `paints.test.ts`/`paints/[id].test.ts` as the pattern.

#### 3. Fix stale CLAUDE.md claim

**File**: `CLAUDE.md`

**Intent**: `research.md` found CLAUDE.md's "Supabase provides auth only — no app database tables" line is false as of the two live migrations (`user_paints`, `recipes`, plus catalog tables) — a small, low-risk factual correction surfaced by this phase's own research, worth fixing rather than leaving a future agent misled.

**Contract**: Update the Architecture section's Supabase description to note the app data tables and their RLS-based per-user scoping.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Cookbook entries read correctly against the actual files they reference.

---

## Testing Strategy

### Unit Tests:

- None added this phase — no new pure-function logic.

### Integration Tests:

- Phase 1: unauthenticated-path coverage for every self-checking `/api/*` route/method.
- Phase 2/3: two-seeded-user cross-access matrix for `user_paints`/`recipes`, via routes and direct DB.

### Manual Testing Steps:

1. `npx supabase start` locally; confirm `.dev.vars` has all three Supabase values.
2. `npm run test -- --project integration` — full suite green.
3. Re-run twice consecutively to confirm no state bleed between runs.

## Performance Considerations

None — these are correctness/authorization tests, not load tests. `recipe.ts`'s per-user rate limiter is avoided by using fresh user ids per test file (already the case via the harness).

## Migration Notes

Not applicable — no schema changes.

## References

- Research: `context/changes/testing-authorization-route-auth-wiring/research.md`
- Prior infra: `context/changes/testing-critical-path-guardrail-coverage/plan.md`
- Reference pattern: `src/pages/api/recipe.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Self-enforced 401 sweep across all /api/* routes

#### Automated

- [x] 1.1 Integration tests pass: `npm run test -- --project integration` — 26317a2
- [x] 1.2 Type checking passes: `npx astro sync && npm run lint` — 26317a2

#### Manual

- [x] 1.3 No regression in recipe.test.ts's existing five test cases — 26317a2

### Phase 2: Real-Postgres RLS test harness

#### Automated

- [x] 2.1 Harness smoke test passes: `npm run test -- --project integration rls-harness.smoke`
- [x] 2.2 Type checking passes: `npx astro sync && npm run lint`

#### Manual

- [x] 2.3 Local Supabase running, .dev.vars has SUPABASE_SERVICE_ROLE_KEY, smoke test passes clean
- [x] 2.4 Smoke test re-run twice with no leftover users/rows

### Phase 3: Two-seeded-user ownership matrix

#### Automated

- [ ] 3.1 Full integration suite passes: `npm run test -- --project integration`
- [ ] 3.2 Type checking passes: `npx astro sync && npm run lint`

#### Manual

- [ ] 3.3 Suite run twice consecutively, no flakiness
- [ ] 3.4 Studio UI inspected post-run, no leftover test users/rows

### Phase 4: Cookbook update and doc cleanup

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 Build passes: `npm run build`

#### Manual

- [ ] 4.3 Cookbook entries verified against the files they reference
