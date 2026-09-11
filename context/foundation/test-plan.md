# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-10

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic check that already catches the
   regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in area Y"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/` (last 30
days, 15 commits — sufficient signal). Top churned directories:
`src/pages/api` (9), `src/components/auth` (8), `src/pages/dashboard` (4),
`src/components/paints` (4), `supabase/migrations` (4).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | A generated recipe recommends a paint the user doesn't actually own | High | Medium | PRD guardrail ("wygenerowany przepis nigdy nie używa farby spoza listy posiadanych"); archived S-04 plan's own description of the shortlist/enumeration search |
| 2 | A new or changed `/api/*` route ships without its required self-enforced 401 check | High | Medium | Hot-spot dir `src/pages/api` (9 commits/30d, highest churn in repo); CLAUDE.md's note that `PROTECTED_ROUTES` excludes `/api/*`; the same self-enforced-check callout recurs across 3 archived slice plans |
| 3 | A user reads, modifies, or deletes another user's paints/recipes (RLS bypass or IDOR on an id-based route) | High | Low–Medium | PRD Access Control section (per-user data privacy); archived F-01 plan's own top-risk note on RLS; abuse-lens authorization/access class |
| 4 | An edge or empty-input state (zero owned paints, missing/invalid target id, malformed body) crashes instead of showing the designed guided message | Medium–High | Medium | Interview Q1 (top stated worry); PRD acceptance criterion ("jeśli lista farb jest pusta, użytkownik widzi czytelny komunikat") |
| 5 | The recipe engine regresses: quality threshold/`tintingStrength` tuning silently changes match quality, or generation exceeds the "few seconds" NFR budget | Medium | Medium–High | Interview Q3 (stated lowest-confidence area); archived S-04 plan's own "tune later" note on the 0.02 threshold and the Workers CPU-budget caveat |
| 6 | Malformed/untrusted input to the recipe endpoint (bad `target_paint_id`, wrong types) isn't rejected cleanly | Medium | Medium | PRD NFR ("wynik lub czytelny błąd, nie nieograniczone oczekiwanie"); abuse-lens untrusted-input class |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|---|---|---|---|---|
| #1 | The engine's returned recipe components are always a subset of the caller's actual owned-paint ids, across varied owned-list sizes/compositions | "The candidate shortlist can't introduce paints outside the owned list" — verify the shortlist is built strictly from the `ownedPaints` argument, not the wider catalog | Engine entry-point signature; how owned paints are fetched/joined before being passed in; any fallback path that substitutes a catalog paint | unit (pure function, no I/O) | Asserting today's output as the oracle instead of asserting the ownership invariant independently |
| #2 | Every handler under `/api/*`, for every HTTP method it exports, rejects an unauthenticated request with 401 before touching Supabase | "`PROTECTED_ROUTES` already covers this" — it explicitly excludes `/api/*`; each handler must be verified individually | Current list of API route files/methods; whether a shared auth-check helper exists or each route hand-repeats it; exact expected response shape (401 JSON, not a redirect) | integration (request the real Worker without a session cookie) | Testing one route as a stand-in for "the pattern" — a new route added later isn't covered by that generalization |
| #3 | With two real seeded users, user A cannot read, insert-as, update, or delete user B's `user_paints`/`recipes` rows via any route, even supplying B's row id directly | "RLS alone is sufficient, app-level ownership checks are redundant" — verify RLS is actually enabled and enforced per current policy, not assumed from the one-time F-01 manual check | Current RLS policy definitions per table; which routes accept a client-supplied id (delete, recipe target); whether any route uses a service-role client that bypasses RLS | integration (two seeded Supabase test users against real routes) | Testing ownership against a mocked/stubbed Supabase client — misses the real RLS boundary this risk is about |
| #4 | A zero-owned-paint request returns the documented guided response (not a 500/unhandled exception); same for other edge inputs (missing/invalid id, malformed body) | "The engine's empty-list guard is the only place this can go wrong" — verify the API route actually surfaces the guard as the intended status/message rather than letting it bubble as a 500 | Exact guard mechanism (error class/sentinel) in the engine; how the route maps it to a response; the full set of route-level input validations | integration (POST the real route with each edge input) | Testing only the happy path plus one obvious empty case, missing the malformed-type/missing-field inputs the risk is actually about |
| #5 | Fixture inputs (known target + owned-paint set) produce a stable, expected quality bucket and component structure across unrelated code changes; a realistic owned-paint count completes within the NFR budget | "The 0.02 threshold and 0.4 `tintingStrength` are invariants to freeze" — they are tuning knobs; a good test locks observable behavior/timing, not the literal constants, so legitimate future tuning isn't blocked | Current constant values (`CANDIDATE_POOL_SIZE`, `MAX_COMBINATION_SIZE`, `MAX_TOTAL_PARTS`, threshold); whether a timing measurement is feasible in the test environment vs. only in `workerd` | unit (fixture-based) for correctness; manual/CI-timed smoke for the NFR budget | Snapshotting the full output including exact distance floats — brittle to legitimate tuning; assert the quality bucket and component shape instead |
| #6 | `POST /api/recipe` with a missing, non-string, or non-existent `target_paint_id` returns a clean 400/404 with a readable error, never a 500 or hang | "The client always sends a well-formed body" — the server must not trust the request shape | Current body validation in the route; behavior on a Supabase lookup miss; any unbounded/slow path for adversarial input | integration (POST malformed bodies to the real route) | Validating only the empty-string case and assuming type-confusion or oversized payloads are handled equivalently |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Critical-path guardrail coverage | Bootstrap the test runner and prove the recipe engine/API never violate the owned-paint-only guarantee or crash on edge input | #1, #4, #6 | unit + integration | complete | context/changes/testing-critical-path-guardrail-coverage/ |
| 2 | Authorization & route-auth wiring | Lock down cross-user access and the self-enforced 401 pattern across all `/api/*` routes | #2, #3 | integration (two seeded users) | change opened | context/changes/testing-authorization-route-auth-wiring/ |
| 3 | Recipe engine regression safety net | Protect the tunable recipe knobs and the NFR timing budget against silent drift | #5 | unit (fixtures) + timing smoke | not started | — |
| 4 | Quality-gates wiring | Wire the unit/integration suites from Phases 1–3 into CI as required gates (CI today only runs sync + lint + build) | cross-cutting | gates | not started | — |

