<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Critical-Path Guardrail Coverage

- **Plan**: context/changes/testing-critical-path-guardrail-coverage/plan.md
- **Scope**: Phase 1-4 of 4 (full plan)
- **Date**: 2026-09-11
- **Verdict**: NEEDS ATTENTION (all findings fixed, commit 8310650)
- **Findings**: 0 critical, 3 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Malformed-non-UUID test doesn't test malformed-UUID behavior

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/recipe.test.ts:91-94 (`mockTargetPaintNotFound` / the "returns 404 ... including a malformed non-UUID id" test)
- **Detail**: `mockTargetPaintNotFound()` returns an empty array unconditionally, regardless of the actual `target_paint_id` sent. The test would pass identically whether the route correctly handles malformed UUIDs or not — it never exercises Supabase's real response to a type-mismatched filter value. In reality, `.eq("id", "not-a-uuid")` against a `uuid`-typed Postgres column typically fails server-side with an "invalid input syntax for type uuid" error (PostgREST surfaces this as an error response, not an empty result set), which would hit this route's `targetError` branch and return `500` with a leaked raw Postgres message — not the `404` this test asserts. The plan's own Phase 3 contract inherited this same unverified assumption from research.md's Open Question 4, which flagged it as uncertain and was never resolved before the test shipped. This is a live instance of the "oracle problem" the test plan itself names as the single most dangerous anti-pattern for AI-written tests: the test's expected value doesn't come from verified real behavior.
- **Fix A ⭐ Recommended**: Split into two honestly-scoped tests — rename the current one to "returns 404 when target_paint_id is a well-formed but non-existent UUID," and add a new test that mocks a PostgREST-style error response for the malformed-format case, asserting whatever the route's `targetError` branch actually produces (likely 500).
  - Strength: Closes the oracle-problem gap; both tests then assert real, verifiable behavior instead of an assumption.
  - Tradeoff: Requires confirming actual PostgREST error semantics for a type-mismatched `uuid` filter (via Context7/docs, or empirically against the live Supabase project) before locking in the new expected status code — more work than a one-line fix.
  - Confidence: MED — Postgres/PostgREST's invalid-uuid-syntax error behavior is well-documented in general, but not yet verified against this specific project's Supabase version/config.
  - Blind spot: Haven't confirmed against this project's actual live Supabase instance; there's a real chance behavior differs by PostgREST version.
- **Fix B**: Keep one test but rename it to describe only what's actually tested ("well-formed but non-existent UUID → 404"), and explicitly note in a comment that malformed-format handling is unverified, deferring it to a follow-up.
  - Strength: Quick, honest, no new research needed right now.
  - Tradeoff: Risk #6's malformed-input scenario (explicitly named in the test plan's §2 Risk Map) stays only partially covered.
  - Confidence: HIGH — this is a pure documentation/renaming change with no behavioral claims.
  - Blind spot: None significant, but doesn't advance actual coverage.
- **Decision**: FIXED via Fix A. Verified real PostgREST behavior via Context7 (unmapped Postgres errors default to HTTP 400; recipe.ts:79-81 collapses any Supabase query error to 500 regardless of PostgREST's own status). Split into "well-formed but not found" (404, new `NONEXISTENT_PAINT_ID` constant) and "malformed non-UUID string" (500, new `mockTargetPaintMalformedId()` mocking a PostgREST 22P02-style error). All 6 integration tests pass.

### F2 — Shared rate-limiter state across tests in the same file (latent flakiness)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/recipe.test.ts (`fakeUser()`) / src/pages/api/recipe.ts:40 (`requestTimestampsByUser`)
- **Detail**: `fakeUser()` returns the same hardcoded user id for every test in the file, and the route's per-isolate rate-limit `Map` is module-level state that isn't reset between tests. Today's 5 `it()` blocks stay safely under the 10-requests/60s threshold, but this is a silent time-bomb: the cookbook (§6.2) explicitly tells future contributors to extend this same file, and the 11th test added here will start failing with a spurious `429` instead of whatever status it's actually asserting.
- **Fix**: Have `fakeUser()` accept an id parameter (or generate a unique id per call, e.g. via a counter) so each test uses a distinct user id, sidestepping the shared rate-limit bucket entirely. Test-only change, no production code touched.
- **Decision**: FIXED. `fakeUser()` now increments a module-level counter and returns a fresh `test-user-N` id per call, so every test lands in its own rate-limiter bucket. All 6 integration tests pass.

### F3 — Wrong-type test only covers `number`, not `object`/`array`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/recipe.test.ts ("returns 400 when target_paint_id has the wrong type")
- **Detail**: Phase 3's plan contract named three wrong-type sub-cases — "number/object/array" — but only `target_paint_id: 42` (number) is tested. Verified low real risk: the route's guard (`typeof targetPaintId !== "string"`) treats all three types identically, so this isn't hiding a real behavioral gap — but it's a literal miss against the written contract, and a future refactor that special-cased one type wouldn't be caught.
- **Fix**: Parameterize the existing test (e.g. `it.each([42, {}, []])`) or add two more `it()` cases for `{}` and `[]`.
- **Decision**: FIXED. Parameterized with `it.each` over number/object/array. All 3 sub-cases pass.
