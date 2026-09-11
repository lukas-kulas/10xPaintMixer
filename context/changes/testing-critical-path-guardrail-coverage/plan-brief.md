# Critical-Path Guardrail Coverage — Plan Brief

> Full plan: `context/changes/testing-critical-path-guardrail-coverage/plan.md`
> Research: `context/changes/testing-critical-path-guardrail-coverage/research.md`

## What & Why

Bootstrap this project's test runner from nothing and prove the recipe generator
never breaks two guarantees the PRD treats as non-negotiable: a generated recipe
never recommends a paint the user doesn't own, and an edge/empty/malformed input
never crashes instead of showing a readable message. This is rollout Phase 1 of
`context/foundation/test-plan.md` — the first of four phases protecting this
project's top risks.

## Starting Point

No test infrastructure exists today — no runner, no config, no test files. The
feature under test (`src/lib/recipe.ts` + `src/pages/api/recipe.ts`) is a single
vertical slice added in the last 3 commits and, per research, already behaves
correctly for every *reachable* case. The one real gap research found: no
try/catch around the engine call or the Supabase insert, so an unreachable-today
exception path would fall through to a generic 500.

## Desired End State

`npm run test` runs two Vitest projects — a fast pure-function suite for the
engine, and a real-`workerd` suite for the API route — covering the owned-paint
invariant, the engine's own defense-in-depth guard, and five edge/malformed-input
cases on the route. `context/foundation/test-plan.md`'s cookbook (§6.1/§6.2) names
the concrete pattern for the next contributor instead of reading "TBD."

## Key Decisions Made

| Decision                                      | Choice                                                                 | Why (1 sentence)                                                                                   | Source   |
| ---------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| Missing try/catch gap                          | Flag as a follow-up, don't test the exception path                     | Testing today's fallback would assert a guardrail violation as spec — the oracle-problem anti-pattern this rollout exists to avoid | Plan     |
| Engine's dead-code `EmptyOwnedPaintsError` guard | Test it directly (defense-in-depth)                                    | Cheapest possible layer (pure function); guards the exact divergent-guard regression research flagged | Plan     |
| Malformed-format `target_paint_id`             | Include in the test matrix                                             | Cheap addition, locks in today's clean-404 behavior against a future accidental change             | Plan     |
| Error-response assertion depth                 | Status code + shape only, never exact wording                          | Matches the test plan's own anti-pattern warning against brittle text/snapshot assertions          | Plan     |
| Risk priority within this phase                | All three risks (#1, #4, #6) are must-have, no cut line                | Scope is already small (two files); none of the three is optional padding                          | Plan     |
| Route test invocation style                    | Import and call `POST` directly, not `SELF.fetch()` against the built worker | Avoids requiring a production build before tests can run; matches Astro's own documented test pattern | Plan     |
| `astro:env/server` in tests                    | `vi.mock` with static test values                                      | `cloudflareTest()`'s Vite plugin doesn't include Astro's own env-var integration; mocking is the minimal fix | Plan     |

## Scope

**In scope:** Vitest + `@cloudflare/vitest-pool-workers` bootstrap; owned-paint
invariant tests; engine's empty-input guard test; route's edge/malformed-input
matrix (5 cases); cookbook update (§6.1/§6.2).

**Out of scope:** Fixing the try/catch gap; testing the uncaught-exception
fallback path; Risk #2/#3 (route auth, RLS/IDOR — Rollout Phase 2); Risk #5
(recipe-engine tuning/NFR timing — Rollout Phase 3); wiring CI as a required gate
(Rollout Phase 4); adding UUID-format validation to the route.

## Architecture / Approach

One root `vitest.config.ts` defines two Vitest 3 `test.projects`: `unit` (plain
Node, for `src/lib/recipe.ts`) and `integration` (`@cloudflare/vitest-pool-workers`'s
`cloudflareTest()` plugin against the real `wrangler.jsonc`, for
`src/pages/api/recipe.ts`). Integration tests import the route's `POST` handler
directly and invoke it with a constructed context object; `astro:env/server` is
mocked and Supabase's outbound HTTP is intercepted with `fetchMock`.

## Phases at a Glance

| Phase                                          | What it delivers                                              | Key risk                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1. Bootstrap the test runner                    | Vitest config + one real smoke test proving the harness works   | `astro:env/server` mock not wired correctly, every integration test fails at import |
| 2. Recipe engine unit tests                     | Owned-paint invariant + defense-in-depth guard test              | Asserting output values instead of the invariant (tautological test) |
| 3. API route integration tests                  | 5-case edge/malformed-input matrix                                | Over-mocking Supabase hides the real guard logic under test         |
| 4. Document gap + update cookbook                | Try/catch follow-up recorded; §6.1/§6.2 filled in                 | Gap gets silently dropped instead of recorded                        |

**Prerequisites:** None — greenfield test setup, no dependency on other rollout phases.
**Estimated effort:** ~1 session across 4 phases (small, well-bounded two-file slice).

## Open Risks & Assumptions

- **Try/catch gap (from research):** no safety net exists around `generateRecipe()`
  or the Supabase insert in `src/pages/api/recipe.ts:114-126`. If the route's
  duplicate empty-owned-paints pre-check is ever removed, or the engine's internal
  invariant throw fires, the exception is uncaught and produces a generic 500 that
  breaks the `{ error: string }` contract every other path in this route uses —
  a PRD guardrail violation ("czytelny komunikat" / readable message, always).
  **Recommendation:** open a small follow-up change to wrap the engine call and
  the insert in try/catch, translating any thrown error into the same
  `{ error: string }` shape. This is a code fix, not a test-rollout task, so it's
  explicitly out of scope for this plan.
  **Empirically confirmed during Phase 3:** temporarily removing the route's
  empty-owned-paints pre-check (as the manual verification step) reproduced
  this exact gap live — the request failed with an uncaught
  `EmptyOwnedPaintsError` rather than any HTTP response.
- `@cloudflare/vitest-pool-workers` has no stable pinned release as of this
  plan's Context7 grounding (only a beta/`main`-branch install path was
  documented) — the implementer should check for a stable release at
  implementation time and pin it if available, rather than installing `latest`
  against a moving beta target.

## Success Criteria (Summary)

- `npm run test` passes, covering the owned-paint invariant, the engine's
  defense-in-depth guard, and all 5 route edge/malformed-input cases.
- Two "break it on purpose" manual checks confirm the tests are load-bearing, not
  tautological.
- `context/foundation/test-plan.md` §6.1/§6.2 read the filled-in pattern.
- The try/catch gap is on record with a clear follow-up recommendation.
