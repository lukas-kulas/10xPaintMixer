---
change_id: paint-color-data-schema
title: Paint and color catalog data schema (brands, types, colors, paints, user_paints)
status: archived
created: 2026-09-09
updated: 2026-09-09
archived_at: 2026-09-09T21:06:26Z
---

## Notes

Sourced from context/foundation/roadmap.md (F-01: Schemat danych farb i kolorów).

- Outcome: (foundation) Supabase schema for a paint catalog, color catalog, and RLS-scoped user paint list, seeded with starter data.
- PRD refs: FR-002, FR-003, FR-004, FR-005, Access Control
- Prerequisites: — · Unlocks: S-02, S-03, S-04
- Seed source: `context/changes/paint-color-data-schema/paints.csv.csv` (210 Army Painter paints — Type, Name, HEX, RGB, R, G, B columns; user-supplied 2026-09-09).
- Phase 1 adaptation (2026-09-09): `npm run lint` fails repo-wide with 1942 pre-existing CRLF (`prettier/prettier`) errors — same known issue documented in the archived `user-signup-signin` change (`core.autocrlf=true`, no `.gitattributes`, plus a tracked `src.scaffold/` duplicate). Confirmed none of the failing files belong to this change (only pre-existing `src/`/`src.scaffold/` files, nothing under `supabase/` or `context/changes/paint-color-data-schema/`). Treated 1.2 as satisfied per the same precedent; repo-wide fix stays out of scope.
- Phase 1 design change (2026-09-09): dropped the planned `colors` table. Once seeded it was a byte-for-byte duplicate of `paints` (same 210 rows, no dedup collapse) with no FK to anything — user flagged this during manual verification. Target-color selection (FR-005/S-04) now queries `paints` directly. Final schema is 4 tables (`brands`, `paint_types`, `paints`, `user_paints`), not 5. `plan.md` and `plan-brief.md` updated to match.
