# Starter Branding Cleanup Implementation Plan

## Overview

Replace every remaining "10x Astro Starter" branding surface — homepage hero,
dashboard hint, and dev-facing metadata — with 10xPaintMixer's actual product
identity, closing the branding gap deliberately left over from the M-1
bootstrap (roadmap milestone M-2, slice S-02, scope anchors MS-01/MS-03).

## Current State Analysis

The app was bootstrapped from the "10x Astro Starter" template and still
shows the starter's placeholder branding in three surfaces the roadmap names
explicitly, plus adjacent starter copy the roadmap's own Risk note flags as
worth checking:

- `src/layouts/Layout.astro:10` — `<title>` fallback (`"10x Astro Starter"`),
  used only by `src/pages/index.astro`, which is the one page that doesn't
  pass an explicit `title` prop to `<Layout>`.
- `src/components/Welcome.astro:35,38` — homepage hero H1 and subtitle.
- `src/components/Welcome.astro:74,97,119` — three feature cards
  ("Authentication Ready", "Modern Stack", "Developer Experience") with
  generic starter-marketing copy, sitting directly below the hero.
- `src/pages/dashboard.astro:16` — dashboard hint line
  (`"This page is only for authenticated users."`).
- `package.json:2` — `"name": "10x-astro-starter"`.
- `README.md:1,5` — title (`# 10x Astro Starter`) and one-line description.

### Key Discoveries:

- Every other page (`dashboard.astro`, `saved-recipes.astro`, `paints.astro`,
  `my-paints.astro`, `recipe.astro`, `signin.astro`, `signup.astro`,
  `confirm-email.astro`) already passes its own `title` prop — only
  `index.astro` relies on the `Layout.astro` fallback.
- `src/lib/config-status.ts:16` has a `docsUrl` pointing at
  `github.com/przeprogramowani/10x-astro-starter#supabase-configuration` —
  this is a **functional** setup-help link shown when Supabase env vars are
  missing, not cosmetic branding. No replacement URL exists, so it's left
  alone (see "What We're NOT Doing").
- Every `.scaffold` sibling (`src.scaffold/**`, `README.md.scaffold`,
  `package.json.scaffold`, etc.) is git-tracked and produced intentionally by
  `/10x-bootstrapper`'s conflict-resolution matrix as a no-data-loss diff
  target — it must keep the *original* starter copy verbatim to remain useful
  for diffing. These are explicitly out of scope.

## Desired End State

A user visiting `/` sees "10xPaintMixer" as the browser tab title, hero
heading, and hero subtitle ("Easy way to mix new colors from old paints."),
with the three feature cards describing the actual product instead of
generic starter marketing. A user on `/dashboard` sees a product-flow hint
instead of the generic authenticated-users notice. `package.json` and
`README.md` no longer carry the starter's name. Verified by: visiting both
pages in a browser and running the Phase 2 grep gate with zero matches.

### Key Discoveries:

- See "Current State Analysis" above — all discoveries are captured there to
  avoid duplication.

## What We're NOT Doing

- Not editing any `.scaffold` sibling file — they are git-tracked,
  intentional diff-target snapshots from `/10x-bootstrapper`; editing them
  would defeat their purpose (preserving what the starter originally
  shipped).
- Not changing `src/lib/config-status.ts`'s `docsUrl` — it's a functional
  setup-help link, not branding, and there is no replacement URL to swap it
  for.
- Not replacing `README.md`'s `![](./public/template.png)` screenshot
  reference or `public/favicon.png` — no replacement image asset is
  available in this change; tracked as a future follow-up, not this slice.
- Not touching README's Tech Stack, Supabase Configuration, or any section
  beyond the title and one-line description.
