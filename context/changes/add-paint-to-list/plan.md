# Add Paint to List Implementation Plan

## Overview

Add the first domain feature to 10xPaintMixer: a searchable picker over the 210-paint catalog at `/dashboard/paints`, letting a user filter by type and add paints to their private `user_paints` list via a JSON API, with instant inline feedback (no full-page reload). This is S-02 on the roadmap — the "north star" slice proving the data layer (F-01) and auth (S-01) actually work together end-to-end.

## Current State Analysis

- Schema is ready and live (F-01, archived): `paints(id, name, brand_id, type_id, r, g, b, hex)` and `user_paints(id, user_id, paint_id, created_at)` with `unique(user_id, paint_id)`. RLS: any authenticated user can read `paints`/`brands`/`paint_types`; `user_paints` is owner-scoped (`auth.uid() = user_id`) on all of select/insert/update/delete, `WITH CHECK` present on insert/update.
- No domain API routes exist yet — only `src/pages/api/auth/{signin,signup,signout}.ts` (`src/pages/api/auth/signin.ts:1-20`). This is the first non-auth route.
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]`, matched via `pathname.startsWith(route)`. This protects page navigation (redirects to `/auth/signin`) but does **not** cover `/api/*` paths — an API route needs its own auth check.
- `user_paints.user_id` has no column default (confirmed via live RLS testing during F-01): an insert that omits `user_id` fails `WITH CHECK (auth.uid() = user_id)` since it compares against `NULL`. The API route must explicitly set `user_id` from the authenticated user.
- Established UI pattern (`src/components/auth/SignInForm.tsx`, `FormField.tsx`, `SubmitButton.tsx`): React islands wrap a native form for auth; error display goes through `ServerError.tsx`. No fetch/JSON API precedent exists yet in this codebase.
- `components.json` — shadcn `new-york` style, `@/components/ui` alias. Only `button.tsx` is installed; a search input needs `npx shadcn add input`.
- `src/lib/config-status.ts` — existing "is Supabase configured" pattern used on auth pages; reused here for the same class of error.
- `src/pages/dashboard.astro` is currently a placeholder (welcome message + sign-out button only) — no navigation to other pages yet.

## Desired End State

A user can open `/dashboard/paints`, search/filter the 210-paint catalog by name or type, click "Add" on a paint, and see it marked as owned immediately — no page navigation. Reloading the page still shows it as owned (proves the round-trip through RLS-scoped `user_paints` actually persists). Adding an already-owned paint is a no-op success, not an error. `dashboard.astro` links to the new page.

### Key Discoveries:

- `src/middleware.ts:4,18-22` — `/api/*` is unprotected by middleware; the new route must check `context.locals.user` itself and return 401 JSON, not rely on a redirect.
- RLS behavior on `user_paints.user_id` (no default, `WITH CHECK` requires exact match) — verified live against both local and production during F-01's Phase 3.
- Supabase JS `.upsert(row, { onConflict: 'user_id,paint_id', ignoreDuplicates: true })` gives idempotent-add in one call — no manual 23505 conflict handling needed.

## What We're NOT Doing

- No standalone "my paints" list/table view or remove capability — that's S-03, deliberately scoped separately on the roadmap (same entity, typically built together with removal).
- No color-mixing logic or recipe generation — that's S-04.
- No brand filter in the picker — only one brand (Army Painter) exists in the catalog today; a filter with a single option adds no value.
- No toast/notification system — reuses the existing inline-error pattern (`ServerError.tsx`-style) rather than introducing new UI infrastructure.
- No pagination — 210 rows is small enough to fetch and filter client-side in one request.
- No generated Supabase TypeScript types — still deferred (per F-01's scope decision); this plan hand-writes the minimal request/response shapes it needs.

## Implementation Approach

Two phases: a JSON API route first (independently testable via `curl`/`fetch` before any UI exists), then the picker UI that consumes it. The API route follows the same `createClient(context.request.headers, context.cookies)` pattern as the auth routes (request-scoped Supabase client, so RLS applies using the caller's actual session — no service-role client, no manual `user_id` filtering needed on reads). The picker is a single React island (`client:load`) rendered from a new Astro page nested under the already-protected `/dashboard` prefix.

## Critical Implementation Details

### Timing & lifecycle

The API route must check `context.locals.user` and return `401` before touching Supabase for any write — middleware populates `locals.user` for every request (including `/api/*`) but only *redirects* for paths in `PROTECTED_ROUTES`, which excludes `/api/*`. Skipping this check would let an unauthenticated `fetch` reach the Supabase client; reads would come back empty (RLS denies `anon`), but an insert attempt would produce a confusing RLS error instead of a clean 401.

## Phase 1: API Route

### Overview

Add `GET`/`POST /api/paints` — list the catalog with per-user ownership status, and add a paint to the user's list.

### Changes Required:

#### 1. Paints API route

**File**: `src/pages/api/paints.ts`

**Intent**: First domain API route. `GET` returns every catalog paint plus whether the current user owns it, driving the picker's UI state in one request. `POST` adds one paint to the user's list, idempotently.

**Contract**:
- Both handlers open with the same `createClient`/null-check pattern as `src/pages/api/auth/signin.ts`, then require `context.locals.user` (401 JSON `{ error: string }` if absent — this route is not covered by `PROTECTED_ROUTES`, see Critical Implementation Details).
- `GET`: query `paints` joined with `paint_types` (for the type name) and the current user's `user_paints` (RLS already scopes this to the caller — a `select` embedding `user_paints(paint_id)` or a second query against `user_paints` to build an owned-id set both work; either way the response must **not** leak other users' rows, which RLS guarantees regardless of query shape). Response: `{ id: string; name: string; type: string; hex: string; owned: boolean }[]`, ordered by name.
- `POST`: body `{ paint_id: string }`. Validate presence/shape (400 if missing). Upsert into `user_paints` with `user_id` set explicitly to `context.locals.user.id`:
  ```ts
  await supabase
    .from("user_paints")
    .upsert({ user_id: user.id, paint_id }, { onConflict: "user_id,paint_id", ignoreDuplicates: true });
  ```
  Response: `{ ok: true }` on success (200), regardless of whether the row was newly inserted or already existed (idempotent-success, per the confirmed duplicate-add decision). A genuine failure (bad `paint_id` FK, Supabase error) returns a 400/500 with `{ error: string }`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes (excluding the pre-existing repo-wide CRLF errors already established as unrelated, per `context/archive/2026-09-08-user-signup-signin/change.md` and `context/archive/2026-09-09-paint-color-data-schema/change.md`)
- `npm run build` completes without error

#### Manual Verification:

- With `npm run dev` running and a logged-in session (cookie from the browser), `GET /api/paints` returns all 210 paints with `owned: false` for a fresh test user.
- `POST /api/paints` with a valid `paint_id` returns `{ ok: true }`; a repeat `POST` with the same `paint_id` also returns `{ ok: true }` (idempotent, no error).
- `GET /api/paints` after the `POST` shows that paint's `owned: true`.
- Hitting either endpoint without a session cookie (e.g. via `curl` with no auth) returns 401, not a Supabase/RLS error.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Picker UI

### Overview

Add the `/dashboard/paints` page and its React island: search, type filter, color swatches, inline owned-state, and a link from the dashboard placeholder.

### Changes Required:

#### 1. Add shadcn `input` primitive

**File**: `src/components/ui/input.tsx` (generated)

**Intent**: Search box needs a styled input; follow the project's established convention (`components.json`) of adding shadcn primitives via CLI rather than hand-rolling.

**Contract**: Run `npx shadcn add input`; no manual edits beyond what the generator produces.

#### 2. Paint picker island

**File**: `src/components/paints/PaintPicker.tsx`

**Intent**: Client-side picker: fetches the catalog once on mount, filters by name/type entirely client-side (210 rows, no server round-trip needed per filter change), and posts an add per click with immediate local state update.

**Contract**: `useState` for the fetched paint list, search text, and type filter; type filter options derived from the distinct `type` values already present in the fetched response (no second endpoint). On `GET /api/paints` failure, render the same inline-error treatment used elsewhere (`ServerError.tsx`-style — reuse or mirror that component). Each row shows a swatch (`style={{ backgroundColor: paint.hex }}`), name, type, and an Add button that POSTs `{ paint_id }` and flips that row's local `owned` state on success — no re-fetch of the whole list needed. Owned rows show a disabled/checked state instead of an active Add button.

#### 3. Picker page

**File**: `src/pages/dashboard/paints.astro`

**Intent**: Server-rendered shell (mirrors `dashboard.astro`'s layout/auth pattern — protected automatically since it's nested under `/dashboard`) that mounts the island.

**Contract**: Uses `Layout.astro` like `dashboard.astro` does; renders `<PaintPicker client:load />`. No server-side data fetching here — the island fetches its own data from `/api/paints` on mount, keeping this file thin.

#### 4. Dashboard navigation link

**File**: `src/pages/dashboard.astro`

**Intent**: The placeholder dashboard currently dead-ends at sign-out; add a link so the new page is reachable.

**Contract**: Add a link/button to `/dashboard/paints` near the existing sign-out form, styled consistently with the page's existing `bg-white/10` card treatment.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes (same pre-existing-CRLF caveat as Phase 1)
- `npm run build` completes without error

#### Manual Verification:

- Navigate to `/dashboard`, click through to `/dashboard/paints`.
- Search for a paint by partial name; list filters live. Switch the type filter; list narrows to that type.
- Click "Add" on a paint; it flips to an owned/disabled state immediately, no page reload or navigation.
- Reload `/dashboard/paints`; the previously-added paint still shows as owned (persistence round-trip confirmed).
- Visiting `/dashboard/paints` while signed out redirects to `/auth/signin` (inherited from `PROTECTED_ROUTES` matching `/dashboard`).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no test runner is configured in this project (per `CLAUDE.md`).

### Integration Tests:

- N/A — manual verification covers the API + UI round-trip; no test runner to automate it with yet.

### Manual Testing Steps:

1. API round-trip via `curl`/browser dev tools after Phase 1 (list, add, idempotent re-add, unauthenticated 401).
2. Full picker flow (search, filter, add, persistence across reload, protected-route redirect) after Phase 2.

## Performance Considerations

210 rows fetched once per page load and filtered client-side is well within reason at this scale (no pagination, no server-side search needed). The existing `paints.brand_id`/`type_id` indexes from F-01 aren't exercised by this slice's queries in any way that would need additional indexing.

## Migration Notes

No schema changes — this slice is pure application code on top of F-01's existing tables.

## References

- Roadmap: `context/foundation/roadmap.md` (S-02: add-paint-to-list)
- PRD: `context/foundation/prd.md` (FR-002)
- Schema: `context/archive/2026-09-09-paint-color-data-schema/plan.md`
- Auth route pattern: `src/pages/api/auth/signin.ts`
- Auth UI pattern: `src/components/auth/SignInForm.tsx`, `FormField.tsx`, `SubmitButton.tsx`, `ServerError.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: API Route

#### Automated

- [x] 1.1 `npx astro sync && npm run lint` passes — 9bb387f
- [x] 1.2 `npm run build` completes without error — 9bb387f

#### Manual

- [x] 1.3 `GET /api/paints` returns all 210 paints with `owned: false` for a fresh user — 9bb387f
- [x] 1.4 `POST /api/paints` adds a paint and is idempotent on repeat — 9bb387f
- [x] 1.5 `GET /api/paints` reflects `owned: true` after the add — 9bb387f
- [x] 1.6 Unauthenticated requests to either endpoint return 401 — 9bb387f

### Phase 2: Picker UI

#### Automated

- [x] 2.1 `npx astro sync && npm run lint` passes
- [x] 2.2 `npm run build` completes without error

#### Manual

- [x] 2.3 Dashboard links through to `/dashboard/paints`
- [x] 2.4 Search and type filter both work live
- [x] 2.5 Add flips owned state instantly, no page reload
- [x] 2.6 Owned state persists across a page reload
- [x] 2.7 Signed-out access to `/dashboard/paints` redirects to `/auth/signin`
