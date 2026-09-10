---
change_id: generate-color-recipe
title: Generate color recipe from owned paints
status: archived
created: 2026-09-10
updated: 2026-09-10
archived_at: 2026-09-10T20:26:26Z
---

## Notes

Implements S-04 from `context/foundation/roadmap.md`: user picks a target color from the paint catalog and gets a generated recipe (ratios) to mix it from their owned paints (`user_paints`). PRD refs: FR-005, US-01.

Prior art already in this folder before `change.md` existed:
- `srs-review-session.md` — library-selection research (chose `spectral.js` for Kubelka-Munk pigment mixing + `color-diff` for ΔE matching)
- `spectral-js-api-reference.md` — detailed API reference for `spectral.js`
- `research.md` — codebase compatibility research (this change's `/10x-research` output)
