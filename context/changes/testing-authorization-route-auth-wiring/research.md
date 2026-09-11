---
date: 2026-09-11T10:00:37+02:00
researcher: Claude Sonnet 5
git_commit: 8310650f1915487cad57f2312a4fbe4181c4d6bc
branch: master
repository: 10x-astro-starter
topic: "Authorization & route-auth wiring — self-enforced 401 checks and cross-user RLS/IDOR protection for /api/* routes"
tags: [research, codebase, authorization, rls, api-routes, supabase, testing]
status: complete
last_updated: 2026-09-11
last_updated_by: Claude Sonnet 5
---

# Research: Authorization & route-auth wiring (test-plan Phase 2)

**Date**: 2026-09-11T10:00:37+02:00
**Researcher**: Claude Sonnet 5
**Git Commit**: 8310650f1915487cad57f2312a4fbe4181c4d6bc
**Branch**: master
**Repository**: 10x-astro-starter

## Research Question

Rollout Phase 2 of `context/foundation/test-plan.md` §3 ("Authorization & route-auth wiring"). Ground risks #2 and #3 from the test plan's risk map against current code:

- **#2**: Does every handler under `/api/*`, for every HTTP method it exports, reject an unauthenticated request with 401 before touching Supabase? Challenge the assumption that `PROTECTED_ROUTES` already covers this, and that testing one route stands in for the whole pattern.
- **#3**: With two real seeded users, can user A read, insert-as, update, or delete user B's `user_paints`/`recipes` rows via any route — even supplying B's row id directly? Challenge the assumption that RLS alone is sufficient / that app-level ownership checks are redundant. Avoid testing against a mocked Supabase client, which would miss the real RLS boundary.

## Summary

Both risks are real gaps in current test coverage, not settled non-issues — but the underlying *implementation* is in reasonably good shape for both:

- **Risk #2**: `PROTECTED_ROUTES` in `src/middleware.ts` is `["/dashboard"]` only, prefix-matched — it does **not** cover `/api/*`, confirming the challenge. Every data-touching API route (`paints.ts` GET/POST, `paints/[id].ts` DELETE, `recipe.ts` POST) does hand-roll an inline `if (!user) return json({ error: "Unauthorized" }, 401)` check, consistently shaped, before any Supabase table query — but there is **no shared helper**, so this is unverified-by-test per-file duplication, and the three auth-flow routes (`signin`/`signup`/`signout`) legitimately have no such check (they *are* the auth entry points) and respond via redirect, not JSON, on failure. **No existing test exercises the 401 path at all** — `recipe.test.ts` always injects a fake authenticated user.
- **Risk #3**: RLS is real, enabled, and correctly scoped on both `user_paints` and `recipes` (`auth.uid() = user_id`, with `WITH CHECK` on writes; `recipes` deliberately has no UPDATE/DELETE policies at all — append-only by design). No service-role/admin Supabase client exists anywhere in the app — every route uses the same request-scoped, cookie-bound, anon-key client, so RLS is the real, load-bearing boundary, not bypassed anywhere. App-level `.eq("user_id", ...)` filters exist as defense-in-depth on the DELETE route but are not a universal convention — `recipe.ts`'s `target_paint_id` lookup is (correctly) unscoped because `paints` is shared catalog data, not per-user data. **The current RLS "proof" is a one-time manual check from the archived F-01 slice, never automated, and the only integration test that touches Supabase mocks the HTTP edge — so it structurally cannot detect an RLS regression.** This is exactly the anti-pattern test-plan.md §2 warns against.
- CLAUDE.md's claim "Supabase provides auth only — no app database tables" is **stale/false** — two migrations (2026-09-09, 2026-09-10) added five real tables (`brands`, `paint_types`, `paints`, `user_paints`, `recipes`) with RLS. Worth flagging for a CLAUDE.md fix, though that's outside this phase's scope.
- Phase 1's test infrastructure (Vitest `test.projects`, `@cloudflare/vitest-pool-workers`, `@msw/cloudflare` for mocking Supabase's HTTP edge, `astro:env/server` mock, direct-handler-invocation pattern) is the right foundation to build on for risk #2, but is explicitly *wrong* for risk #3's real-RLS-boundary requirement — that needs a Supabase client with two really-seeded users, not `@msw/cloudflare`.

## Detailed Findings

### Risk #2 — Self-enforced 401 across `/api/*`

**`src/middleware.ts`** (full contents relevant here):
```
const PROTECTED_ROUTES = ["/dashboard"];
...
if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }
}
```
- `PROTECTED_ROUTES` is `["/dashboard"]` — one entry, prefix-matched via `startsWith`. `/api/*` is not in it and never redirect-protected.
- The middleware *does* unconditionally populate `context.locals.user` (via `supabase.auth.getUser()`) on every request, including API requests — so every route handler has `context.locals.user` available, it just isn't enforced centrally.

