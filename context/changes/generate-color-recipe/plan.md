# Generate Color Recipe (S-04) Implementation Plan

## Overview

Implement S-04: a logged-in user picks a target color from the shared paint catalog and gets a generated recipe — a small integer-ratio mix of their own owned paints — that best approximates it, using `spectral.js`'s Kubelka-Munk pigment mixing. The recipe is persisted per user as a history log; this change does not ship a history-browsing UI.

## Current State Analysis

- Schema already supports the inputs: `paints` (catalog, has both `r,g,b` and `hex`) and `user_paints` (owner-RLS join table) — `supabase/migrations/20260909192830_create_paint_catalog_schema.sql:48-97`. There is no separate `colors` table; target colors are `paints` rows too, per that migration's header comment.
- No `recipes` table exists yet — this plan adds one.
- `spectral.js` is not yet a dependency (`package.json:14-35`). Per `context/changes/generate-color-recipe/research.md`, it's a zero-dependency UMD bundle with no Node built-ins (safe under the Cloudflare `workerd` adapter) but ships no TypeScript types, which will trip this project's `strictTypeChecked`/`stylisticTypeChecked` ESLint config (`eslint.config.mjs:16`) without an ambient module declaration.
- Existing API routes (`src/pages/api/paints.ts:26-101`, `src/pages/api/paints/[id].ts:11-34`) establish the pattern this plan follows: `createClient(context.request.headers, context.cookies)` (`src/lib/supabase.ts`), `401` if no `context.locals.user`, `500` if Supabase isn't configured, a local `json(body, status)` helper.
- Existing UI (`src/components/paints/PaintPicker.tsx`, `src/components/paints/MyPaintsList.tsx`, `src/pages/dashboard/paints.astro`, `src/pages/dashboard/my-paints.astro`) establishes the pattern for the new page: fetch-on-mount React island with search + type-filter, shadcn `Input`/`Button`, `ServerError` for error display, wrapped in an `.astro` page with `Layout` + the cosmic-gradient card + a back link to `/dashboard`.
- PRD acceptance criteria (`context/foundation/prd.md:52-53`) require: the recipe uses only owned paints, and an empty owned-list shows a clear message instead of an error or empty result. The PRD's own Business Logic section (`prd.md:82-84`) states the output is the target color "or its closest possible approximation" — the app must never refuse to answer on quality grounds, only ever on the empty-list case.

### Key Discoveries:

- `paints.r/g/b` + `paints.hex` map directly onto `spectral.Color`'s constructor (`[r,g,b]` or hex string) — no conversion layer needed (`research.md`, "Data shape fit" section).
- Owned-paint counts per user are small relative to the 210-paint seed catalog (`supabase/seed.sql:1-4`), so a candidate-shortlist + small-integer-ratio search stays cheap regardless of catalog growth.
- The "simple integer parts" ratio format the user asked for can be the search space itself (search directly over small integer-ratio tuples) rather than a continuous-weight optimization followed by a lossy rounding step — see Critical Implementation Details.

## Desired End State

A logged-in user with at least one owned paint can open a "Generate Recipe" page, pick any catalog color as the target, and immediately see: the target swatch, the best-achievable mixed-color swatch, a quality label ("Great match" / "Approximate match"), and the recipe as integer parts (e.g. "2 parts Matt Black : 1 part Ash Grey"). The recipe is saved to a new `recipes` table scoped to that user. A user with zero owned paints sees a clear message instead of the picker/result flow.

**Verification**: sign in, add at least one paint via `/dashboard/paints`, visit the new recipe page, pick a target color, confirm a recipe renders within a few seconds and a row appears in `recipes` for that user. Sign in as a user with no owned paints and confirm the empty-state message appears instead.

## What We're NOT Doing

- No recipe-history browsing UI (`/dashboard/recipes` or similar) — recipes are persisted but not surfaced as a list in this change.
- No new test runner / test framework — this project has none configured (`CLAUDE.md`), and testing strategy is explicitly out of scope until Module 3 per `CLAUDE.md`'s 10xDevs section. Verification here is `tsc`/ESLint plus manual exercise.
- No `color-diff` / CIEDE2000 dependency — match quality is scored using `spectral.js`'s own OKLab output (Euclidean distance), avoiding a second untyped dependency.
- No custom colors or colors outside the `paints` catalog (explicit PRD Non-Goal).
- No update/delete API for persisted recipes — the `recipes` table is an append-only log; nothing in the PRD asks for editing or removing past recipes.
- No combination sizes larger than 3 paints, and no unbounded ratio search — the search space is intentionally capped (see Critical Implementation Details).

## Implementation Approach

Server-side only: a new pure engine module computes the recipe from a target `Color` and a list of owned paints, called from a new auth-gated API route that also persists the result. The UI is a new page + component following the existing `PaintPicker` pattern exactly, plus an inline result panel. No changes to existing routes, components, or the `paints`/`user_paints` schema.

