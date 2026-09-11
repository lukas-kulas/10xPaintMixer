# Critical-Path Guardrail Coverage — Implementation Plan

## Overview

Bootstrap this project's test runner (Vitest + `@cloudflare/vitest-pool-workers`) from
nothing, then add tests that prove the recipe engine and its API route never violate
the owned-paint-only guarantee (Risk #1) and never crash on edge or malformed input
(Risk #4, Risk #6) — rollout Phase 1 of `context/foundation/test-plan.md` §3.

## Current State Analysis

No test infrastructure exists in this repo today (`package.json` has no `test`
script, no `vitest`/`jest`/`playwright` dependency, no `*.test.*` files). The feature
under test is a single vertical slice added in the last 3 commits:

- `src/lib/recipe.ts` — pure function `generateRecipe(target, ownedPaints)`, no I/O,
  no Cloudflare bindings. Builds candidates exclusively from the `ownedPaints`
  argument; throws `EmptyOwnedPaintsError` on an empty array (currently unreachable
  through the real route — see below).
- `src/pages/api/recipe.ts` — the only caller of `generateRecipe`. Does its own
  auth check (`context.locals.user`), its own empty-owned-paints pre-check (short-
  circuits before the engine's own guard ever fires), and clean status-coded
  validation for `target_paint_id` (400 missing/wrong-type, 404 not found). Calls
  `createClient()` from `src/lib/supabase.ts`, which reads `SUPABASE_URL` /
  `SUPABASE_KEY` from `astro:env/server`.

Full trace and line-level grounding: `context/changes/testing-critical-path-guardrail-coverage/research.md`.

## Desired End State

- `npm run test` (or `vitest run`) executes two Vitest projects: a plain-Node
  `unit` project for the pure engine, and an `integration` project running inside
  real `workerd` (via `@cloudflare/vitest-pool-workers`) for the API route.
- The owned-paint invariant (Risk #1) is asserted directly against varied
  owned-paint compositions, not against a snapshot of today's output.
- The engine's own `EmptyOwnedPaintsError` guard (Risk #4, defense-in-depth) is
  unit-tested directly, independent of the route's duplicate pre-check.
- The route's edge/malformed-input matrix (Risk #4 route-level, Risk #6) returns
  the documented status codes and a `{ error: string }` body shape for: zero owned
  paints, missing `target_paint_id`, wrong-type `target_paint_id`, empty-string
  `target_paint_id`, and a malformed-format (non-UUID) `target_paint_id`.
- `context/foundation/test-plan.md` §6.1/§6.2 name the concrete pattern, location,
  and run command for future tests instead of reading "TBD."
- The try/catch gap research found (no safety net around `generateRecipe()` /
  the recipe insert) is recorded as an explicit follow-up, not silently tested
  around and not silently dropped.

### Key Discoveries:

- `src/lib/recipe.ts:85-91` — the owned-paint invariant is enforced by data flow
  (candidates are built only from the `ownedPaints` argument); a unit test should
  assert this directly rather than snapshot output.
- `src/pages/api/recipe.ts:100-102` vs. `src/lib/recipe.ts:89-91` — a divergent-guard
  pattern: two independent "empty owned paints" checks, only the route's is
  currently reachable. `research.md` §2 flags this as the concrete mechanism by
  which Risk #4 could regress.
- `src/pages/api/recipe.ts:114-126` — **no `try/catch`** around the engine call or
  the Supabase insert. An uncaught exception here would produce a generic 500 that
  breaks the `{ error: string }` shape every other path in this route uses. Per
  team decision, this is a documented gap for this plan, not a fix (out of scope —
  bug-fixing is Lesson 5's workflow, not this test-rollout lesson).
- `src/lib/supabase.ts:3` — `createClient()` imports `astro:env/server` directly.
  `@cloudflare/vitest-pool-workers`'s `cloudflareTest()` Vite plugin does not
  include Astro's own Vite integration, so this specifier will not resolve inside
  the `integration` project unless mocked (`vi.mock("astro:env/server", …)`).
- `src/env.d.ts:2-4` — `Locals.user` is typed `import("@supabase/supabase-js").User | null`;
  integration tests construct a minimal fake `User` object rather than going
  through real Supabase auth (auth-flow correctness is Rollout Phase 2's risk #2/#3,
  not this phase's).
- `wrangler.jsonc`'s `main` points at `@astrojs/cloudflare/entrypoints/server` (the
  full Astro adapter entry). Tests import and invoke the route's exported `POST`
  handler directly instead of driving requests through `SELF.fetch()` against that
  entry — this avoids requiring a production build before tests can run, and Astro's
  own `with-vitest` template documents exactly this direct-handler-import pattern
  for testing API routes.

## What We're NOT Doing

- Not fixing the missing try/catch around `generateRecipe()` / the Supabase insert.
  Documented in Open Risks below as a follow-up recommendation.
- Not testing the currently-unreachable "uncaught exception falls through to a
  generic 500" path — doing so would assert today's guardrail-violating fallback
  as correct (the oracle-problem anti-pattern this rollout explicitly avoids).
- Not covering Risk #2 (route-level 401 checks) or Risk #3 (RLS/IDOR) — those are
  Rollout Phase 2 (`context/foundation/test-plan.md` §3, row 2), a separate change.
- Not covering Risk #5 (recipe-engine tuning/NFR timing) — Rollout Phase 3.
- Not wiring these suites into CI as a required gate — Rollout Phase 4 does that
  once real suites exist to wire (confirmed: `.github/workflows/ci.yml` today runs
  only `astro sync && lint && build`).
- Not adding a UUID-format validator to the route. The malformed-`target_paint_id`
  test locks in today's behavior (clean 404, same as valid-but-missing) as a
  regression guard, not a request to add stricter validation.

## Implementation Approach

Two Vitest projects in one root `vitest.config.ts` (Vitest 3's `test.projects`,
confirmed current via Context7 against `vitest-dev/vitest@v3.2.4` — this replaces
the older separate `vitest.workspace.ts` file):

- **`unit`** — plain Node environment, no Cloudflare plugin. Covers `src/lib/recipe.ts`
  (Risk #1, Risk #4 defense-in-depth). Fast, no I/O, no `workerd` startup cost —
  the cheapest layer for a pure function, per the test plan's cost × signal principle.
- **`integration`** — `@cloudflare/vitest-pool-workers`'s `cloudflareTest()` plugin,
  pointed at the real `wrangler.jsonc` (`wrangler: { configPath: "./wrangler.jsonc" }`)
  so compatibility date/flags match production. Covers `src/pages/api/recipe.ts`
  (Risk #4 route-level, Risk #6). Tests import `POST` directly and invoke it with a
  constructed `APIContext`-shaped object; `astro:env/server` is mocked with test
  values via `vi.mock`; Supabase's outbound HTTP calls are intercepted with
  `cloudflare:test`'s `fetchMock` (per `context/foundation/test-plan.md` §4 — mocks
  Supabase's HTTP edge only, never the internal `@/lib/supabase` module).

All error-response assertions check status code + that `body.error` is a non-empty
string, never the exact wording — resilient to future copy changes, per the test
plan's own anti-pattern warning against brittle text/snapshot assertions.

## Critical Implementation Details

**`astro:env/server` mocking is load-bearing for every integration test.** Without
`vi.mock("astro:env/server", () => ({ SUPABASE_URL: "https://test.supabase.co", SUPABASE_KEY: "test-key" }))`
declared before the route module is imported, `createClient()` in
`src/lib/supabase.ts` will throw on module resolution (the specifier is Astro's own
virtual module, not something `cloudflareTest()`'s plugin knows about) — every
integration test in Phase 3 will fail at import time, not at assertion time, until
this is in place. Establish this pattern once in Phase 1 and reuse it.

## Phase 1: Bootstrap the test runner

### Overview

Install Vitest + `@cloudflare/vitest-pool-workers`, configure the two-project
split, and prove the harness works end-to-end — including the `astro:env/server`
mock pattern — with the cheapest possible real integration test case (a request
that never reaches Supabase).

### Changes Required:

#### 1. Test dependencies

**File**: `package.json`

**Intent**: Add the test runner and Worker-runtime pool as dev dependencies, and a
`test` script so `npm run test` matches this repo's existing `npm run <verb>`
convention (`dev`, `build`, `lint`, `format`).

**Contract**: `devDependencies` gains `vitest` (`^3.x`, matching `context/foundation/test-plan.md` §4)
and `@cloudflare/vitest-pool-workers` (`latest`, per §4 — no stable pinned version
was published for this beta-tagged package as of the Context7 grounding for this
plan). `scripts` gains `"test": "vitest run"`.

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new, project root)

**Intent**: Define the `unit` and `integration` projects described in Implementation
Approach above.

**Contract**:

```typescript
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/lib/**/*.test.ts"],
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
          }),
        ],
        test: {
          name: "integration",
          include: ["src/pages/**/*.test.ts"],
        },
      },
    ],
  },
});
```

(The `integration` project's TypeScript types for `cloudflare:test` — `import {
env, fetchMock, SELF } from "cloudflare:test"` — come from
`@cloudflare/vitest-pool-workers`'s own type declarations; wire these up per the
package's installed setup instructions, since the exact reference path is
version-specific and wasn't pinned in this plan's Context7 grounding.)

#### 3. Smoke-test the harness via the cheapest real integration case

**File**: `src/pages/api/recipe.test.ts` (new)

**Intent**: Prove the full harness — `workerd` startup, the `astro:env/server`
mock, and direct-handler invocation — works, using the one request case that
needs no Supabase interaction at all: a missing `target_paint_id` on an
authenticated request returns `400`. This is also the first row of Phase 3's
input-validation matrix, reused rather than thrown away.

**Contract**: Establishes the reusable test scaffolding for this file: the
`vi.mock("astro:env/server", …)` call from Critical Implementation Details, a
helper that builds a minimal `APIContext`-shaped object (`request`, `cookies`,
`locals: { user: <fake User> }`), and the import of `POST` from
`src/pages/api/recipe.ts`. Phase 3 extends this same file with the rest of the
matrix rather than duplicating the setup.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` still succeeds (no `astro:env` schema drift from the new files)
- `npm run test` runs and the smoke test passes
- `npm run lint` passes on the new files (`vitest.config.ts`, `src/pages/api/recipe.test.ts`)
- `npm run build` still succeeds (new devDependencies don't affect the production build)

#### Manual Verification:

- `npm run test` output shows two distinct projects (`unit`, `integration`) running

---

## Phase 2: Recipe engine unit tests (Risk #1, Risk #4 defense-in-depth)

### Overview

Prove the owned-paint invariant holds across varied inputs, and add the
defense-in-depth test for the engine's own (currently unreachable via the route)
empty-input guard.

### Changes Required:

#### 1. Owned-paint invariant tests

**File**: `src/lib/recipe.test.ts` (new)

**Intent**: Assert that every `paintId` in `generateRecipe(...).components` is an
element of the `ownedPaints` ids passed in — the invariant itself, not today's
output values — across a small table of representative owned-paint compositions
(single paint, several paints of mixed types including a `"Washes"` type to
exercise the `WASHES_TINTING_STRENGTH` branch, and a set larger than
`CANDIDATE_POOL_SIZE` to exercise the shortlist truncation path).

**Contract**: For each fixture case, assert `result.components.every(c => ownedPaintIds.has(c.paintId))`.
Do not assert exact `resultHex`/`distance` values (tuning knobs, not invariants —
per `research.md`'s own grounding note and the test plan's anti-pattern warning
for Risk #1 and Risk #5).

#### 2. Defense-in-depth guard test

**File**: `src/lib/recipe.test.ts` (same file)

**Intent**: Call `generateRecipe(target, [])` directly and assert it throws
`EmptyOwnedPaintsError` — independent of the route's duplicate pre-check, so a
future refactor that removes the route's own guard is still caught at the
cheapest possible layer.

**Contract**: `expect(() => generateRecipe(target, [])).toThrow(EmptyOwnedPaintsError)`.

### Success Criteria:

#### Automated Verification:

- `npm run test -- --project unit` passes, including the new invariant and guard tests
- `npm run lint` passes on `src/lib/recipe.test.ts`

#### Manual Verification:

- Temporarily reintroducing a catalog-substitution bug in `src/lib/recipe.ts` (e.g.
  hardcoding one candidate paint) causes the invariant test to fail — confirms the
  test is load-bearing, not tautological

---

## Phase 3: API route integration tests (Risk #4 route-level, Risk #6)

### Overview

Extend `src/pages/api/recipe.test.ts` (started in Phase 1) with the full
edge/malformed-input matrix.

### Changes Required:

#### 1. Edge and malformed-input matrix

**File**: `src/pages/api/recipe.test.ts` (extend)

**Intent**: For each case, assert the documented status code and that
`body.error` is present and a non-empty string (status + shape only, per
Implementation Approach). Cases: zero owned paints → `422`; missing
`target_paint_id` → `400` (already covered by the Phase 1 smoke test); wrong-type
`target_paint_id` (number/object/array) → `400`; empty-string `target_paint_id` →
`400`; malformed-format (non-UUID string) `target_paint_id` → `404` (locks in
today's behavior — the route has no UUID-format check, so a malformed string is
treated identically to a valid-but-nonexistent id, per `research.md` §3).

**Contract**: Each case mocks the Supabase calls it needs via `fetchMock` (the
zero-owned-paints and malformed-id cases need the `paints`/`user_paints` REST
responses `fetchMock` intercepts; the type/empty-string/missing cases return
before any Supabase call is made, per `src/pages/api/recipe.ts:65-70`, so need no
`fetchMock` setup at all).

### Success Criteria:

#### Automated Verification:

- `npm run test -- --project integration` passes, covering all five matrix cases
- `npm run lint` passes on `src/pages/api/recipe.test.ts`
- `npm run build` still succeeds

#### Manual Verification:

- Temporarily removing the route's `ownedPaints.length === 0` pre-check
  (`src/pages/api/recipe.ts:100-102`) causes the zero-owned-paints test to fail
  with a different status/shape than `422` — confirms the test actually exercises
  the guard, not a mocked stand-in

---

## Phase 4: Document the try/catch gap; update the cookbook

### Overview

Record the try/catch finding as an explicit follow-up (not a silent gap, not a
scope-creeping fix), and fill in `context/foundation/test-plan.md` §6.1/§6.2 with
the concrete patterns this phase established.

### Changes Required:

#### 1. Cookbook update

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.1/§6.2 `TBD` placeholders with the actual location,
naming convention, a reference test, and the run command, so a future contributor
adding a test doesn't have to reverse-engineer the pattern from this plan.

**Contract**: §6.1 (unit) points at `src/lib/recipe.test.ts` and names the
owned-paint-invariant pattern (assert the invariant, not the output) plus the
`unit` project run command. §6.2 (integration) points at
`src/pages/api/recipe.test.ts` and names the direct-handler-import +
`astro:env/server`-mock + `fetchMock` pattern, plus the `integration` project run
command. No file:line anchors beyond these two test files themselves (they *are*
the cookbook entries now, not evidence for §2's risk map).

### Success Criteria:

#### Automated Verification:

- `npm run test` (full suite, both projects) passes
- `npm run lint` passes repo-wide

#### Manual Verification:

- §6.1 and §6.2 in `context/foundation/test-plan.md` no longer read "TBD"
- The try/catch gap is recorded in this change's `plan-brief.md` Open Risks
  section with a clear follow-up recommendation (see brief)

---

## Testing Strategy

### Unit Tests:

- Owned-paint invariant across varied compositions (Phase 2)
- Direct `EmptyOwnedPaintsError` guard test (Phase 2)

### Integration Tests:

- Missing/wrong-type/empty-string/malformed-format `target_paint_id` (Phase 1 + 3)
- Zero owned paints (Phase 3)

### Manual Testing Steps:

1. Run `npm run test` and confirm both projects (`unit`, `integration`) report
   passing counts matching the cases listed above.
2. Perform the two "break it on purpose" manual verifications named in Phase 2
   and Phase 3 to confirm the tests are load-bearing.
3. Confirm `context/foundation/test-plan.md` §6.1/§6.2 read the filled-in pattern,
   not "TBD."

## Performance Considerations

None beyond what's already covered by Rollout Phase 3 (recipe-engine NFR timing
budget) — out of scope for this phase, per What We're NOT Doing.

## Migration Notes

Not applicable — this phase adds new files only; no existing behavior changes.

## References

- Research: `context/changes/testing-critical-path-guardrail-coverage/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (Risk Response Guidance for
  Risks #1, #4, #6), §3 Phase 1, §4 (Stack)
- Engine: `src/lib/recipe.ts`
- Route: `src/pages/api/recipe.ts`
- Supabase client: `src/lib/supabase.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap the test runner

#### Automated

- [x] 1.1 `npx astro sync` still succeeds
- [x] 1.2 `npm run test` runs and the smoke test passes
- [x] 1.3 `npm run lint` passes on the new files
- [x] 1.4 `npm run build` still succeeds

#### Manual

- [x] 1.5 `npm run test` output shows two distinct projects (`unit`, `integration`) running

### Phase 2: Recipe engine unit tests (Risk #1, Risk #4 defense-in-depth)

#### Automated

- [ ] 2.1 `npm run test -- --project unit` passes, including the new invariant and guard tests
- [ ] 2.2 `npm run lint` passes on `src/lib/recipe.test.ts`

#### Manual

- [ ] 2.3 Temporarily reintroducing a catalog-substitution bug causes the invariant test to fail

### Phase 3: API route integration tests (Risk #4 route-level, Risk #6)

#### Automated

- [ ] 3.1 `npm run test -- --project integration` passes, covering all five matrix cases
- [ ] 3.2 `npm run lint` passes on `src/pages/api/recipe.test.ts`
- [ ] 3.3 `npm run build` still succeeds

#### Manual

- [ ] 3.4 Temporarily removing the route's empty-owned-paints pre-check causes the corresponding test to fail differently

### Phase 4: Document the try/catch gap; update the cookbook

#### Automated

- [ ] 4.1 `npm run test` (full suite, both projects) passes
- [ ] 4.2 `npm run lint` passes repo-wide

#### Manual

- [ ] 4.3 §6.1 and §6.2 in `context/foundation/test-plan.md` no longer read "TBD"
- [ ] 4.4 The try/catch gap is recorded in `plan-brief.md` Open Risks with a follow-up recommendation
