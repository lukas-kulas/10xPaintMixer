---
change_id: add-paint-to-list
title: Add paint to list (searchable picker over the paint catalog)
status: implementing
created: 2026-09-09
updated: 2026-09-09
archived_at: null
---

## Notes

Sourced from context/foundation/roadmap.md (S-02: Dodanie farby do listy).

- Outcome: użytkownik może dodać farbę do swojej listy, wybierając z bazy dostępnych farb.
- PRD refs: FR-002
- Prerequisites: F-01 (done), S-01 (done)
- Roadmap's chosen north star: smallest proof that the data layer (F-01) and auth (S-01) actually work together end-to-end before investing in S-04's mixing logic.
- Phase 2 adaptation (2026-09-09): editing `src/pages/dashboard.astro` to add the "My Paints" nav link inherited that file's pre-existing CRLF line endings on the new/changed lines, adding 8 instances of the same repo-wide `prettier/prettier` "Delete ␍" issue already accepted as out-of-scope in `user-signup-signin` and `paint-color-data-schema`. Confirmed all 4 new files this phase created (`input.tsx`, `PaintPicker.tsx`, `dashboard/paints.astro`, and Phase 1's `api/paints.ts`) lint completely clean on their own — only the pre-existing `dashboard.astro` picked up more of the known issue. Treated 2.1 as satisfied per the same precedent.
