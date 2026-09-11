---
date: 2026-09-10T22:56:17+02:00
researcher: lukas.qlas
git_commit: 3499f71988f9702c6e7a91e97ee106e8506bce79
branch: master
repository: 10xPaintMixer
topic: "Grounding for test-plan.md §3 Phase 1 (Critical-path guardrail coverage) — risks #1, #4, #6"
tags: [research, codebase, recipe-engine, api-recipe, owned-paint-invariant, error-handling, input-validation]
status: complete
last_updated: 2026-09-10
last_updated_by: lukas.qlas
---

# Research: Critical-path guardrail coverage (test-plan.md Phase 1)

**Date**: 2026-09-10T22:56:17+02:00
**Researcher**: lukas.qlas
**Git Commit**: [3499f71](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79)
**Branch**: master
**Repository**: 10xPaintMixer

## Research Question

Ground `context/foundation/test-plan.md` §3 Phase 1 ("Critical-path guardrail coverage") ahead of `/10x-plan`, per the Risk Response Guidance table (§2) for risks:

- **#1** — a generated recipe recommends a paint the user doesn't actually own
- **#4** — an edge/empty-input state crashes instead of showing the designed guided message
- **#6** — malformed/untrusted input to the recipe endpoint isn't rejected cleanly

The guidance table asked specifically for: the engine's entry-point signature and owned-paint provenance; the exact guard mechanism for empty/invalid input and how far it propagates; the route's body validation, Supabase-miss handling, and any unbounded/slow paths.

## Summary

The feature is a single vertical slice: `src/lib/recipe.ts` (pure engine, one exported function) called by exactly one consumer, `src/pages/api/recipe.ts` (`POST /api/recipe`). Both files were added in the last 3 commits (2026-09-10) and are fully read in this research.

- **Risk #1 (owned-paint invariant): holds, verified end-to-end.** Every paint in a generated recipe's `components` is traceably an element of the caller-supplied `ownedPaints` array — no fallback, no catalog substitution, no code path that could introduce a non-owned paint. Full trace in [Detailed Findings §1](#1-owned-paint-invariant-risk-1).
- **Risk #4 (edge/empty-input crash): the guard exists but is currently dead code, and there is no crash-safety net if it ever fires.** The engine defines `EmptyOwnedPaintsError` and throws it when `ownedPaints.length === 0` — but the API route independently re-implements the same check *before* calling the engine, so the engine's own guard is unreachable via the real endpoint today. Critically, **there is no `try/catch` anywhere around the `generateRecipe()` call or the subsequent Supabase insert**, and no custom Astro 500 page — so if this guard (or the engine's other internal invariant throw at `recipe.ts:127-129`) ever does fire, it produces a generic framework-level 500 that does not match the `{ error: string }` JSON shape every other error path in the route uses. Full trace in [Detailed Findings §2](#2-emptyinvalid-input-guard-risk-4).
- **Risk #6 (malformed input): the route validates cleanly.** `target_paint_id` is checked for presence and type *before* any Supabase call; malformed JSON, missing field, wrong type, and empty string all resolve to a clean `400`. Supabase misses resolve to clean `404`/`422`, not `500`/hangs — only genuine Supabase errors 500, and those short-circuit quickly (no hang risk). Compute is structurally bounded regardless of input size (the combinatorial search is capped by fixed constants, not by owned-paint count). Full trace in [Detailed Findings §3](#3-malformeduntrusted-input-risk-6).

The most actionable finding for `/10x-plan` is the **divergent-guard pattern** in risk #4: two independent checks exist for the same "empty owned paints" condition (route pre-check and engine throw), only one of which is live. A regression that removes the route's pre-check (e.g. a refactor) would silently fall through to the engine's guard — which, given the missing try/catch, would then surface as an inconsistent generic 500 instead of the current clean `422`. See [Open Questions](#open-questions) for how this should shape Phase 1 test scope.

## Detailed Findings

### 1. Owned-paint invariant (Risk #1)

