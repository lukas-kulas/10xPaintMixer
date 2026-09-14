<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Saved Recipes with Notes

- **Plan**: context/changes/saved-recipes-with-notes/plan.md
- **Scope**: Full plan (Phases 1-4)
- **Date**: 2026-09-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — recipes.ts/[id].ts validation logic has no mocked-network test coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/recipes.test.ts, src/pages/api/recipes/[id].test.ts
- **Detail**: The plan's Phase 2/3 test contracts asked only for 401 coverage (test-plan.md §6.4) plus cross-user-authorization extensions, and both were delivered exactly as specified — this is not plan drift. But the sibling `recipe.test.ts` (existing convention) uses `@msw/cloudflare` to exercise every validation branch (missing/malformed input, 404, 500, 422, happy path). `recipes.test.ts`/`[id].test.ts` contain only a single 401 test per method, so `parseComponents`'s validation, the paint-ownership check, and notes-type validation in PATCH are exercised nowhere except `cross-user-authorization.test.ts`, which `describe.skipIf`-skips whenever local Supabase isn't running. A plain `npm run test` without `npx supabase start` never runs this logic at all.
- **Fix**: Add msw-mocked cases to `recipes.test.ts`/`[id].test.ts` mirroring `recipe.test.ts`'s pattern — at minimum: missing/empty `components`, a component `paint_id` the caller doesn't own, duplicate `paint_id` entries, a Supabase insert error, and a non-string `notes` PATCH body.
  - Strength: Closes a real coverage gap on the actual risky logic (ownership bypass, malformed input) using the project's own established §6.2 pattern — no new tooling needed.
  - Tradeoff: Adds ~30-45 min of test-writing across two files; not blocking since the plan's literal contract is already satisfied.
  - Confidence: HIGH — `recipe.ts`'s equivalent tests already prove the pattern works in this codebase.
  - Blind spot: None significant.
- **Decision**: FIXED — added msw-mocked cases to `recipes.test.ts` (missing/empty components, unowned paint_id, deduped-ownership success, insert error) and `recipes/[id].test.ts` (notes type matrix, empty-string clear, update error). Full suite now 47/47.

### F2 — Phase 1 commit unexpectedly included a pre-existing staged rename

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: N/A (git history — commit 37e4489)
- **Detail**: Before this implementation run started, `context/foundation/shape-notes.md → archive/shape-notes-2026-09-11-1156.md` was already staged in git's index (not just working-tree-dirty). During Phase 1's commit ritual, the dirty-path prompt correctly listed it and the user chose "stage only the planned set" — but since it was *already staged* (not freshly `git add`ed by that step), a plain `git commit` (no pathspec) committed the whole index regardless, sweeping it into 37e4489 alongside the intended Phase 1 files. The content itself is a harmless rename with no data loss.
- **Fix**: Leave as committed — rewriting history across 5 already-pushed-adjacent commits to extract one rename is riskier than the problem it solves. Recommend recording this as a process lesson: the phase-commit ritual's dirty-path check should also unstage (`git restore --staged`) any already-indexed-but-unplanned path before committing, or commit with an explicit pathspec (`git commit -- <paths>`) rather than relying solely on selective `git add`.
- **Decision**: ACCEPTED-AS-RULE: "Phase-commit ritual must account for pre-staged index content" (context/foundation/lessons.md). Commit 37e4489 left as-is — no code fix, rename is harmless.

### F3 — `parts`/`distance` validation admits NaN/Infinity

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/recipes.ts:122
- **Detail**: `parseComponents` only checks `typeof parts !== "number"`, which admits `NaN`/`Infinity`/negative values. `JSON.stringify(NaN)` serializes to `null` inside the `jsonb` column (no DB-level check on this field, unlike `result_hex`), so a malformed `parts` value would silently store `null` and later render as `"null parts"` in `SavedRecipesList.tsx`. Not cross-user exploitable, purely a data-integrity/UI-polish gap.
- **Fix**: Change the check to `typeof parts !== "number" || !Number.isFinite(parts) || parts <= 0`.
- **Decision**: FIXED — tightened `parseComponents`'s check (also fixed a null-access bug the naive fix would have introduced by reordering the object/null check first). Added regression tests for zero/negative `parts` (NaN/Infinity aren't independently testable over HTTP — `JSON.stringify` collapses them to `null`, already caught by the `typeof` check). Suite now 49/49.

### F4 — POST /api/recipes surfaces a raw FK error instead of a clean 404 for a nonexistent target_paint_id

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/recipes.ts:185
- **Detail**: Unlike `recipe.ts`, which pre-validates `target_paint_id` against `paints` and returns a clean 404, this route relies on the table's FK constraint, surfacing a raw Postgres constraint-violation message as a 400. Low practical impact — in the real flow, `target_paint_id` was already validated moments earlier by `POST /api/recipe`, so this path is only reachable via a hand-crafted request, not the normal UI flow.
- **Fix**: Optional — not required by the plan. If desired, add the same `paints` existence check `recipe.ts` uses before insert.
- **Decision**: SKIPPED
