---
change_id: starter-branding-cleanup
title: Replace starter branding with 10xPaintMixer product identity
status: implementing
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

Roadmap: `context/foundation/roadmap.md` — M-2, slice S-02.
Source: user-supplied scope anchors MS-01, MS-03 (milestone charter), not PRD-traced.

Scope settled during planning:
- Dev-facing metadata (README.md title, package.json "name") updated alongside
  the user-visible surfaces MS-01/MS-03 name.
- Welcome.astro's 3 generic feature cards rewritten with paint-mixing-relevant
  copy (not literally named by MS-01, but left inconsistent otherwise).
- MS-01/MS-03 wording lightly polished (capitalization/punctuation) to match
  existing sentence-case UI copy, meaning preserved exactly.
- Automated repo-wide grep gate added to verify no starter strings remain
  outside `.scaffold` siblings (which intentionally keep the pristine starter
  copy for diffing per `/10x-bootstrapper`).
