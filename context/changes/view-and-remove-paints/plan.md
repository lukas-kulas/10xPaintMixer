# View and Remove Paints Implementation Plan

## Overview

Complete the paint-list CRUD started in S-02 by letting a user see only the paints they actually own and remove any of them. This is S-03 on the roadmap — grouped as view+remove because both act on the same `user_paints` entity and removal needs a real owned list to act on.

## Current State Analysis

- S-02 (`add-paint-to-list`, archived) shipped `GET`/`POST /api/paints` (`src/pages/api/paints.ts`) and a picker island (`src/components/paints/PaintPicker.tsx`) at `/dashboard/paints.astro`. `GET /api/paints` already returns every catalog paint with a per-row `owned: boolean` — no new read endpoint is needed for this slice, the new view just needs the `owned: true` subset of the same response.
- No `DELETE` handler exists anywhere in the API surface. `user_paints` already has an owner-scoped `DELETE` RLS policy (`auth.uid() = user_id`), created in F-01 and never exercised by application code yet (`context/archive/2026-09-09-paint-color-data-schema/plan.md:78`).
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]`, prefix-matched. Covers page navigation for any new `/dashboard/*` page automatically, but — same as S-02's finding — does **not** cover `/api/*`; a new API route must check `context.locals.user` itself.
- `src/pages/dashboard.astro` currently has one link labeled **"My Paints"** pointing at `/dashboard/paints` (the catalog/add page). That label is now wrong once a real "My Paints" (owned-only) page exists — it must be relabeled to "Add Paints" and a second link added for the new page, or the nav will have two differently-labeled destinations both plausibly called "my paints."
- `PaintPicker.tsx` establishes the UI conventions this slice reuses: a `Search` input (shadcn `Input`, already installed) + type-filter chip row, `ServerError` for inline errors, `lucide-react` icons (already a dependency — `Search`, `Check`, `Plus` are imported; `Trash2` is available from the same package without a new install), and optimistic local-state updates on a successful mutation instead of re-fetching.

## Desired End State

A user opens `/dashboard/my-paints` and sees only the paints they've added — searchable and type-filterable the same way the catalog page is — each with a swatch, name, type, and a Remove button. Clicking Remove takes the paint out of the list immediately (no reload); reloading the page confirms it's actually gone (proves the round-trip through the `DELETE` endpoint). A user who owns zero paints sees a message pointing them to Add Paints instead of a blank list. The dashboard links to both pages under correctly distinguishing labels.

### Key Discoveries:

- `GET /api/paints` (unchanged) already carries everything the new view needs — filtering to `owned: true` is a pure client-side operation, so this slice adds no new read endpoint.
- `user_paints`'s existing `DELETE` RLS policy means the new endpoint needs no migration — it's pure application code, exactly like S-02.
- `src/pages/api/paints.ts` (exact path `/api/paints`) and a new `src/pages/api/paints/[id].ts` (`/api/paints/:id`) coexist without route conflict in Astro's file-based routing — the dynamic segment only matches when a path segment follows `/paints`.

## What We're NOT Doing

- No remove affordance on the catalog/Add Paints page (`/dashboard/paints`) — per the user's explicit choice, remove lives only on the new dedicated My Paints page, keeping the add/remove split clean rather than overloading `PaintPicker`.
- No confirmation dialog before removing — immediate optimistic remove, matching S-02's instant-feedback add pattern; this is a fully reversible, low-stakes action (re-adding is one click on the Add Paints page).
- No new `GET` endpoint — the My Paints view reuses `GET /api/paints` and filters client-side.
- No shared/extracted filter hook between `PaintPicker` and the new component — the search+type-filter logic is ~15 lines; duplicating it in the new component matches this project's low-complexity goal better than introducing a shared abstraction for two call sites.
- No recipe/mixing interaction with removal — S-04 doesn't exist yet, so there's no dependent state to worry about when a paint is removed.
- No generated Supabase types — still deferred, consistent with S-02 and F-01.

## Implementation Approach

Same two-phase shape as S-02: an independently-testable `DELETE` API route first, then the UI that consumes it. The route follows the exact `createClient` + `locals.user` auth-check pattern already established in `src/pages/api/paints.ts`. The UI is a new React island that duplicates `PaintPicker`'s search/filter/optimistic-update conventions rather than sharing code with it, since the two components now have genuinely different responsibilities (browse-and-add vs. manage-owned).

## Phase 1: Delete API Route

### Overview

Add `DELETE /api/paints/:id` — removes one paint from the current user's list.

### Changes Required:

#### 1. Delete-paint API route

**File**: `src/pages/api/paints/[id].ts`

**Intent**: Owner-scoped removal of a single `user_paints` row, mirroring the auth-check and response conventions already established by `POST /api/paints`.

**Contract**:
- Opens with the same `createClient`/null-check and `context.locals.user` 401-check pattern as the existing handlers in `src/pages/api/paints.ts` (this route is under `/api/*`, not covered by `PROTECTED_ROUTES`, so the check is self-enforced — same reasoning as S-02's Critical Implementation Detail).
- Reads the paint id from `context.params.id` (Astro dynamic route param, always a non-empty string when this handler is invoked).
- Deletes with `user_id` set explicitly, not just relying on RLS: `.from("user_paints").delete().eq("user_id", user.id).eq("paint_id", id)` — RLS still enforces owner-scoping as defense in depth, matching the explicit-`user_id` convention `POST` already uses on insert.
- Idempotent-success: returns `{ ok: true }` (200) whether or not a row was actually deleted (paint wasn't owned, or was already removed) — symmetric with `POST`'s idempotent-add. A genuine Supabase error returns 400 with `{ error: string }`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes (excluding the pre-existing repo-wide CRLF issue already established as unrelated, per the precedent in `context/archive/2026-09-09-add-paint-to-list/change.md`)
- `npm run build` completes without error

#### Manual Verification:

- With a logged-in session and a previously-added paint, `DELETE /api/paints/<paint_id>` returns `{ ok: true }` and a follow-up `GET /api/paints` shows that paint's `owned: false`.
- A repeat `DELETE` on the same `paint_id` also returns `{ ok: true }` (idempotent, no error).
- `DELETE /api/paints/<paint_id>` without a session cookie returns 401, not a Supabase/RLS error.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: My Paints UI

### Overview

Add the `/dashboard/my-paints` page showing the owned subset with search/type-filter and remove, plus corrected dashboard navigation.

### Changes Required:

#### 1. My Paints island

**File**: `src/components/paints/MyPaintsList.tsx`

**Intent**: Client-side view of the user's owned paints only, with the same search/type-filter interaction `PaintPicker` offers, and a Remove action per row instead of Add.

**Contract**: Fetches `GET /api/paints` once on mount (same call `PaintPicker` makes), keeps only rows with `owned: true` in local state. Search text + type-filter chip state and derivation of available types from the current owned set follow the same shape as `PaintPicker`'s `search`/`typeFilter`/`types` (duplicated here, not shared — see What We're NOT Doing). Two distinct empty states: if the owned set itself is empty, render the "you haven't added any paints yet" message with a link to `/dashboard/paints`; if the owned set is non-empty but the current search/filter matches nothing, render a different "no paints match your filters" message instead — collapsing these into one message would misdirect a user who has paints but a narrow filter. Remove button per row calls `DELETE /api/paints/:id`; on success, removes that row from local state immediately (no re-fetch); on failure, leaves the row in place and shows the inline error via `ServerError` (same component `PaintPicker` uses).

#### 2. My Paints page

**File**: `src/pages/dashboard/my-paints.astro`

**Intent**: Server-rendered shell mirroring `src/pages/dashboard/paints.astro`'s structure — protected automatically as a `/dashboard/*` path.

**Contract**: Uses `Layout.astro` the same way `dashboard/paints.astro` does; renders `<MyPaintsList client:load />`; includes the same "← Back to dashboard" link pattern.

#### 3. Dashboard navigation fix

**File**: `src/pages/dashboard.astro`

**Intent**: The existing link labeled "My Paints" actually points at the add/catalog page — now that a real My Paints page exists, that label must move to the correct destination and the old link relabeled to avoid two conflicting "My Paints" links.

**Contract**: Relabel the existing `/dashboard/paints` link to "Add Paints"; add a second link to `/dashboard/my-paints` labeled "My Paints", styled consistently with the existing link group.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes (same pre-existing-CRLF caveat as Phase 1)
- `npm run build` completes without error

#### Manual Verification:

- From `/dashboard`, "Add Paints" goes to the catalog picker and "My Paints" goes to the new owned-only view.
- With zero owned paints, `/dashboard/my-paints` shows the empty-state message and its link back to Add Paints works.
- After adding a couple of paints via the Add Paints page, `/dashboard/my-paints` shows exactly those paints; search and type-filter both narrow the list correctly.
- Typing a search term that matches nothing (while owned paints exist) shows the "no paints match your filters" message, not the zero-owned empty state.
- Clicking Remove on a row removes it from the list immediately with no page reload; reloading `/dashboard/my-paints` confirms it's gone.
- Visiting `/dashboard/my-paints` while signed out redirects to `/auth/signin`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no test runner is configured in this project (per `CLAUDE.md`).

### Integration Tests:

- N/A — manual verification covers the API + UI round-trip, same as S-02.

### Manual Testing Steps:

1. API round-trip via `curl`/browser dev tools after Phase 1 (delete, idempotent re-delete, unauthenticated 401).
2. Full My Paints flow (owned-only listing, search/filter, remove, persistence across reload, both empty states, protected-route redirect, corrected nav labels) after Phase 2.

## Performance Considerations

Same scale reasoning as S-02: at most 210 rows fetched once and filtered client-side, well within reason with no pagination or server-side search needed.

## Migration Notes

No schema changes — `user_paints`'s `DELETE` RLS policy already exists from F-01. This slice is pure application code.

## References

- Roadmap: `context/foundation/roadmap.md` (S-03: view-and-remove-paints)
- PRD: `context/foundation/prd.md` (FR-003, FR-004)
- Prior slice: `context/archive/2026-09-09-add-paint-to-list/plan.md`
- Schema: `context/archive/2026-09-09-paint-color-data-schema/plan.md`
- API pattern: `src/pages/api/paints.ts`
- UI pattern: `src/components/paints/PaintPicker.tsx`, `src/pages/dashboard/paints.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Delete API Route

#### Automated

- [x] 1.1 `npx astro sync && npm run lint` passes — 98db1aa
- [x] 1.2 `npm run build` completes without error — 98db1aa

#### Manual

- [x] 1.3 `DELETE /api/paints/:id` removes the paint and `GET /api/paints` reflects `owned: false` — 98db1aa
- [x] 1.4 Repeat `DELETE` on the same paint is idempotent (no error) — 98db1aa
- [x] 1.5 Unauthenticated `DELETE` returns 401 — 98db1aa

### Phase 2: My Paints UI

#### Automated

- [x] 2.1 `npx astro sync && npm run lint` passes
- [x] 2.2 `npm run build` completes without error

#### Manual

- [x] 2.3 Dashboard nav shows correctly labeled "Add Paints" and "My Paints" links
- [x] 2.4 Zero-owned empty state shows message + working link to Add Paints
- [x] 2.5 Owned-only list shows exactly the paints added; search and type-filter both work
- [x] 2.6 No-match-on-filter state is distinct from zero-owned empty state
- [x] 2.7 Remove flips list instantly, no reload; persists across a reload
- [x] 2.8 Signed-out access to `/dashboard/my-paints` redirects to `/auth/signin`