## Critical Implementation Details

- **Search space is bounded by design, not by truncating a continuous optimum.** To keep the algorithm both fast and directly aligned with the "simple integer parts" output format: (1) shortlist the `CANDIDATE_POOL_SIZE = 12` owned paints nearest the target by OKLab Euclidean distance; (2) enumerate every subset of size 1–3 from that shortlist; (3) for each subset, enumerate small coprime integer-part tuples (each part ≥ 1, tuple sum ≤ `MAX_TOTAL_PARTS = 6`) rather than searching continuous weights and rounding afterward — this guarantees every candidate recipe is already in the exact format the UI shows, with no post-hoc rounding that could silently worsen the reported match. For a 12-paint shortlist this is on the order of ~5,000 `spectral.mix()` calls per request — cheap array/matrix math, but the implementer should do a one-time manual timing check in `npm run dev` / `npm run preview` (Cloudflare's `workerd` runtime) to confirm it comfortably clears the Workers CPU-time budget for the target deployment plan, since that budget isn't visible from this repo's config (`wrangler.jsonc` sets no explicit `limits.cpu_ms`, so it defaults to the account plan's limit).
- **Quality label threshold is a documented assumption, not a derived color-science constant.** Compute `distance = OKLab Euclidean distance` between the target `Color` and the winning mix's `Color`. Label `distance < 0.02` as "Great match", otherwise "Approximate match". This threshold is a starting point for the "few seconds, plain-language" UX the user asked for — tune it later against real user feedback (ties to the PRD's 75%-acceptance success metric) rather than treating it as precise.
- **`Washes`-type paints get a lower `tintingStrength`.** When constructing a `spectral.Color` for a candidate paint whose `paint_types.name === "Washes"`, set `tintingStrength = 0.4` (vs the library default of `1` for `Standard`/`Metallic`) before mixing, per the user's decision to model translucent paints as weaker pigments. This value is a modeling approximation, not derived from real pigment data — document it as such at the point of use.
- **Empty-owned-list is a guarded, not-an-error state**, per the PRD acceptance criterion — both the API and the UI must treat it as a distinct, expected case (not a `500`/exception path).

## Phase 1: Data & Dependency Foundation

### Overview

Add the `recipes` table (owner-RLS, append-only), install `spectral.js`, and add the ambient TypeScript declaration it needs to pass this project's strict lint config.

### Changes Required:

#### 1. `recipes` table migration

**File**: `supabase/migrations/20260910120000_create_recipes_schema.sql`

**Intent**: Persist each generated recipe as an immutable, owner-scoped history row, mirroring the RLS shape already established for `user_paints`.

**Contract**: New table `recipes`:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users (id) on delete cascade`
- `target_paint_id uuid not null references paints (id) on delete restrict`
- `components jsonb not null` — array of `{ paint_id: uuid, parts: integer }`
- `result_hex text not null check (result_hex ~* '^#[0-9a-f]{6}$')`
- `distance real not null`
- `created_at timestamptz not null default now()`
- Index on `user_id` (mirrors `user_paints_user_id_idx`).
- RLS enabled; policies for `select` and `insert` only (owner-only, `auth.uid() = user_id`), matching the pattern at `supabase/migrations/20260909192830_create_paint_catalog_schema.sql:86-97` minus `update`/`delete` (append-only log, per "What We're NOT Doing").

#### 2. Install `spectral.js`

**File**: `package.json`

**Intent**: Add the pigment-mixing library as a production dependency.

**Contract**: `dependencies["spectral.js"]` pinned to `^3.0.0` (matches the version researched in `spectral-js-api-reference.md`).

#### 3. Ambient TypeScript declaration for `spectral.js`

**File**: `src/types/spectral.d.ts`

**Intent**: `spectral.js` ships no types; without this, every call site trips `@typescript-eslint/no-unsafe-*` under `strictTypeChecked` and fails `npm run lint` (CI gate per `CLAUDE.md`).

**Contract**: `declare module "spectral.js"` exporting a typed `Color` class (constructor accepting `string | number[]`, readonly `OKLab: number[]` and `sRGB: number[]`, writable `tintingStrength: number`, `toString(opts?: { format?: string }): string`) and a typed `mix(...args: [Color, number][]): Color` function — scoped to only the members this codebase actually calls (per `spectral-js-api-reference.md`'s API surface), not the full library surface.

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly: `npx supabase db reset` (or the project's configured local migration command)
- [ ] Type checking passes: `npx astro sync && npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] `recipes` table and its RLS policies are visible in the local Supabase Studio / `psql` after migration

---

## Phase 2: Recipe Generation Engine

### Overview