**Per-route inventory** (every file under `src/pages/api/**`):

| Route file | Methods | Self-checks `locals.user`? | Unauthorized response | Client-supplied id in a query |
|---|---|---|---|---|
| `src/pages/api/auth/signin.ts` | POST | no (is the login entry point) | redirect w/ `?error=` | none |
| `src/pages/api/auth/signout.ts` | POST | no | redirect to `/` | none |
| `src/pages/api/auth/signup.ts` | POST | no (registration) | redirect w/ `?error=` | none |
| `src/pages/api/paints.ts` | GET, POST | **yes**, before the per-user query/upsert | JSON `{ error: "Unauthorized" }`, 401 | POST body `paint_id` → `.upsert({user_id, paint_id}, ...)` — user-scoped |
| `src/pages/api/paints/[id].ts` | DELETE | **yes**, before the delete | JSON `{ error: "Unauthorized" }`, 401 | URL param `id` → `.eq("user_id", user.id).eq("paint_id", paintId)` — dual-scoped |
| `src/pages/api/recipe.ts` | POST | **yes**, before rate-limit check and any table query | JSON `{ error: "Unauthorized" }`, 401 | body `target_paint_id` → `.eq("id", targetPaintId)` on shared `paints` catalog (correctly unscoped by user_id — it's shared reference data) |

- All three self-checking routes use the **identical inline pattern** (`const user = context.locals.user; if (!user) return json({ error: "Unauthorized" }, 401);`) — quoted at `src/pages/api/paints.ts:32-35` / `:80-83`, `src/pages/api/paints/[id].ts:17-20`, `src/pages/api/recipe.ts:56-59`. No shared `requireAuth`/`withAuth` helper exists anywhere (grepped, zero matches) — each file hand-repeats the three lines.
- `paints.ts`'s GET handler runs its public-catalog query (all `paints`) *before* this check regardless of auth (that query is intentionally public), then the owned-paints query after — so the check position is correct but route-specific reasoning, not a blanket guard at the top of the function.
- No test in the repo currently exercises the unauthenticated/401 path on any route — `src/pages/api/recipe.test.ts` always injects `locals: { user: fakeUser() }`.
- This exact gap (middleware doesn't cover `/api/*`, every route must self-enforce) is a **recurring, previously-documented pattern** across at least 3 archived slice plans (`user-signup-signin`, `add-paint-to-list`, `view-and-remove-paints`) — it is a known, intentional convention, not a surprise. What's new/unverified is that no automated test asserts every route actually implements it, for every method it exports.

**Supabase client — no bypass path**: `src/lib/supabase.ts`'s `createClient(requestHeaders, cookies)` is the **only** client factory in the codebase. It's built with `@supabase/ssr`'s `createServerClient`, using the anon key (`SUPABASE_KEY` from `astro:env/server`) and request cookies — every single call site (`middleware.ts`, all API routes) uses this same request-scoped, RLS-respecting client. Grep for `service_role` / `SUPABASE_SERVICE` / admin-client patterns across `src/` returned zero matches.

### Risk #3 — RLS / cross-user access on `user_paints` and `recipes`

**Exact current RLS policies** (from the two live migrations):

`supabase/migrations/20260909192830_create_paint_catalog_schema.sql` — `user_paints` (lines 75-110):
```sql
alter table user_paints enable row level security;

create policy "Users can read their own paints" on user_paints
  for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert their own paints" on user_paints
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own paints" on user_paints
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own paints" on user_paints
  for delete to authenticated using (auth.uid() = user_id);
```

`supabase/migrations/20260910120000_create_recipes_schema.sql` — `recipes` (lines 6-30):
```sql
alter table recipes enable row level security;

create policy "Users can read their own recipes" on recipes
  for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert their own recipes" on recipes
  for insert to authenticated with check (auth.uid() = user_id);
-- No update/delete policies: recipes are append-only by design (comment at file head)
```

Catalog tables (`brands`, `paint_types`, `paints`) are RLS-enabled with authenticated-read-only policies, `using (true)` — no client write policy at all (writes happen only via migration/seed as the Postgres owner).

- Both per-user tables have RLS enabled with a complete, correctly-scoped policy for every operation they support. `recipes` lacking UPDATE/DELETE policies is a deliberate append-only design (stated in the migration's header comment), functionally equivalent to deny-all for those ops for every user, not a gap.
- **No service-role/admin client exists anywhere in the app** (confirmed independently by both the route-mapping agent and the RLS agent) — every route reaches Postgres through the anon-key, cookie-bound, RLS-respecting client. RLS is therefore the actual, load-bearing authorization boundary for `user_paints`/`recipes`, not a redundant backstop.
- App-level ownership filtering is inconsistent-but-correct, not a blanket convention: `paints/[id].ts`'s DELETE dual-scopes by both `user_id` (session-derived) and the client-supplied `paint_id`; `paints.ts`'s POST scopes its upsert by session-derived `user_id`; `recipe.ts`'s `target_paint_id` lookup against `paints` is correctly *un*scoped by user, since `paints` is shared catalog data, not per-user data. There's no case in the current code where a mutating query on `user_paints`/`recipes` omits the `user_id` filter and relies on RLS alone — but this has never been verified with a real second user, only reasoned about statically.
- **The only existing "proof" that RLS actually works is a one-time, manual, local check performed during the archived F-01 slice** (two manually-created test accounts, checked once, never automated). Every subsequent slice (`add-paint-to-list`, `view-and-remove-paints`) explicitly deferred to that one check rather than re-verifying. Policies could have drifted since (they haven't, per the migration read above, but nothing currently catches it if they did).
- **The current integration test suite cannot detect an RLS regression by construction**: `src/pages/api/recipe.test.ts` uses `@msw/cloudflare` to intercept Supabase's outbound HTTP calls and return canned JSON — Postgres and its RLS policies are never actually invoked. This is precisely the anti-pattern test-plan.md §2's Risk #3 row calls out: *"Testing ownership against a mocked/stubbed Supabase client — misses the real RLS boundary this risk is about."* A real two-seeded-user test needs to hit a real (likely local, via Supabase CLI) Postgres instance with RLS actually enforced — `@msw/cloudflare` is the wrong tool for this specific risk, even though it's the right tool for risk #2's unauthenticated-request scenarios and for risk #4/#6 (already covered in Phase 1).

**PRD grounding** (`context/foundation/prd.md`):
- Access Control section: "every logged-in user sees and manages only their own owned-paints list and their own generated recipes" (flat single-role model, no admin roles in MVP).
- Non-Goals: "no sharing of paint lists between users — each user's data is private and separate."

## Code References

- `src/middleware.ts` — `PROTECTED_ROUTES = ["/dashboard"]`, prefix match via `startsWith`; unconditionally populates `context.locals.user` for every request including `/api/*`.
- `src/lib/supabase.ts` — sole client factory, request-scoped `createServerClient` via `@supabase/ssr`, anon key from `astro:env/server`; no admin/service-role variant exists.
- `src/pages/api/auth/signin.ts`, `signup.ts`, `signout.ts` — no `locals.user` self-check (by design, they are the auth entry points); failure responses are redirects with `?error=`, not JSON.
- `src/pages/api/paints.ts:32-35,80-83` — inline `Unauthorized` 401 check before owned-paints query / upsert.
- `src/pages/api/paints/[id].ts:17-20,27` — inline 401 check; DELETE dual-scoped by `user_id` (session) and `paint_id` (client-supplied).
- `src/pages/api/recipe.ts:56-59,72-77,89,117` — inline 401 check before rate-limit and table queries; `target_paint_id` lookup against shared `paints` catalog (correctly unscoped); owned-paints query and `recipes` insert correctly scoped by `user.id`.
- `src/pages/api/recipe.test.ts` — existing integration test; always injects an authenticated fake user via `locals.user`; never exercises the 401 path; mocks Supabase's HTTP edge via `@msw/cloudflare`, so RLS is never actually invoked.
- `supabase/migrations/20260909192830_create_paint_catalog_schema.sql:75-110` — `user_paints` table + full CRUD RLS policies (`auth.uid() = user_id`).
- `supabase/migrations/20260910120000_create_recipes_schema.sql:6-30` — `recipes` table + SELECT/INSERT-only RLS policies (append-only by design).
- `supabase/seed.sql` — catalog reference data only (`brands`/`paint_types`/`paints`); no `auth.users` rows, no `user_paints`/`recipes` fixtures — Phase 2 will need its own seeded test users.
- `vitest.config.ts` — `test.projects` split: `unit` (plain Node) vs. `integration` (`@cloudflare/vitest-pool-workers`'s `cloudflareTest()`).

## Architecture Insights

- **Convention, not framework, enforces `/api/*` auth.** There is no route-level middleware guard and no shared helper — every data-touching handler repeats the same three-line check. This is intentional per prior archived plans but means test coverage must be per-route, per-method; a new route added later is not automatically covered by "the pattern" being tested once, which is exactly the anti-pattern test-plan.md §2 warns against.
- **RLS is the real authorization boundary, app-level filters are defense-in-depth.** Because no service-role client exists, every query the app issues is already subject to RLS. The app-level `user_id` filters that do exist are a second line of defense (and produce cleaner error UX per `add-paint-to-list`'s plan rationale — RLS-denied inserts return a confusing Postgres error, not a clean 401/403), not a substitute for RLS.
- **Two genuinely different test techniques are needed for the two risks in this phase.** Risk #2 (401-before-Supabase) is well-served by Phase 1's existing pattern: direct handler invocation + `@msw/cloudflare` mocking Supabase's HTTP edge, asserting the check fires *before* any mocked network call is registered/needed. Risk #3 (real RLS boundary) requires the opposite — a real Postgres/Supabase instance with two actually-seeded users and RLS actually enabled, not the HTTP-mock approach. Phase 2's plan should not try to force both risks through one test technique.
- **`recipes`' lack of UPDATE/DELETE policies is a deliberate design choice** (append-only), not an oversight — a test asserting "user cannot update/delete any recipe, including their own" would be asserting intended behavior, not a bug.

## Historical Context (from prior changes)

- `context/archive/2026-09-09-paint-color-data-schema/plan.md:78` — original RLS contract design for `user_paints` (matches current migration exactly); `:83` — top-risk note explaining why RLS was sequenced first (every later slice inherits its correctness or its bugs); `:134-138` (Phase 3) — the one-time manual two-account RLS verification that all later slices have since relied on without re-checking.
- `context/archive/2026-09-10-generate-color-recipe/plan.md:71` — `recipes` table mirrors `user_paints`' RLS shape, append-only.
- `context/changes/testing-critical-path-guardrail-coverage/` (Phase 1, implemented, `status: impl_reviewed`) — built the Vitest + `@cloudflare/vitest-pool-workers` + `@msw/cloudflare` infrastructure this phase will partly reuse (for risk #2) and partly need to diverge from (for risk #3, which needs real Postgres, not HTTP mocking). Its plan.md explicitly deferred risks #2/#3 to "Rollout Phase 2, a separate change." Its impl-review documented an intentional non-fix: `recipe.ts` has no try/catch around the engine call/insert (out of scope for this testing lesson, not this phase's concern either).
- `context/archive/2026-09-09-add-paint-to-list/plan.md:45` — explains concretely why the self-enforced 401 check matters even with RLS present: an unauthenticated insert attempt without the check would surface a confusing RLS-rejection error instead of a clean 401.
- `context/archive/2026-09-10-view-and-remove-paints/reviews/impl-review.md:89` — prior security review verified the DELETE route's dual `user_id`+`paint_id` filter as "genuine defense-in-depth," establishing (informally) the convention referenced above.
- `context/archive/2026-09-10-view-and-remove-paints/plan-brief.md:60` — explicitly relies on F-01's one-time RLS check rather than re-testing — the exact assumption test-plan.md §2's Risk #3 tells this phase to challenge rather than inherit.
- `context/foundation/test-plan.md` §2 (Risk Response Guidance rows for #2 and #3) — already prescribes the "must challenge" framing and anti-patterns to avoid, quoted in the Summary above; §4 stack table's `fetchMock` reference is superseded by `@msw/cloudflare` per §6.6's correction note.

## Related Research

- `context/changes/testing-critical-path-guardrail-coverage/research.md` and `plan.md` — Phase 1's research/plan, source of the current test infrastructure this phase partially reuses.
- `context/foundation/test-plan.md` — the governing risk map and rollout table for this and all other phases.

## Open Questions

- **How to seed two real test users for the RLS integration suite.** No fixture/seed mechanism for `auth.users` + `user_paints`/`recipes` rows exists yet (`supabase/seed.sql` is catalog-only). The plan phase needs to decide: local Supabase CLI instance with `supabase.auth.admin.createUser()` in a test `beforeAll`, vs. some other seeding approach — and how that interacts with `@cloudflare/vitest-pool-workers`' Miniflare sandbox (does it have real network access to a local Supabase instance, or does this need to run outside `workerd`?). This is an implementation-strategy question for `/10x-plan`, not something this research resolves.
- **CLAUDE.md's "no app database tables" claim is stale** and contradicts the live migrations. Not this phase's job to fix, but worth flagging to the user/team since it could mislead a future agent reading CLAUDE.md.
- Should the eventual plan also formalize a shared auth-check helper (`requireAuth`) to close the "no shared helper, hand-repeated per route" gap structurally, or is testing sufficient without refactoring the routes? Test-plan.md's lesson boundaries say this phase is about *testing*, not refactoring — leaning toward: test the current per-route checks as-is, note the duplication as an observation, don't refactor unless the plan phase decides otherwise.