- Entry point: `generateRecipe(target: { r, g, b }, ownedPaints: OwnedPaintInput[]): RecipeResult` — [src/lib/recipe.ts:85-88](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/lib/recipe.ts#L85-L88)
- Candidates are built **exclusively** by mapping over the `ownedPaints` argument — [src/lib/recipe.ts:95-101](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/lib/recipe.ts#L95-L101)
- `shortlist` is `candidates.slice(0, CANDIDATE_POOL_SIZE)` — a slice of the same array, nothing merged in — [src/lib/recipe.ts:106](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/lib/recipe.ts#L106)
- `combinations()` and `integerRatioTuples()` only permute/subset `shortlist` — no external data source, no catalog fetch, no default paint — [src/lib/recipe.ts:50-78](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/lib/recipe.ts#L50-L78)
- Output `components` trace straight back to elements of the original `ownedPaints` array: `entry.paint.id` — [src/lib/recipe.ts:117-122](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/lib/recipe.ts#L117-L122)
- The `target` paint is fetched separately from the full catalog and used **only** for distance scoring ([src/lib/recipe.ts:93](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/lib/recipe.ts#L93)) — it never enters `candidates`/`shortlist` and its id never appears in `components`.
- Upstream, `ownedPaints` in the API route comes only from a `user_paints` join filtered by `user_id` — [src/pages/api/recipe.ts:86-98](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L86-L98). The response-decoration step (`paintsById.get(component.paintId)`) also looks up display fields only from `ownedPaints` — [src/pages/api/recipe.ts:104,131-134](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L104) — so even that path can't leak a non-owned paint (worst case is a missing display-field lookup, not a substituted paint).
- **No other file in `src/` calls `generateRecipe` or references `EmptyOwnedPaintsError`** — `src/pages/api/recipe.ts` is the only consumer.

**Verdict grounding for the plan:** the invariant is real and provably enforced by data flow, not by convention. A unit test for this risk should assert the invariant directly (every output `paintId` ∈ input `ownedPaints` ids) across varied owned-list sizes/compositions — not snapshot today's output, per the test-plan's own anti-pattern warning for risk #1.

### 2. Empty/invalid-input guard (Risk #4)

**Guard type: a thrown custom `Error` subclass, not a Result type or sentinel — and it is currently unreachable in practice.**

- `EmptyOwnedPaintsError` defined — [src/lib/recipe.ts:9-14](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/lib/recipe.ts#L9-L14)
- Thrown when `ownedPaints.length === 0` — [src/lib/recipe.ts:89-91](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/lib/recipe.ts#L89-L91)
- The API route **independently re-implements the same check before calling the engine**, and returns its own clean response: `422 { error: "You don't have any paints yet." }` — [src/pages/api/recipe.ts:100-102](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L100-L102). This means `generateRecipe` is never actually invoked with an empty array through the real endpoint — `EmptyOwnedPaintsError` is dead code today.
- There is a second, internal-invariant guard — a plain `Error` (not `EmptyOwnedPaintsError`) thrown if the search loop somehow produces no best match despite non-empty input — [src/lib/recipe.ts:127-129](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/lib/recipe.ts#L127-L129). This is a defensive guard against a logic bug, not a user-input path.
- **No `try/catch` anywhere** around the `generateRecipe(...)` call ([src/pages/api/recipe.ts:114](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L114)) or the subsequent `recipes` insert ([src/pages/api/recipe.ts:116-122](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L116-L122)). `src/middleware.ts` has no error-translation logic either (auth/routing only). No `src/pages/500.astro` exists and `astro.config.mjs` has no `onError`/body-size config (confirmed via glob/grep).
- **Consequence:** if either throw ever does fire (a future refactor removes the route's pre-check, or the internal invariant is violated), the exception propagates fully uncaught to Astro/Cloudflare's default error handling — a generic 500 that does **not** match the `{ error: string }` JSON shape every other error path in this route uses. This is the concrete mechanism by which risk #4 ("crashes instead of showing the designed guided message") could actually manifest, even though the *currently reachable* empty-input path is handled cleanly.
- **Invalid/missing target paint id is handled entirely in the route**, not the engine — presence/type check at [src/pages/api/recipe.ts:66-70](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L66-L70), not-found check at [src/pages/api/recipe.ts:82-84](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L82-L84). The engine performs **no validation** of `target` — it just does `new Color([target.r, target.g, target.b])` ([src/lib/recipe.ts:93](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/lib/recipe.ts#L93)) and would produce NaN/nonsense output rather than throwing on a garbage target — but the route's own presence/type/not-found checks prevent a garbage target from ever reaching the engine in practice.

**Tunable constants** (all `src/lib/recipe.ts`): `CANDIDATE_POOL_SIZE=12` (L3), `MAX_COMBINATION_SIZE=3` (L4), `MAX_TOTAL_PARTS=6` (L5), `WASHES_TINTING_STRENGTH=0.4` (L6, applied only when `paint.typeName === "Washes"`, L97-99), `QUALITY_THRESHOLD=0.02` (L7, used at L135 to classify `quality: "great" | "approximate"`).

Minor edge worth flagging (not a risk-map item, informational): `isLowestTerms` uses `parts.reduce((acc, part) => gcd(acc, part))` with no initial value — for single-paint combinations (`size === 1`), `reduce` returns the lone element without invoking the callback, so only `parts = [1]` survives the lowest-terms filter for 1-paint recipes. Harmless in effect (any ratio of a single paint against itself is the same color) but worth a comment if this logic is ever reused. [src/lib/recipe.ts:44-46](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/lib/recipe.ts#L44-L46)

### 3. Malformed/untrusted input (Risk #6)

- Auth check runs first, independent of `middleware.ts`'s `PROTECTED_ROUTES` (which only lists `/dashboard`, confirmed at [src/middleware.ts:4](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/middleware.ts#L4), matched via `startsWith`) — the route does its own `context.locals.user` check: [src/pages/api/recipe.ts:56-59](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L56-L59). This confirms CLAUDE.md's note that `/api/*` relies on each route's own self-enforced check, relevant groundwork for Phase 2 (risk #2) too.
- Body parsing is defensive: `context.request.json().catch(() => null)` — malformed JSON becomes `null`, not a crash — [src/pages/api/recipe.ts:65](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L65)
- Validation runs **before** any Supabase call: `typeof targetPaintId !== "string" || !targetPaintId` → clean `400 { error: "target_paint_id is required" }` — [src/pages/api/recipe.ts:66-70](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L66-L70). This rejects: missing field, wrong type (number/object/array), empty string, and malformed JSON, all uniformly. No format check beyond "non-empty string" (no UUID pattern) — acceptable since the value is only used as a parameterized `.eq()` filter, not interpolated into raw SQL (no injection risk).
- Target-paint Supabase miss: `.maybeSingle()` → clean `404` on no rows, no hang; query error → `500` that **leaks the raw Postgres error message** to the client (`{ error: targetError.message }`) — [src/pages/api/recipe.ts:72-84](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L72-L84)
- Owned-paints Supabase miss: empty result → clean `422` (see §2 above); query error → `500`, same raw-message-leak pattern — [src/pages/api/recipe.ts:86-102](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L86-L102)
- No unbounded/slow path: no app-level body-size limit (relies on Cloudflare Workers platform limits — confirmed no such config in `astro.config.mjs`), but the engine's compute is structurally bounded — the shortlist is capped at `CANDIDATE_POOL_SIZE=12` regardless of how many paints the user owns, and the combinatorial search is capped by `MAX_COMBINATION_SIZE`/`MAX_TOTAL_PARTS` (~5,000 `spectral.mix()` calls total, per the route's own comment at [src/pages/api/recipe.ts:33-37](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L33-L37)) — runtime does not scale with owned-paint count beyond an O(n log n) sort.
- A soft per-user rate limit exists (10 req/60s, in-memory `Map`) — [src/pages/api/recipe.ts:38-48](https://github.com/lukas-kulas/10xPaintMixer/blob/3499f71988f9702c6e7a91e97ee106e8506bce79/src/pages/api/recipe.ts#L38-L48) — explicitly documented in-code as isolate-local, not distributed, since no KV/Durable Object is provisioned. The backing `Map` is never cleaned up for idle users, a very minor unbounded-memory note, mitigated by Workers isolates being short-lived/recycled.

## Code References

- `src/lib/recipe.ts:85-88` — `generateRecipe` entry point
- `src/lib/recipe.ts:9-14`, `:89-91` — `EmptyOwnedPaintsError` definition and throw site
- `src/lib/recipe.ts:95-122` — candidate/shortlist/output construction (owned-paint invariant trace)
- `src/lib/recipe.ts:127-129` — internal invariant defensive throw
- `src/lib/recipe.ts:3-7` — tunable constants
- `src/pages/api/recipe.ts:50` — `POST` handler entry
- `src/pages/api/recipe.ts:56-59` — self-enforced auth check
- `src/pages/api/recipe.ts:65-70` — body parse + validation
- `src/pages/api/recipe.ts:72-102` — Supabase lookups (target paint, owned paints) and their miss/error handling
- `src/pages/api/recipe.ts:100-102` — route-level empty-owned-paints guard (pre-empts the engine's own guard)
- `src/pages/api/recipe.ts:114-126` — engine call + recipe persistence, no try/catch
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]`, confirms `/api/*` is excluded

## Architecture Insights

- **Divergent-guard pattern**: the "empty owned paints" condition is checked in two independent places (API route pre-check, engine throw) with only one currently live. This is a coupling risk for future refactors, not a bug today — worth calling out explicitly in the Phase 1 plan rather than assuming the engine's guard is redundant.
- **Result handling is inconsistent by layer**: Supabase interactions use the `{ data, error }` result-object pattern (explicitly checked, never thrown), while the engine layer uses thrown exceptions. The route has no try/catch, so it only tolerates the Supabase pattern gracefully — any exception-based error (from the engine or elsewhere) has no safety net.
- **Error-response shape discipline**: every reachable error path in the route returns `json({ error: string }, status)` consistently — this is the shape a guided-message test should assert against, and the shape that would silently break if an uncaught exception ever took the generic-500 path instead.

## Historical Context (from prior changes)

- `context/archive/2026-09-10-generate-color-recipe/plan.md:44` — the `QUALITY_THRESHOLD` (0.02) is documented as "a starting point... tune it later against real user feedback... rather than treating it as precise" — supports the test-plan's own anti-pattern warning for risk #5 (don't freeze the literal constant).
- `context/archive/2026-09-10-generate-color-recipe/plan.md:45` — `WASHES_TINTING_STRENGTH=0.4` is "a modeling approximation, not derived from real pigment data" — same tuning-knob caveat.
- `context/archive/2026-09-10-generate-color-recipe/plan.md:226-228` and `plan-brief.md:67` — the ~5,000 `spectral.mix()`-calls-per-request budget is flagged as "not verified against the actual deployment plan's limit," with a Phase 2 manual timing check called out as the way to confirm it — relevant grounding for test-plan.md §3 Phase 3 (risk #5), not this phase.
- `context/archive/2026-09-09-paint-color-data-schema/plan.md:136` and `context/foundation/roadmap.md:83` — RLS is flagged as F-01's top risk ("jeśli schemat/RLS zostaną źle zaprojektowane teraz, każdy kolejny slice... odziedziczy błąd prywatności") — relevant grounding for test-plan.md §3 Phase 2 (risk #3), not this phase.
- `context/foundation/prd.md:40-41` — guardrail language: recipes must never use a non-owned paint, and generation must always end in bounded time with a result or readable error, never unbounded waiting.
- `context/foundation/prd.md:52-53` (US-01 acceptance criteria) — "Przepis wykorzystuje wyłącznie farby zadeklarowane przez użytkownika jako posiadane" and "Jeśli lista farb jest pusta, użytkownik widzi czytelny komunikat zamiast błędu lub pustego wyniku" — directly ground risks #1 and #4.
- Git history (all commits dated 2026-09-10, this repo's entire history spans a few days): `277debe` added the engine, `ddd9a3b` added the API route, `60bebd2` added the rate limiter as an impl-review triage fix — confirms this slice is freshly built and not yet covered by any test.

## Related Research

- `context/archive/2026-09-10-generate-color-recipe/research.md` — spectral.js compatibility research that preceded implementation of this same feature.

## Open Questions

1. Should Phase 1's plan unit-test the engine's own `EmptyOwnedPaintsError` guard directly (calling `generateRecipe` with an empty array), even though it's currently unreachable via the real API route — as a defense-in-depth check against a future refactor that removes the route's pre-check?
2. Should Phase 1 also cover the "uncaught exception" path itself (e.g., forcing the internal invariant throw, or a Supabase call that throws rather than returns an error object) to confirm what response shape actually results today — or is that out of scope since it's not currently user-reachable and fixing the missing try/catch would be a code change, not a test?
3. Is the generic Astro/Cloudflare 500 (no custom error page) an acceptable interpretation of the PRD's "czytelny komunikat" (readable message) guardrail for the *unreachable* failure paths, or does this gap belong in front of `/10x-plan` as something the plan should flag rather than silently test around?
4. `target_paint_id` validation is presence/type-only (no UUID-format check) — confirmed safe against injection since it's a parameterized filter value, but should the Phase 1 plan still add a malformed-format case (e.g. a non-UUID string) to the risk-#6 test matrix, given the route would currently treat it as a normal 404 "not found" rather than a 400?