A pure, server-side module that takes a target color and a list of owned paints and returns the best small-integer-ratio recipe, per the search strategy in Critical Implementation Details.

### Changes Required:

#### 1. Recipe engine module

**File**: `src/lib/recipe.ts`

**Intent**: Encapsulate the entire search algorithm (shortlist → subset enumeration → integer-ratio enumeration → `spectral.mix` scoring → best-match selection → quality labeling) as one exported function, independent of Supabase/HTTP concerns, so the API route (Phase 3) stays a thin caller.

**Contract**: Export a function with a signature along the lines of `generateRecipe(target: { r: number; g: number; b: number }, ownedPaints: { id: string; r: number; g: number; b: number; typeName: string }[]): { components: { paintId: string; parts: number }[]; resultHex: string; distance: number; quality: "great" | "approximate" }`. Internally applies `CANDIDATE_POOL_SIZE = 12`, `MAX_COMBINATION_SIZE = 3`, `MAX_TOTAL_PARTS = 6`, the `Washes` → `tintingStrength = 0.4` rule, and the `distance < 0.02` quality threshold as named constants at the top of the file (tunable, per Critical Implementation Details). Must handle `ownedPaints.length === 0` by throwing a distinguishable error (e.g. a dedicated error class or a sentinel) that Phase 3's route maps to the empty-list response — this function is the single source of truth for that guard so it can't be bypassed by a future second caller.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] A one-off manual check (e.g. a temporary script or REPL call) confirms: mixing a target against a single owned paint that exactly matches it returns `distance ≈ 0` and a single-component recipe; an empty `ownedPaints` array throws the expected guard error
- [ ] Timing check in `npm run dev`/`npm run preview` confirms the search comfortably completes within the "few seconds" NFR budget for a realistic owned-paint count (per the performance note in Critical Implementation Details)

---

## Phase 3: API Route

### Overview

`POST /api/recipe` — auth-gated route that fetches the target paint and the caller's owned paints, guards the empty-list case, calls the Phase 2 engine, persists the result, and returns it.

### Changes Required:

#### 1. Recipe API route

**File**: `src/pages/api/recipe.ts`

**Intent**: Wire the engine into the existing auth/Supabase/JSON-response pattern used by `src/pages/api/paints.ts`.

**Contract**: `POST` handler — body `{ target_paint_id: string }`. Follows `src/pages/api/paints.ts:74-101`'s shape: `createClient` → `500` if unconfigured → `401` if no `context.locals.user` → validate `target_paint_id` is a non-empty string (`400` otherwise) → fetch the target `paints` row (`404` if not found) → fetch the caller's owned paints via `user_paints` joined to `paints` (including `paint_types.name` for the Washes rule) → if owned list is empty, return `422` with a clear message (e.g. `{ error: "You don't have any paints yet." }`) matching the empty-state guard from Phase 2 → call `generateRecipe` → insert a row into `recipes` → respond `200` with `{ targetPaint, components: [...with paint name/hex resolved for display], resultHex, quality }`.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`
- [ ] Production build succeeds: `npm run build`

#### Manual Verification:

- [ ] `POST /api/recipe` with a valid `target_paint_id` and at least one owned paint returns `200` with a well-formed recipe, and a corresponding row appears in `recipes`
- [ ] `POST /api/recipe` with zero owned paints returns `422` with a readable message, not a `500`
- [ ] `POST /api/recipe` without auth returns `401`; with an invalid/missing `target_paint_id` returns `400`

---

## Phase 4: UI

### Overview

A new "Generate Recipe" page: pick a target color from the full catalog (reusing the `PaintPicker` list pattern, single-select), see the recipe result inline, and a link from the dashboard.

### Changes Required:

#### 1. Recipe generator component

**File**: `src/components/recipe/RecipeGenerator.tsx`

**Intent**: Let the user pick a target paint from the catalog and see the generated recipe, following the fetch-on-mount + search/filter pattern from `src/components/paints/PaintPicker.tsx`.

**Contract**: On mount, `GET /api/paints` (existing route) to get the catalog with each paint's `owned` flag, exactly as `PaintPicker` does. If no paint has `owned === true`, render an empty-state message (mirroring `MyPaintsList.tsx:96-109`'s pattern) linking to `/dashboard/paints`, and do not render the picker. Otherwise render the same search+type-filter list as `PaintPicker`, but clicking a row calls `POST /api/recipe` with that paint's id (instead of adding it) and renders a result panel below: target swatch vs. result swatch (reusing the `size-6 rounded-full` swatch style from `MyPaintsList.tsx:165-169`), the quality label, and the parts list (e.g. "2 parts Matt Black : 1 part Ash Grey"). Uses `ServerError` for request failures, matching existing components.

#### 2. Recipe page

**File**: `src/pages/dashboard/recipe.astro`

**Intent**: Page wrapper for the new component, matching `src/pages/dashboard/paints.astro` exactly in structure.

**Contract**: `Layout title="Generate Recipe"` wrapping the cosmic-gradient card, `<RecipeGenerator client:load />`, and a "← Back to dashboard" link — same shape as `src/pages/dashboard/paints.astro:1-17`.

#### 3. Dashboard link

**File**: `src/pages/dashboard.astro`

**Intent**: Make the new page reachable from the dashboard, alongside the existing "Add Paints"/"My Paints" links.

**Contract**: Add a third `<a href="/dashboard/recipe">Generate Recipe</a>` link inside the existing `flex items-center justify-center gap-3` group at `src/pages/dashboard.astro:17-38`, styled identically to the other two links.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npx astro sync && npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`
- [ ] Production build succeeds: `npm run build`

