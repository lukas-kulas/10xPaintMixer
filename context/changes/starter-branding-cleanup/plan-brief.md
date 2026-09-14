# Starter Branding Cleanup — Plan Brief

> Full plan: `context/changes/starter-branding-cleanup/plan.md`

## What & Why

10xPaintMixer was bootstrapped from the "10x Astro Starter" template and
still shows the starter's placeholder branding on the homepage and
dashboard. Roadmap milestone M-2 (scope anchors MS-01, MS-03) calls for
replacing it with the product's actual name and a product-flow hint, now
that the core generate/save flow works on production.

## Starting Point

Three surfaces still carry starter branding: the homepage tab title +
hero heading/subtitle ("10x Astro Starter" / "A production-ready starter
with authentication, modern tooling, and a cosmic developer experience."),
the dashboard's generic "This page is only for authenticated users." hint,
and dev-facing metadata (`package.json`'s `"name"`, `README.md`'s title).
Every other page already sets its own `<title>`; only the homepage relies
on `Layout.astro`'s fallback.

## Desired End State

A visitor to `/` sees "10xPaintMixer" as the tab title, hero heading, and
tagline ("Easy way to mix new colors from old paints."), with three feature
cards describing the actual product (tracking paints, generating recipes,
saving recipes with notes) instead of generic starter marketing. A
signed-in user on `/dashboard` sees a hint guiding them through the real
product flow instead of a generic auth notice. `package.json` and
`README.md` no longer name the starter template.

## Key Decisions Made

| Decision                                    | Choice                                         | Why (1 sentence)                                                                 |
| -------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| Dev-facing metadata (README, package.json)  | Update both                                     | Closes the exact "other leftover spot" risk the roadmap's own Risk note names.   |
| Welcome.astro's 3 generic feature cards      | Rewrite with paint-mixing copy                  | Leaving generic starter marketing under a renamed paint-mixer headline would look broken. |
| MS-01/MS-03 wording fidelity                 | Light grammar/punctuation polish, meaning exact | Matches the app's existing sentence-case-with-period UI copy style.             |
| Verification thoroughness                   | Add automated repo-wide grep gate               | Directly closes the roadmap's named risk at near-zero cost.                     |
| Layout.astro `<title>` fallback format       | Product name only, no tagline                   | Matches MS-01's named string exactly; no tab-title format was specified.         |

## Scope

**In scope:**
- Homepage: tab title, hero H1/subtitle, 3 feature cards
- Dashboard: hint line
- `package.json` "name", `README.md` title + one-line description
- Automated grep gate verifying no starter strings remain outside `.scaffold` siblings

**Out of scope:**
- Any `.scaffold` sibling file (intentional pristine diff-target from `/10x-bootstrapper`)
- `config-status.ts`'s `docsUrl` (functional setup-help link, not branding)
- `README.md`'s screenshot image and `public/favicon.png` (no replacement asset available)
- Any README section beyond the title + description line

## Architecture / Approach

Pure text-content edits across 6 files (no logic, data, or API changes),
followed by a dedicated verification phase running a repo-wide grep for the
known starter strings to confirm nothing was missed.

## Phases at a Glance

| Phase                                      | What it delivers                                          | Key risk                                                        |
| ------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. Rebrand user-visible + dev-facing surfaces | New product copy on homepage, dashboard, README, package.json | Missing a spot — mitigated by Phase 2's grep gate                |
| 2. Verify no starter branding remains        | Automated proof no starter strings linger outside `.scaffold`  | False negative if grep pattern misses a casing variant           |

**Prerequisites:** None — all needed layers are already in place (per roadmap `## Baseline`).
**Estimated effort:** Single session, 2 phases, no architectural decisions.

## Open Risks & Assumptions

- The grep gate's pattern list (`10x Astro Starter`, `10x-astro-starter`,
  `cosmic developer experience`, `production-ready starter with
  authentication`) is assumed to cover every casing variant actually present
  in the repo — confirmed by research grep during planning, but a future
  addition using different wording wouldn't be caught.
- The new feature-card copy is invented (not literally specified by
  MS-01/MS-03) — reasonable paint-mixing-relevant text, but the exact wording
  is a planning-time judgment call, not a roadmap-mandated string.

## Success Criteria (Summary)

- Homepage tab title, hero, and feature cards show 10xPaintMixer branding and copy
- Dashboard shows the new product-flow hint
- Repo-wide grep for starter strings (outside `.scaffold`) returns zero matches
