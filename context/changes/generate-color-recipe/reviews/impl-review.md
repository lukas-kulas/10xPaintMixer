<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Generate Color Recipe (S-04) Implementation Plan

- **Plan**: context/changes/generate-color-recipe/plan.md
- **Scope**: Full plan (Phases 1-4)
- **Date**: 2026-09-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — No rate limiting on the compute-heavy recipe endpoint

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/recipe.ts
- **Detail**: `POST /api/recipe` runs the Phase 2 search (~5,000 `spectral.mix()` calls per request, per the plan's own Performance Considerations) — an order of magnitude more compute than any other route in the app. There is no rate limiting anywhere in this codebase, so this isn't a regression, but this endpoint is the first one where repeated authenticated requests could meaningfully drive up Workers CPU usage/cost, since it's proportionally far more expensive than `paints.ts`/`[id].ts`.
- **Fix A ⭐ Recommended**: Accept as risk for this MVP change; document the assumption.
  - Strength: Matches the project's stated low-complexity goal (`roadmap.md`: `main_goal: low-complexity`) and its complete absence of rate-limiting infrastructure anywhere else — adding a one-off limiter to a single endpoint would itself be an inconsistent, unprecedented pattern.
  - Tradeoff: A malicious or buggy client could still hammer this endpoint and run up Workers CPU usage/cost.
  - Confidence: HIGH — no existing app-wide rate-limiting mechanism exists to hook into; building one is out of scope for S-04.
  - Blind spot: Haven't checked whether Cloudflare-level protections (WAF rules, account rate limits) are already configured outside the app code.
- **Fix B**: Add a basic per-user rate limit to this endpoint now (e.g. Workers KV-backed counter).
  - Strength: Directly closes the cost/DoS gap on the most expensive endpoint in the app.
  - Tradeoff: Introduces new infrastructure with no precedent elsewhere in the codebase — a meaningful scope addition beyond S-04's plan.
  - Confidence: MEDIUM — feasible via KV or Durable Objects, but disproportionate to an MVP feature's scope.
  - Blind spot: Haven't verified what Cloudflare bindings are already available in `wrangler.jsonc` for implementing a limiter cheaply.
- **Decision**: FIXED via Fix B (in-memory per-isolate limiter — no KV binding provisioned; documented as a soft/best-effort limit, not a strict distributed one). Implemented in `src/pages/api/recipe.ts` (10 requests/60s per user id, `429` on excess).

### F2 — Ambient declaration includes an unused `OKLCh` member

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/types/spectral.d.ts
- **Detail**: The plan's contract scoped the ambient declaration to "only the members this codebase actually calls." The file also declares `readonly OKLCh: number[]`, which nothing in `src/lib/recipe.ts` (or anywhere else) currently uses.
- **Fix**: Remove the unused `OKLCh` member, or leave it if `OKLCh` is expected to be useful soon — harmless either way, purely cosmetic scope-tightening.
- **Decision**: FIXED — removed the unused `OKLCh` member from `src/types/spectral.d.ts`.

### F3 — Result-panel swatch size differs from the plan's literal wording

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/recipe/RecipeGenerator.tsx
- **Detail**: The plan said to reuse `MyPaintsList.tsx`'s `size-6 rounded-full` swatch style. The list rows do use `size-6`, but the result-comparison panel's target/result swatches use `size-8` for better visual comparison at a glance.
- **Fix**: No action needed — `size-8` is a reasonable, arguably better UX choice for a side-by-side color comparison than a literal `size-6` reuse; only relevant if strict plan-literalism is desired.
- **Decision**: SKIPPED — kept as `size-8`.

### F4 — Raw Supabase error message returned to the client on 500s

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/recipe.ts (lines returning `{ error: <supabaseError>.message }`)
- **Detail**: `paints.ts`'s error responses already return raw Supabase `.message` text verbatim; `recipe.ts` faithfully follows that existing convention rather than introducing a new one. Minor info-disclosure surface, but not a regression introduced by this change.
- **Fix**: None needed for this change; worth revisiting project-wide (across all API routes) if error-message exposure is ever tightened.
- **Decision**: SKIPPED — matches existing app-wide convention.

### F5 — `recipes.components` jsonb column has no shape constraint

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260910120000_create_recipes_schema.sql
- **Detail**: `components jsonb not null` has no `jsonb_typeof`/shape check. Low severity since the column is only ever populated server-side from `generateRecipe`'s own output, never from raw user input.
- **Fix**: Optionally add `check (jsonb_typeof(components) = 'array')` if stricter DB-level validation is ever desired; not required today.
- **Decision**: SKIPPED — server-populated only, low risk.