#### Manual Verification:

- [ ] As a user with ≥1 owned paint: visiting `/dashboard/recipe`, picking a target color shows a recipe (swatches, quality label, integer-parts ratio) within a few seconds
- [ ] As a user with 0 owned paints: visiting `/dashboard/recipe` shows the empty-state message instead of the picker
- [ ] The new "Generate Recipe" link appears on `/dashboard` and navigates correctly
- [ ] No visual/regression issues on `/dashboard/paints` or `/dashboard/my-paints` (unchanged files, but confirm shared components still render correctly)

---

## Testing Strategy

No test runner is configured in this project (per `CLAUDE.md`); verification is `tsc`/ESLint plus the manual steps in each phase above.

### Manual Testing Steps:

1. Sign in as a user with zero owned paints; confirm the empty-state message on `/dashboard/recipe`.
2. Add a single paint via `/dashboard/paints`; generate a recipe targeting that same paint's color — expect a single-component recipe with `distance ≈ 0` and a "Great match" label.
3. Add several paints spanning different hues; generate a recipe for a target color none of them closely match — expect a 2-3 paint recipe with an "Approximate match" label, never an error.
4. Add a `Washes`-type paint and confirm it can still appear in a generated recipe (not silently excluded).
5. Confirm each generated recipe produces a new row in `recipes` scoped to the signed-in user (and is not visible to a different user).

## Performance Considerations

The search is bounded to ~5,000 `spectral.mix()` calls per request by the `CANDIDATE_POOL_SIZE`/`MAX_COMBINATION_SIZE`/`MAX_TOTAL_PARTS` constants in `src/lib/recipe.ts` (Phase 2), regardless of total catalog or owned-paint growth. If real-world timing (Phase 2's manual verification step) shows this is too slow for the Workers CPU budget, tune those constants down before considering a different algorithm.

## Migration Notes

Additive only — one new table (`recipes`), no changes to `paints`/`user_paints`/`brands`/`paint_types`. No backfill needed (recipes only exist going forward).

## References

- Research: `context/changes/generate-color-recipe/research.md`
- Library research: `context/changes/generate-color-recipe/srs-review-session.md`
- Library API reference: `context/changes/generate-color-recipe/spectral-js-api-reference.md`
- Existing route pattern: `src/pages/api/paints.ts:26-101`
- Existing UI pattern: `src/components/paints/PaintPicker.tsx`, `src/components/paints/MyPaintsList.tsx`
- Schema: `supabase/migrations/20260909192830_create_paint_catalog_schema.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data & Dependency Foundation

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset`
- [x] 1.2 Type checking passes: `npx astro sync && npx tsc --noEmit`
- [x] 1.3 Linting passes: `npm run lint`

#### Manual

- [x] 1.4 `recipes` table and RLS policies visible after migration

### Phase 2: Recipe Generation Engine

#### Automated

- [ ] 2.1 Type checking passes: `npx tsc --noEmit`
- [ ] 2.2 Linting passes: `npm run lint`

#### Manual

- [ ] 2.3 Exact-match and empty-list guard behave as expected
- [ ] 2.4 Timing check confirms search completes within the NFR budget

### Phase 3: API Route

#### Automated

- [ ] 3.1 Type checking passes: `npx tsc --noEmit`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 3.4 Valid request returns a recipe and persists a `recipes` row
- [ ] 3.5 Empty-owned-list returns `422` with a readable message
- [ ] 3.6 Unauthenticated returns `401`; invalid body returns `400`

### Phase 4: UI

#### Automated

- [ ] 4.1 Type checking passes: `npx astro sync && npx tsc --noEmit`
- [ ] 4.2 Linting passes: `npm run lint`
- [ ] 4.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 4.4 Recipe flow works end-to-end for a user with owned paints
- [ ] 4.5 Empty-state message shown for a user with no owned paints
- [ ] 4.6 Dashboard link works
- [ ] 4.7 No regressions on `/dashboard/paints` or `/dashboard/my-paints`
