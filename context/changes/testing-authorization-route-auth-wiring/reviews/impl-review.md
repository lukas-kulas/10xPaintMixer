<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Authorization & Route-Auth Wiring

- **Plan**: context/changes/testing-authorization-route-auth-wiring/plan.md
- **Scope**: Full plan (Phases 1-4)
- **Date**: 2026-09-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Phase 2's plan prose describes a superseded env-value mechanism

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `context/changes/testing-authorization-route-auth-wiring/plan.md:122-152` (Critical Implementation Details) and `:230-236` (Phase 2 Contract)
- **Detail**: The plan specifies reading real Supabase values via `.dev.vars` and `import { env } from "cloudflare:test"`, with binding names `SUPABASE_URL`/`SUPABASE_KEY`/`SUPABASE_SERVICE_ROLE_KEY`. During Phase 2 implementation this was found not to work in this project: importing `cloudflare:test` crashes (Miniflare can't statically resolve the Astro Cloudflare adapter's virtual main entry-point), and `.dev.vars` turned out to point at a cloud Supabase project, not local. The actual implementation (`vitest.config.ts`, `src/test-support/rls-harness.ts`) uses a new gitignored `.env.test.local` with `TEST_SUPABASE_*`, forwarded as `RLS_TEST_SUPABASE_*` bindings, read via plain `process.env` — confirmed used consistently everywhere, and accurately documented in `test-plan.md` §6.2b. The deviation was surfaced and reasoned through live during implementation (commit `d5c2590`) and the cookbook (the canonical living doc per this project's own methodology) is correct. Only `plan.md`'s own prose is now stale, since Phase blocks are read-only during implementation and never got updated.
- **Fix A ⭐ Recommended**: Leave `plan.md` as-is — a historical record of original intent, with the deviation explained in commit `d5c2590`'s message and the accurate mechanism living in `test-plan.md` §6.2b (the designated canonical doc for "how do I add a test like this").
  - Strength: Matches this project's own stated convention — plans are frozen intent, the cookbook is what future contributors actually read.
  - Tradeoff: A reader who opens only `plan.md` (skipping the cookbook and commit history) gets a mechanism that doesn't work.
  - Confidence: HIGH — cookbook accuracy was independently verified by the drift-detection agent.
  - Blind spot: None significant.
- **Fix B**: Add a short addendum note inline in `plan.md`'s Critical Implementation Details pointing to the actual mechanism and `test-plan.md` §6.2b.
  - Strength: Self-contained — no need to cross-reference commit history to understand what actually shipped.
  - Tradeoff: Edits a "read-only" Phase block after the fact, blurring the plan-as-historical-record convention this project otherwise follows.
  - Confidence: MEDIUM — reasonable either way; this is a convention question, not a correctness one.
  - Blind spot: Haven't checked whether other archived plans in this repo have precedent for post-hoc addenda.
- **Decision**: Applied Fix A — plan.md left as-is; commit d5c2590 and test-plan.md §6.2b are canonical.

### F2 — Cleanup in `afterAll` isn't guarded against partial `beforeAll` failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/cross-user-authorization.test.ts:84-87`
- **Detail**: The outer `afterAll` unconditionally calls `deleteTestUser` for both `userA` and `userB`. If `beforeAll` throws after creating `userA` but before `userB` is assigned (e.g. the second `createTestUser` call or the catalog-paint fetch fails), `afterAll` throws a `TypeError` on `userB.id`, masking the real root cause with a confusing secondary error. No real resource leaks (nothing to clean up if a user was never created), but it hurts debuggability of a failed run.
- **Fix**: Guard each cleanup call, e.g. `if (userA) await deleteTestUser(supabaseTestEnv, userA.id);` (same for `userB`).
- **Decision**: FIXED — switched to per-user try/catch instead of `if` guards (TypeScript's non-nullable typing flagged the guards as always-truthy; try/catch achieves the same isolation without fighting the type system). Verified: lint clean, full integration suite still 23/23 passing.

### F3 — `paints/[id].test.ts` doesn't reuse the shared-assertion-helper pattern

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/api/paints/[id].test.ts:27-31`
- **Detail**: `paints.test.ts` and `recipe.test.ts` both factor their 401/clean-error assertion into a shared helper (`expectUnauthorized`/`expectCleanError`), but `paints/[id].test.ts` inlines the same three assertion lines directly in its single `it` block instead.
- **Fix**: Extract the same `expectUnauthorized`-style helper for consistency, even with only one call site.
- **Decision**: FIXED — extracted `expectUnauthorized` helper, matching `paints.test.ts`'s pattern.

### F4 — DELETE cross-user test's `status` assertion isn't itself the security proof

- **Severity**: OBSERVATION
- **Dimension**: Success Criteria
- **Location**: `src/pages/api/cross-user-authorization.test.ts:106-107`
- **Detail**: `expect(response.status).toBe(200)` passes regardless of whether the cross-user delete attempt "succeeded" from the route's perspective (the route always returns 200 for a 0-row-match delete). The actual security proof is the follow-up `clientB` select two lines down confirming B's row is untouched. Correct test design, but a reader skimming only the status assertion could mistake it for the load-bearing check.
- **Fix**: Optional — a one-line comment above the status assertion noting "route always 200s regardless of match; real proof is below" would help future readers.
- **Decision**: FIXED — added the clarifying comment.

### F5 — Implicit sequential-order coupling in direct-DB describe blocks

- **Severity**: OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/cross-user-authorization.test.ts:114-152`, `:154-191`
- **Detail**: The `user_paints` and `recipes` direct-DB `describe` blocks share one seeded row per block across their `it` cases, relying on Vitest's default sequential-in-declaration-order execution rather than a `beforeEach` reset. Each test's own assertions re-check real row state (not just "no error"), so a regression would still be caught, but the suite would break if ever run with `concurrent: true`.
- **Fix**: No action needed now; worth a comment if the suite is ever made concurrent.
- **Decision**: SKIPPED — matches the finding's own assessment; no action needed now.

### F6 — Dangling cross-reference in CLAUDE.md's Guardrails section

- **Severity**: OBSERVATION
- **Dimension**: Scope Discipline
- **Location**: `CLAUDE.md:32`
- **Detail**: The Guardrails section still says "(Restated from the 10x-cli block's 'Production-access boundary' section.)" but the unrelated pending 10x-cli lesson-content regeneration (Module 1 → Module 3, already in the working tree before this session, restored via `git stash pop` after this plan's own CLAUDE.md commit) rewrote that block and removed the "Production-access boundary" section entirely. This is **not** an edit made by this plan — it's a pre-existing, unrelated pending change — but it now sits alongside this plan's own CLAUDE.md edit in the same file.
- **Fix**: Out of this plan's scope; flag for whoever commits the pending 10x-cli lesson-content regeneration.
- **Decision**: SKIPPED — out of this plan's scope, belongs to the unrelated pending change.

## Additional notes (not findings)

- `context/foundation/test-plan.md` §3's Phased Rollout row for this change still reads `change opened` rather than `complete`, even though `change.md` is now `implemented` and every Progress checkbox is `[x]`. This is the `/10x-test-plan` orchestrator's own bookkeeping (updated when the orchestrator is next invoked), not part of this plan's Phase 4 contract — no action needed from this review.
- Security scan found no hardcoded secrets, no logged credentials, and `.env.test.local` correctly gitignored and untracked.
- All automated success criteria re-verified live: `npm run test -- --project integration` (5 files, 23 tests, all passing against real local Supabase), `npm run lint` (clean on all touched files; 1915 pre-existing repo-wide CRLF errors unrelated), `npm run build` (passing).
