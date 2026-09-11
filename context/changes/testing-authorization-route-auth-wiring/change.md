---
change_id: testing-authorization-route-auth-wiring
title: Authorization & route-auth wiring
status: implemented
created: 2026-09-11
updated: 2026-09-11
archived_at: null
---

## Notes

Rollout Phase 2 of `context/foundation/test-plan.md` §3. Lock down cross-user
access and the self-enforced 401 pattern across all `/api/*` routes. Covers
risks #2, #3 from the test plan's §2 Risk Map. Test types planned:
integration (two seeded users).

Risk response intent:
- #2: prove every handler under `/api/*`, for every HTTP method it exports,
  rejects an unauthenticated request with 401 before touching Supabase;
  challenge the assumption that `PROTECTED_ROUTES` already covers this (it
  explicitly excludes `/api/*`, per CLAUDE.md) and that testing one route
  stands in for the whole pattern.
- #3: prove that with two real seeded users, user A cannot read, insert-as,
  update, or delete user B's `user_paints`/`recipes` rows via any route, even
  supplying B's row id directly; challenge the assumption that RLS alone is
  sufficient / app-level ownership checks are redundant, and avoid testing
  against a mocked Supabase client, which would miss the real RLS boundary.