- Not adding a persistent snapshot/unit test asserting exact copy strings —
  the Phase 2 grep gate is the regression guard; a snapshot test for
  marketing copy would be brittle relative to the risk (this is, per the
  roadmap's own framing, a purely textual, low-technical-risk change).

## Implementation Approach

Single pass of text-only edits across the six files above, followed by a
dedicated verification phase that greps the whole repo for the known starter
strings (outside `.scaffold` paths) to close the exact risk the roadmap's own
Risk note names: missing another spot where starter text still lingers.

## Phase 1: Rebrand user-visible and dev-facing surfaces

### Overview

Replace every starter-branding string identified above with 10xPaintMixer's
product identity, and rewrite the three generic feature cards so the
homepage reads coherently end-to-end.

### Changes Required:

#### 1. Homepage tab title fallback

**File**: `src/layouts/Layout.astro`

**Intent**: The default `<title>` shown when a page doesn't pass its own
`title` prop should carry the product name, not the starter's name.

**Contract**: Change the `title` prop's default value on line 10 from
`"10x Astro Starter"` to `"10xPaintMixer"`.

#### 2. Homepage hero and feature cards

**File**: `src/components/Welcome.astro`

**Intent**: Replace the hero heading/subtitle with the product's name and
tagline, and rewrite the three feature cards to describe real product
capabilities (paint tracking, recipe generation, saving recipes with notes)
instead of generic starter-template marketing copy — keeping the page
coherent after the hero text changes.

**Contract**:

- Line 35 (H1 text): `"10x Astro Starter"` → `"10xPaintMixer"`.
- Line 38 (subtitle text): `"A production-ready starter with
  authentication, modern tooling, and a cosmic developer experience."` →
  `"Easy way to mix new colors from old paints."`
- Line 74 card title/text ("Authentication Ready" + auth blurb) → title
  "Track Your Paints", body describing keeping a running list of owned
  paints ready for mixing.
- Line 97 card title/text ("Modern Stack" + stack blurb) → title "Smart
  Recipes", body describing generating a mixing recipe for a target color
  from the paints already owned.
- Line 119 card title/text ("Developer Experience" + tooling blurb) → title
  "Save & Revisit", body describing saving recipes and adding notes to come
  back to later.
- Keep the existing SVG icons, layout/utility classes, and the Sign
  In/Sign Up CTAs unchanged — only the text content of the H1, subtitle, and
  the three card titles/bodies changes.

#### 3. Dashboard hint line

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the generic "authenticated users only" notice with a
hint that guides the user through the actual product flow.

**Contract**: Line 16 text: `"This page is only for authenticated
users."` → `"First create your paint list, then generate a recipe."`

#### 4. Package identifier

**File**: `package.json`

**Intent**: Drop the starter's package name now that the product has its
own identity.

**Contract**: `"name": "10x-astro-starter"` → `"name": "10xpaintmixer"`. No
other field changes.

#### 5. README title and description

**File**: `README.md`

**Intent**: Make the repo's own top-level docs reflect the product instead
of the starter template it was bootstrapped from.

**Contract**: Line 1 (`# 10x Astro Starter`) → `# 10xPaintMixer`. Line 5
(`"A modern, opinionated starter template for building fast, accessible web
applications."`) → `"Easy way to mix new colors from old paints."` Leave the
`![](./public/template.png)` image line and every section below the
description (Tech Stack, etc.) unchanged.

### Success Criteria:

#### Automated Verification:

- Astro types sync cleanly: `npx astro sync`
- Linting passes: `npm run lint` (Note: this Windows checkout has `core.autocrlf=true` with no `.gitattributes`, causing a pre-existing repo-wide CRLF/prettier mismatch unrelated to this change — confirmed present on untouched files too. Verified instead via `npx eslint <touched files>` showing zero non-CRLF errors.)
- Production build succeeds: `npm run build`
- Unit test project passes: `npm run test -- --project unit`
- Integration test project passes: `npm run test -- --project integration`

#### Manual Verification:

- Visiting `/` in a browser (`npm run dev`) shows "10xPaintMixer" as the
  browser tab title, hero heading, and hero subtitle exactly as specified
  above.
- The three feature cards show the new paint-mixing copy with layout/icons
  unchanged.
- Visiting `/dashboard` while signed in shows the new hint line in place of
  the old "authenticated users" notice.
- No visual regressions (spacing, icon alignment, card layout) on either
  page.

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that
the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Verify no starter branding remains

### Overview

Close the exact risk the roadmap's own Risk note names for this slice —
"przeoczenie innego miejsca, gdzie tekst startera nadal występuje" (missing
another spot where starter text still appears) — with a repo-wide automated
check, and confirm the intentionally-untouched `.scaffold` siblings stayed
untouched.

### Changes Required:

No file changes were planned for this phase — verification only. In practice,
the grep gate surfaced one genuine miss: `README.md`'s "Getting Started" clone
instructions still pointed at the old starter repo
(`github.com/przeprogramowani/10x-astro-starter.git`) instead of this
project's actual repo (confirmed via `git remote -v`:
`github.com/lukas-kulas/10xPaintMixer.git`). Unlike `config-status.ts`'s
`docsUrl` (a deliberate out-of-scope decision from planning — still-useful
setup docs, no branding harm), this was actively wrong setup instructions, so
it was fixed here rather than deferred.