**Order rationale:** Phase 1 goes first because nothing exists yet (bootstraps the runner) and covers both the interview's top stated worry (#4) and the PRD's core product-hypothesis guardrail (#1), plus the paired abuse-lens input-validation risk (#6). Phase 2 follows because `src/pages/api` is the highest-churn directory in the repo and covers the two highest-impact authorization risks. Phase 3 addresses the interview's stated lowest-confidence area once the fixture/runner pattern from Phase 1 exists to build on. Phase 4 locks the floor into CI once real gates exist to wire.

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | ^3.x | Astro app code needing `astro:env` types requires `npx astro sync` first, per CLAUDE.md |
| Worker-runtime integration | `@cloudflare/vitest-pool-workers` | latest | Runs tests inside real `workerd` via Miniflare — needed for routes gated by Cloudflare-specific bindings; import test utilities (`env`, `SELF`, `fetchMock`) from `cloudflare:test`, confirmed current via Context7 against `cloudflare/workers-sdk` docs |
| API/external mocking | `vitest-pool-workers`'s built-in `fetchMock` | n/a | Declarative outbound-request mocking at the `workerd` fetch layer — mocks Supabase's HTTP edge only, never internal modules |
| e2e | none yet | — | Not planned this rollout — Worker-runtime integration tests already exercise real request/response through the deployed adapter; Playwright/e2e configuration is explicitly out of scope for this lesson (CLAUDE.md's 10xDevs Lesson boundaries — that's Module 3 Lesson 4) |
| accessibility | none yet | — | Not a top-N risk this rollout; revisit at `--refresh` if it becomes one |

**Stack grounding tools (current session):**
- Docs: Context7 — queried current Vitest and `@cloudflare/vitest-pool-workers` (via `cloudflare/workers-sdk`) docs: confirmed `cloudflare:test` import surface (`env`, `SELF`, `fetchMock`), Miniflare-backed real-`workerd` execution, isolated per-test storage; checked: 2026-09-10
- Search: Exa.ai — not used this pass (Context7 answered the grounding question directly); checked: 2026-09-10
- Runtime/browser: none available in current session — not used
- Provider/platform: none available in current session (no GitHub/Cloudflare/Supabase MCP exposed) — not used

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck (`astro sync && lint`) | local + CI | required (already wired) | syntactic / type drift |
| production build | local + CI | required (already wired) | build-breaking regressions |
| unit + integration (Vitest, incl. Worker-runtime) | local + CI | required after §3 Phase 1 | recipe-engine and API-route logic regressions |
| authorization/route-auth integration suite | CI on PR | required after §3 Phase 2 | cross-user access, missing 401 checks |
| recipe-regression fixtures | local + CI | required after §3 Phase 3 | silent threshold/`tintingStrength` drift |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Location:** co-located with the source file, `<name>.test.ts` next to `<name>.ts` (e.g. `src/lib/recipe.test.ts` next to `src/lib/recipe.ts`).
- **Runner:** the `unit` Vitest project (`vitest.config.ts` → `test.projects`) — plain Node environment, no Cloudflare plugin. Use for pure functions with no I/O and no Cloudflare bindings.
- **Pattern:** assert the *invariant* the function must uphold, never snapshot today's output values (e.g. "every output id traces back to an input id," not "output equals this fixed object"). Build fixtures with small local helpers rather than one giant shared fixture file.
- **Reference test:** `src/lib/recipe.test.ts` — the owned-paint-invariant tests (Risk #1) and the direct `EmptyOwnedPaintsError` guard test (Risk #4 defense-in-depth).
- **Run:** `npm run test -- --project unit`.

### 6.2 Adding an integration test (Worker-runtime API route)

- **Location:** co-located, `<route>.test.ts` next to the route file (e.g. `src/pages/api/recipe.test.ts` next to `src/pages/api/recipe.ts`).
- **Runner:** the `integration` Vitest project — `@cloudflare/vitest-pool-workers`'s `cloudflareTest()` plugin, running inside real `workerd`, wired to the project's `wrangler.jsonc`.
- **Pattern:** import the route's exported handler (`POST`/`GET`/etc.) directly and invoke it with a constructed `APIContext`-shaped object (`request`, `cookies`, `locals.user`) — do not drive requests through `SELF.fetch()`, which requires a production build first. `astro:env/server` must be mocked (`vi.mock("astro:env/server", () => ({...}))`, declared before the route import so Vitest's hoisting puts it first) since `cloudflareTest()`'s plugin does not include Astro's own Vite/env integration. Mock Supabase's outbound HTTP with `@msw/cloudflare`'s `setupNetwork()` (`network.enable()` in `beforeAll`, `network.resetHandlers()` in `afterEach`, `network.disable()` in `afterAll`; register per-test responses with `network.use(http.get(url, () => HttpResponse.json(...)))`) — never mock the `@/lib/supabase` module itself. Assert status code + that the error field is a non-empty string, never exact wording.
- **Reference test:** `src/pages/api/recipe.test.ts` — the edge/malformed-input matrix (Risk #4 route-level, Risk #6).
- **Run:** `npm run test -- --project integration`.

### 6.2b Adding a two-seeded-user RLS/authorization test

- **Location:** a dedicated file per cross-cutting concern, not co-located with a single route — e.g. `src/pages/api/cross-user-authorization.test.ts`. A reusable harness lives at `src/test-support/rls-harness.ts` (`createTestUser`, `deleteTestUser`, `signInForClient`, `signInForCookieHeader`).
- **Runner:** the `integration` Vitest project, same as §6.2 — but this suite needs a **real** local Supabase, not `@msw/cloudflare` mocking, since the point is proving RLS itself, not app-level filtering. Requires `npx supabase start` (Docker) running locally.
- **Config:** `vitest.config.ts` loads `.env.test.local` (gitignored, **not** `.dev.vars` — that file holds this project's cloud dev target) via `process.loadEnvFile`, then forwards `TEST_SUPABASE_URL`/`TEST_SUPABASE_ANON_KEY`/`TEST_SUPABASE_SERVICE_ROLE_KEY` into the `workerd` sandbox as `RLS_TEST_SUPABASE_*` via `miniflare.bindings`, readable as plain `process.env.RLS_TEST_SUPABASE_*` inside the test file. Populate `.env.test.local` from `npx supabase status`'s printed URL/keys. **Do not** import `env`/`SELF` from `cloudflare:test` in this project — it crashes (Durable-Object dispatch requires statically resolving the Astro Cloudflare adapter's virtual main entry-point, which Miniflare's analyzer can't do outside Astro's own build).
- **Pattern:** create two fresh real users per test file (`beforeAll`), delete them in `afterAll` (cascades to their rows via `on delete cascade` — no manual row cleanup needed). Assert cross-user access is blocked on **two layers**: via the real route handlers with a real authenticated session (hydrate it by setting a `Cookie` header built from `signInForCookieHeader`'s captured `Set-Cookie` values — `src/lib/supabase.ts` reads sessions from the raw `Cookie` request header), and directly against Supabase with `signInForClient` bypassing the app's routes entirely. The direct-DB layer is the one that actually isolates an RLS regression from an app-level-filter regression, since every current route already filters by session `user_id`.
- **Reference test:** `src/pages/api/cross-user-authorization.test.ts` — the full ownership matrix (select/insert-as/update/delete) for `user_paints` and `recipes` (Risk #3).
- **Run:** `npm run test -- --project integration cross-user-authorization` (skips cleanly, via `describe.skipIf`, when `.env.test.local` isn't configured — e.g. CI).

### 6.3 Adding an e2e test

- Not planned this rollout — see §4.

### 6.4 Adding a test for a new API endpoint

Every `/api/*` route must self-enforce auth — `PROTECTED_ROUTES` in `src/middleware.ts` only guards `/dashboard`, never `/api/*`. For each HTTP method the route exports (except the three auth-flow routes, `signin`/`signup`/`signout`, which are intentionally unguarded):

- Add a check at the top of the handler, before any Supabase call: `const user = context.locals.user; if (!user) return json({ error: "Unauthorized" }, 401);` (no shared helper exists yet — every route hand-repeats this).
- Add a test asserting exactly this: build an `APIContext` with `locals: { user: null }`, invoke the handler directly, assert `status === 401` and a non-empty string `error` field. No `@msw/cloudflare` mocking is needed for this case — the check returns before any network call, so only the `astro:env/server` mock (per §6.2) is required.
- **Reference tests:** `src/pages/api/paints.test.ts`, `src/pages/api/paints/[id].test.ts`, and the `"returns 401 when unauthenticated"` case in `src/pages/api/recipe.test.ts` (Risk #2).
- If the new endpoint reads/writes a per-user table, also extend `src/pages/api/cross-user-authorization.test.ts`'s pattern per §6.2b for the corresponding RLS coverage.

### 6.5 Adding a fixture-based regression test for the recipe engine

- TBD — see §3 Phase 3.

### 6.6 Per-rollout-phase notes

**§3 Phase 1 (`testing-critical-path-guardrail-coverage`), implemented 2026-09-11:**
Two corrections to §4's tool grounding surfaced during implementation (not yet
backported to §4 itself — flagging here for the next `--refresh`):

- `@cloudflare/vitest-pool-workers`'s stable release (`0.22.0`) requires
  `vitest@^4.1.0`, not `^3.x` as §4 states. The `test.projects` config API is
  unaffected (unchanged since Vitest 3.2).
- `vitest-pool-workers`'s built-in `fetchMock` (named in §4) has been removed
  upstream entirely as of `0.22.0`. `@msw/cloudflare` + `msw` is Cloudflare's
  current documented replacement for mocking outbound HTTP inside `workerd`
  tests — same intent (mock the HTTP edge, never the internal module), see §6.2.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Static catalog data (`brands`/`paint_types`/`paints`)** — seeded once via migration from a fixed CSV, never mutated by the app in MVP; the seed script is the "test." Re-evaluate if the catalog becomes user-editable or multi-brand logic is added. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-10
- Stack versions last verified: 2026-09-10
- AI-native tool references last verified: n/a — no AI-native layer in this rollout

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
