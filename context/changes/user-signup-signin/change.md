---
change_id: user-signup-signin
title: User signup and signin (email + password)
status: implementing
created: 2026-09-08
updated: 2026-09-08
archived_at: null
---

## Notes

Sourced from context/foundation/roadmap.md (S-01: Rejestracja i logowanie).

- Outcome: użytkownik może założyć konto i zalogować się (email + hasło).
- PRD refs: FR-001
- Prerequisites: — · Parallel with: F-01
- Already live in production — full flow implemented end-to-end (`src/lib/supabase.ts`, `src/middleware.ts`, `src/pages/api/auth/*`, `src/pages/auth/*.astro`).
- Roadmap risk note: this entry exists only for FR-001 traceability, not because new implementation is needed. Roadmap's own recommendation: close it with a lightweight `/10x-plan` + `/10x-archive` pass rather than full planning from scratch.
- Phase 1 adaptation (2026-09-08): `npm run lint` fails repo-wide due to a pre-existing, unrelated issue — CRLF line endings (`core.autocrlf=true`, no `.gitattributes`) plus a tracked `src.scaffold/` duplicate of `src/`. Neither touches the auth flow being verified here; user decided to treat 1.2 as satisfied for this change and leave the repo-wide fix out of scope.