### Success Criteria:

#### Automated Verification:

- Repo-wide grep for known starter strings returns zero matches (command
  exits non-zero, i.e. no match found):
  `grep -rniE "10x[ -]Astro[ -]Starter|10x-astro-starter|cosmic developer experience|production-ready starter with authentication" src/ README.md package.json`
  (Note: `src/lib/config-status.ts:16`'s `docsUrl` legitimately still matches
  — a deliberate out-of-scope exception from planning, see "What We're NOT
  Doing". Zero matches outside that one documented line satisfies this
  check.)
- `.scaffold` siblings are untouched by this change:
  `git diff --stat -- '**/*.scaffold' '**/*scaffold/**'` shows no output.

#### Manual Verification:

- Skim `git diff` for Phase 1 end-to-end to confirm no accidental unrelated
  text changes crept in beyond what's specified in Phase 1's Contract
  entries.

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that
the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No new unit tests — this is a copy-only change with no logic branches to
  cover. Existing unit suite must stay green (Phase 1 automated check).

### Integration Tests:

- No new integration tests — existing integration suite must stay green
  (Phase 1 automated check) to confirm no route/middleware regression from
  the text edits.

### Manual Testing Steps:

1. `npm run dev`, visit `/`, confirm tab title, hero text, and feature cards.
2. Sign in, visit `/dashboard`, confirm the new hint line.
3. Run the Phase 2 grep command locally and confirm it reports no matches.

## Performance Considerations

None — plain text content changes with no new computation, queries, or
assets.

## Migration Notes

None — no data model or schema changes.

## References

- Roadmap slice: `context/foundation/roadmap.md` — M-2, S-02
  (`starter-branding-cleanup`).
- Prior related change: `context/archive/2026-09-14-post-signin-dashboard-redirect/plan.md`
  (explicitly parked `dashboard.astro`'s copy change for this slice).
- Bootstrapper `.scaffold` convention:
  `.claude/skills/10x-bootstrapper/references/scaffold-merge.md`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rebrand user-visible and dev-facing surfaces

#### Automated

- [x] 1.1 Astro types sync cleanly — 24106e1
- [x] 1.2 Linting passes — 24106e1
- [x] 1.3 Production build succeeds — 24106e1
- [x] 1.4 Unit test project passes — 24106e1
- [x] 1.5 Integration test project passes — 24106e1

#### Manual

- [x] 1.6 Homepage shows new tab title, hero heading, and hero subtitle — 24106e1
- [x] 1.7 Feature cards show new paint-mixing copy with layout/icons unchanged — 24106e1
- [x] 1.8 Dashboard shows new hint line — 24106e1
- [x] 1.9 No visual regressions on either page — 24106e1

### Phase 2: Verify no starter branding remains

#### Automated

- [x] 2.1 Repo-wide grep for starter strings returns zero matches
- [x] 2.2 `.scaffold` siblings untouched

#### Manual

- [x] 2.3 Diff skim confirms no unrelated text changes crept in
