# Saved Recipes with Notes Implementation Plan

## Overview

Today, every call to `POST /api/recipe` silently inserts a row into `recipes` — the
user never explicitly saves anything, and has no way to see, delete, or annotate what
was generated. This plan makes saving an explicit user action: generation stops
persisting anything by itself; a new "Save" action persists exactly the recipe the
user is looking at; a new "Saved Recipes" tab lists what's been saved, with delete and
free-text notes (add/edit, one field).

## Current State Analysis

- `POST /api/recipe` (`src/pages/api/recipe.ts:50-140`) computes a recipe via
  `generateRecipe()` and **unconditionally inserts** it into `recipes`
  (`src/pages/api/recipe.ts:116-122`) before returning `{ targetPaint, components,
  resultHex, quality }` to the client — the response does **not** include `distance`,
  even though the DB row requires it.
- `recipes` (`supabase/migrations/20260910120000_create_recipes_schema.sql:6-14`) has
  columns `id, user_id, target_paint_id, components (jsonb), result_hex, distance,
  created_at` — **no `notes` column**.
- `recipes` RLS (`...20260910120000...sql:20-30`) has only `select` and `insert`
  policies, and the migration's own header comment states this is deliberate: "recipes
  are never edited or removed in the MVP" (lines 3-4).
- `cross-user-authorization.test.ts:167-204` **already asserts the opposite of what
  this feature needs**: two tests explicitly prove "nobody, not even the owner, can
  update/delete a recipe — no policy exists for that operation" (lines 193-203). Once
  update/delete policies exist, these two tests become false and must be rewritten
  into real cross-user isolation checks (same shape as the existing `user_paints`
  update/delete tests at lines 147-164).
- `user_paints` (`...20260909192830...sql:87-110`) already has the update+delete RLS
  policy pattern this feature needs to mirror for `recipes`.
- No `PATCH`/`PUT` handler exists anywhere in `src/pages/api/` today — the notes-edit
  endpoint will be the first of its kind in this codebase; `GET`/`POST`/`DELETE`
  precedent is strong (`src/pages/api/paints.ts`, `src/pages/api/paints/[id].ts`).
- `RecipeGenerator.tsx` (`src/components/recipe/RecipeGenerator.tsx`) holds the
  generated `recipe` in React state (line 53) and renders it at lines 214-249 — this
  is where a "Save" action attaches.
- `MyPaintsList.tsx` is the direct structural template for a new `SavedRecipesList`:
  fetch-on-mount (lines 33-55), per-row delete with a `pendingIds: Set<string>` for
  disabled state (lines 72-90, 174-183) — but it has no editable-field pattern to
  copy for notes, since paints have no user-editable text field today.
- Dashboard tab navigation lives in `src/pages/dashboard.astro:17-44` as a flat list of
  `<a>` pills, not in `Topbar.astro`.
- `src/lib/recipe.ts` exports `QUALITY_THRESHOLD = 0.02` (line 7) and computes
  `quality: best.distance < QUALITY_THRESHOLD ? "great" : "approximate"` (line 135) —
  reusable for deriving the same quality bucket from a stored `distance` at list time.
- `components` is stored as `jsonb`, not a real relation — Supabase's nested
  `table(cols)` select syntax cannot join into it. Resolving component paint names for
  display requires a manual second query.
- Only `button` and `input` exist under `src/components/ui/` (shadcn). `textarea` is
  not installed and will be needed for note editing.

## Desired End State

- Generating a recipe (`POST /api/recipe`) no longer writes anything to the database —
  it is a pure compute-and-return action, same as today's algorithm and output shape
  plus a `distance` field.
- A "Save" button appears with the generated result; clicking it persists exactly that
  recipe (validated against the caller's current owned paints) and disables itself
  ("Saved"); picking a new target color to generate again resets it.
- `/dashboard/saved-recipes` lists the user's saved recipes (target color, full mix
  ratio, quality), each with a working "Delete" button and an "Add/Edit note" control
  that persists free text.
- All of this is scoped per-user: user A can never read, save-as, delete, or edit a
  note on user B's recipe, proven by real tests against local Supabase, not just by
  code inspection.
- Every pre-existing generated-and-saved recipe (rows already in `recipes` from before
  this change) shows up on the list immediately — no backfill/migration of existing
  rows needed, since they already satisfy the same shape (notes will read as `null`).

### Key Discoveries:

- `src/pages/api/recipe.ts:116-122` — the insert to remove from generation.
- `supabase/migrations/20260910120000_create_recipes_schema.sql:1-4` — explicit
  "never edited or removed" comment to update alongside the new policies.
- `src/pages/api/cross-user-authorization.test.ts:193-203` — tests that will start
  failing the moment update/delete policies exist; must be rewritten, not just left.
- `src/lib/recipe.ts:135` — the exact quality-bucket formula to reuse for saved-list
  display (`distance < QUALITY_THRESHOLD ? "great" : "approximate"`).
- `src/pages/api/paints.ts:26-68` / `paints/[id].ts:11-34` — the GET-list and
  DELETE-by-id templates for the new `recipes` endpoints.

## What We're NOT Doing

- No sorting, filtering, search, or pagination on the saved-recipes list (PRD v2
  Non-Goals) — newest-first is a fixed default, not a user-facing feature.
- No sharing of saved recipes between users, no public view.
- No "trash"/undo for deleted recipes — delete is immediate and permanent, no
  confirmation dialog (matches the existing `MyPaintsList` delete UX, and is an
  explicit PRD v2 Non-Goal).
- No length limit or validation on note content beyond "must be a string."
- No visual flag when a saved recipe references a paint the user no longer owns —
  display it exactly as saved (PRD v2 decision).
- No change to the recipe-generation algorithm, its constants, or its rate limiting
  (`src/pages/api/recipe.ts:38-48`) — only the persistence side-effect changes.
- No backfill migration for existing `recipes` rows — they already satisfy the target
  shape once `notes` is added as a nullable column.

## Implementation Approach

Build bottom-up: schema and the generation-side behavior change first (Phase 1), then
the new per-user CRUD surface for saved recipes (Phases 2–3, split as list+save+delete
vs. notes because notes introduces this codebase's first `PATCH` handler and its own
ownership-scoped update policy), then the UI that consumes it (Phase 4). Each API phase
ships with its own 401 test and its own `cross-user-authorization.test.ts` extension,
per the project's established `test-plan.md` §6.4/§6.2b conventions — this mirrors how
Phase 2 of the test rollout (`testing-authorization-route-auth-wiring`) locked down the
existing routes, so the new surface never regresses that guarantee.

## Critical Implementation Details

**Save must not trust the client's math, only its paint choices.** The save endpoint
receives `target_paint_id`, `components`, `result_hex`, and `distance` from the client
— the exact values `POST /api/recipe` just returned to it — and inserts them as-is
*after* verifying every `components[].paint_id` is currently in the caller's
`user_paints`. Do not re-run `generateRecipe()` at save time: its owned-paints query
(`src/pages/api/recipe.ts:86-90`) has no `ORDER BY`, and `generateRecipe`'s candidate
shortlist is sorted by distance with ties broken by input order (`src/lib/recipe.ts:103-106`)
— a re-run could legitimately produce a different recipe than the one the user is
looking at and clicked "Save" on.

**`POST /api/recipe`'s response must gain a `distance` field.** It's required for the
save payload above and doesn't exist in the response today (`src/pages/api/recipe.ts:128-138`
returns only `targetPaint, components, resultHex, quality`).

**Component paint names can't be joined through `jsonb`.** `GET /api/recipes` must
collect every distinct `paint_id` referenced across `target_paint_id` and all rows'
`components[].paint_id`, fetch them in one `paints` query (`select id,name,hex`
`.in("id", ids)`), and hydrate the response in application code — the same shape of
join `POST /api/recipe` already does against the *owned* list
(`src/pages/api/recipe.ts:96-104`), just against the full catalog instead.

**Two existing tests assert the feature's opposite and will fail once policies land.**
`cross-user-authorization.test.ts:193-203` ("nobody... can update/delete a recipe — no
policy exists") must be replaced in Phase 1 with real cross-user isolation assertions
("A cannot update/delete B's recipe"), mirroring the `user_paints` version of the same
tests at lines 147-164 — not just deleted, or Risk #3 coverage silently shrinks.

## Phase 1: Schema, RLS, and the generation-side behavior change

### Overview

Add what the rest of the feature depends on: a `notes` column, update/delete policies
on `recipes`, `distance` in the generation response, and removal of the automatic
insert. Fix the two now-contradicted tests in the same phase so the suite is never
left red.

### Changes Required:

#### 1. New migration

**File**: `supabase/migrations/<YYYYMMDDHHMMSS>_add_recipes_notes_and_policies.sql`

**Intent**: Add a nullable free-text `notes` column to `recipes`, and add owner-scoped
`update` and `delete` RLS policies so a user can edit/delete their own recipes.

**Contract**: `alter table recipes add column notes text;` (nullable, no default, no
length check). Two new policies mirroring `user_paints`'s shape exactly
(`supabase/migrations/20260909192830_create_paint_catalog_schema.sql:99-110`):
`"Users can update their own recipes"` (`for update ... using (auth.uid() = user_id)
with check (auth.uid() = user_id)`) and `"Users can delete their own recipes"` (`for
delete ... using (auth.uid() = user_id)`). Also update the file header comment in
`20260910120000_create_recipes_schema.sql:1-4` (or add a note in the new migration) so
it no longer claims recipes are never edited/removed.

#### 2. Stop auto-saving on generation; expose `distance`

**File**: `src/pages/api/recipe.ts`

**Intent**: Generation becomes a pure compute-and-return action. The client will
persist a recipe explicitly via the new save endpoint (Phase 2), not implicitly here.

**Contract**: Remove the `supabase.from("recipes").insert(...)` call and its
`insertError` handling (current lines 116-126). Add `distance: recipe.distance` to the
JSON object returned at the end of the handler (current lines 128-138). No other
behavior changes — the rate limiter, validation, and generation call are untouched.

#### 3. Fix the now-contradicted cross-user tests

**File**: `src/pages/api/cross-user-authorization.test.ts`

**Intent**: The two tests at lines 193-203 currently prove recipes can't be
updated/deleted by anyone. Replace them with the feature's actual invariant: the
*owner* can update/delete their own recipe, but another user cannot.

**Contract**: Replace `"nobody, not even the owner, can update a recipe"` with an
assertion shaped like the existing `user_paints` pair at lines 147-157 (`A cannot
update B's recipe` — asserts `data` is empty and B's row is unchanged; add a companion
assertion, in the same or a new `it`, that B *can* update their own row). Same
transformation for the delete test at lines 198-203, mirroring lines 159-164.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against local Supabase: `npx supabase db reset` (or
  equivalent local migrate command)
- Type checking passes: `npx astro sync && npm run lint`
- Production build succeeds: `npm run build`
- Unit test project passes: `npm run test -- --project unit`
- Integration test project passes: `npm run test -- --project integration` (including
  the rewritten cross-user-authorization assertions, when `.env.test.local` is
  configured)

#### Manual Verification:

- Generate a recipe on `/dashboard/recipe` against a local dev server and confirm no
  new row appears in the `recipes` table until an explicit save exists (Phase 2) — for
  this phase, simply confirm the row count doesn't change across repeated generations.
- Inspect the new `notes` column and the two new policies in Supabase Studio.

---

## Phase 2: Save, list, and delete saved recipes

### Overview

Give the client a way to persist a specific generated recipe, list what's been saved,
and remove one. This is the core CRUD surface the UI (Phase 4) will call.

### Changes Required:

#### 1. List and save endpoints

**File**: `src/pages/api/recipes.ts` (new)

**Intent**: `GET` lists the caller's saved recipes, hydrated with human-readable paint
names/hex for both the target and every component. `POST` saves one specific,
already-generated recipe after verifying the caller currently owns every paint it
references.

**Contract**: Follow the exact `json()` / null-Supabase-check / 401-check ordering
used throughout `src/pages/api/paints.ts:19-35`. `GET`: query `recipes` for
`user_id = user.id` ordered `created_at desc`; collect the distinct set of
`target_paint_id` plus every `components[].paint_id` across all rows; fetch matching
`paints (id, name, hex)` in one `.in("id", ids)` query; return an array of
`{ id, targetPaint: {id,name,hex}, components: [{paintId,name,hex,parts}], resultHex,
distance, quality, notes, createdAt }`, deriving `quality` from `distance` with the
same `QUALITY_THRESHOLD` comparison as `src/lib/recipe.ts:135` (import the constant,
don't re-declare the threshold). `POST` body: `{ target_paint_id, components:
{paint_id,parts}[], result_hex, distance }` — the same shape `POST /api/recipe` now
returns (client maps its camelCase `components` to this snake_case shape before
sending, mirroring the conversion `src/pages/api/recipe.ts` used to do at its own
insert). Validate the body shape (400 on malformed/missing fields, matching
`src/pages/api/recipe.ts:65-70`'s style). Before inserting, query
`user_paints` for `user_id = user.id` and `.in("paint_id", <distinct component paint
ids>)`; if the matched count is less than the distinct id count, return 400 ("One or
more paints in this recipe are no longer in your list."). Insert into `recipes` with
`user_id: user.id` plus the validated fields; return `json({ ok: true }, 200)` on
success, `400` with the Supabase error message on insert failure (matching
`src/pages/api/paints.ts:96-98`'s pattern).

#### 2. Delete endpoint

**File**: `src/pages/api/recipes/[id].ts` (new)

**Intent**: Remove a saved recipe. Owner-scoped, same shape as the existing paint
delete.

**Contract**: Identical structure to `src/pages/api/paints/[id].ts:11-34` — read
`context.params.id`, validate non-empty string, `supabase.from("recipes").delete()
.eq("user_id", user.id).eq("id", recipeId)`, `json({ ok: true }, 200)` on success,
`400` with the error message on failure.

#### 3. Tests for both endpoints

**Files**: `src/pages/api/recipes.test.ts` (new), `src/pages/api/recipes/[id].test.ts`
(new), `src/pages/api/cross-user-authorization.test.ts` (extend)

**Intent**: Cover the unauthenticated case per the project's standard recipe
(`test-plan.md` §6.4), and extend the real-routes cross-user suite to prove user A
cannot list/see or delete user B's saved recipes via these routes.

**Contract**: 401 tests follow the exact pattern named in `test-plan.md:145-152` (build
an `APIContext` with `locals: { user: null }`, assert `401` + non-empty `error`
string). In `cross-user-authorization.test.ts`'s `"via real routes"` describe block
(lines 100-125), add a case seeding a recipe as user B and asserting `GET
/api/recipes` called as user A never includes it, and a case asserting `DELETE
/api/recipes/[id]` called by A against B's recipe id leaves B's row intact — same
proof shape as the existing paints pair at lines 108-124.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro sync && npm run lint`
- Production build succeeds: `npm run build`
- Integration test project passes: `npm run test -- --project integration`

#### Manual Verification:

- With a local Supabase running and at least one existing recipe row, call `GET
  /api/recipes` (e.g. via browser devtools against the dev server) and confirm it
  returns hydrated paint names, not raw ids.
- Save a newly generated recipe via the endpoint (curl/devtools) and confirm exactly
  one new row appears with the expected `components` shape.
- Delete a saved recipe and confirm it's gone from a subsequent `GET`.

---

## Phase 3: Notes

### Overview

Add the ability to attach and edit a free-text note on a saved recipe — this
codebase's first `PATCH` handler.

### Changes Required:

#### 1. Note update endpoint

**File**: `src/pages/api/recipes/[id].ts` (extend from Phase 2)

**Intent**: Add or change the note on a saved recipe the caller owns. Only the
`notes` field is ever written, regardless of what the RLS policy would otherwise
permit — the endpoint's own payload shape is the guardrail.

**Contract**: `export const PATCH: APIRoute = ...` alongside the existing `DELETE` in
the same file. Body: `{ notes: string }` — validate `typeof body?.notes === "string"`
(empty string allowed, clears the note), 400 otherwise. `supabase.from("recipes")
.update({ notes }).eq("user_id", user.id).eq("id", recipeId)`, `json({ ok: true },
200)` on success, `400` with the error message on failure — same shape as the other
handlers in this file.

#### 2. Tests

**Files**: `src/pages/api/recipes/[id].test.ts` (extend), `cross-user-authorization.test.ts` (extend)

**Intent**: 401 coverage for `PATCH`, plus proof that A cannot edit B's note.

**Contract**: 401 test follows the same shape as Phase 2's. In
`cross-user-authorization.test.ts`, add a case: A calls `PATCH /api/recipes/[id]`
against B's recipe id; assert the call has no effect (B's stored `notes` is
unchanged when read back via `clientB`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro sync && npm run lint`
- Production build succeeds: `npm run build`
- Integration test project passes: `npm run test -- --project integration`

#### Manual Verification:

- PATCH a note onto a saved recipe and confirm a subsequent `GET /api/recipes` returns
  the updated text.
- PATCH an empty string and confirm the note clears.

---

## Phase 4: UI — Save button and Saved Recipes page

### Overview

Wire the API surface from Phases 2–3 into the product: a "Save" action on the
generation screen, and a new tab listing saved recipes with delete and note editing.

### Changes Required:

#### 1. Install the missing shadcn primitive

**Intent**: Note editing needs a multi-line text input; only `button` and `input`
exist under `src/components/ui/` today.

**Contract**: Run `npx shadcn add textarea` before writing `SavedRecipesList.tsx`.

#### 2. Save button on the generation screen

**File**: `src/components/recipe/RecipeGenerator.tsx`

**Intent**: Let the user persist the recipe they're currently looking at. The button
reflects save-in-progress and saved states, and resets when a new recipe is generated.

**Contract**: Add a `saveState: "idle" | "saving" | "saved"` state (alongside the
existing `recipe`/`recipeError` state at lines 52-53), reset to `"idle"` at the top of
`handleGenerate` (line 94) before the new recipe is fetched. Add `distance` to the
local `RecipeResponse` interface (line 23-28) to match Phase 1's API change. Add a
`handleSave` function that `POST`s to `/api/recipes` with the current `recipe` state
mapped to the save payload shape from Phase 2 (camelCase `components` →
snake_case `paint_id`/`parts`), following the same `fetch`/`extractError` pattern as
`handleGenerate` (lines 94-113). Render a "Save"/"Saved" `Button` near the existing
result block (lines 236-247), disabled while `saveState !== "idle"`, reusing
`extractError` for failures (surfaced via the existing `recipeError` state and
`ServerError` component at line 212).

#### 3. Saved recipes page and list component

**Files**: `src/pages/dashboard/saved-recipes.astro` (new),
`src/components/recipe/SavedRecipesList.tsx` (new)

**Intent**: A new dashboard tab showing every saved recipe with delete and
add/edit-note controls.

**Contract**: The Astro page mirrors `src/pages/dashboard/my-paints.astro:1-17`
exactly (`Layout`, glass card, title, subtitle, `client:load` island, back link) but
mounts `SavedRecipesList`. The React component follows `MyPaintsList.tsx`'s
fetch-on-mount / `loading` / `error` / empty-state structure (lines 25-109), fetching
`GET /api/recipes` instead of `GET /api/paints`. Each list item renders the same
visual shape as `RecipeGenerator.tsx`'s result block (target/result swatches, quality
pill, `formatParts`-style proportions text — reuse or copy that formatting logic) plus
a delete `Button` following `MyPaintsList.tsx`'s `pendingIds`-based per-row disabled
pattern (lines 72-90, 174-183) calling `DELETE /api/recipes/${id}`. For notes: when a
recipe has no note, show an "Add note" `Button` that reveals a `Textarea` + "Save"
`Button" for that row; when it has one, show the note text with an "Edit" `Button`
that reveals the same `Textarea` pre-filled; either path `PATCH`es
`/api/recipes/${id}` with `{ notes }` on save and updates local state on success.

#### 4. Navigation

**File**: `src/pages/dashboard.astro`

**Intent**: Make the new page reachable.

**Contract**: Add one more `<a>` pill following the exact markup/class pattern of the
existing three links (lines 18-35), pointing at `/dashboard/saved-recipes`, labeled
"Saved Recipes".

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro sync && npm run lint`
- Production build succeeds: `npm run build`
- Full test suite passes: `npm run test`

#### Manual Verification:

- On `/dashboard/recipe`: generate a recipe, click Save, confirm the button shows
  "Saved" and disables; pick a new target color and confirm the button resets.
- Navigate to the new "Saved Recipes" tab from `/dashboard` and confirm the just-saved
  recipe appears with correct target color, mix proportions, and quality.
- Add a note, refresh the page, confirm it persisted. Edit it, confirm the change
  persists. Delete the recipe, confirm it disappears from the list.
- Confirm a recipe generated but *not* saved never appears on the list.

---

## Testing Strategy

### Unit Tests:

- No new unit-project tests are needed — this feature adds no new pure functions to
  `src/lib/`. The existing `recipe.test.ts` invariants (owned-paint-only, empty-input
  guard) are untouched since `generateRecipe()` itself doesn't change.

### Integration Tests:

- 401 coverage for every new/changed method: `GET`/`POST /api/recipes`, `DELETE`/
  `PATCH /api/recipes/[id]` (per `test-plan.md` §6.4).
- Cross-user isolation for the new surface, extending
  `cross-user-authorization.test.ts`: A cannot list/see, delete, or edit-note on B's
  recipe (via real routes); the rewritten "owner can, stranger can't" pair for direct
  DB update/delete (Phase 1).
- `recipe.test.ts`: update or add a case confirming `POST /api/recipe` no longer
  inserts anything (e.g. assert no `recipes` insert is issued against the mocked
  Supabase network — if using `@msw/cloudflare`, asserting no matching handler was hit,
  or asserting the response includes `distance` and the test's existing insert-mock
  expectation is removed).

### Manual Testing Steps:

1. Generate → Save → confirm on Saved Recipes tab.
2. Generate the same color twice without saving in between; confirm the `recipes`
   table gains no rows from generation alone.
3. Add, edit, and clear a note; confirm each persists across a page refresh.
4. Delete a saved recipe; confirm it's gone and no error is shown.
5. As a second test user (or via the RLS integration suite), confirm no cross-user
   visibility or mutation is possible.

## Performance Considerations

None beyond what already exists — list size is bounded by how many recipes one user
saves in an MVP with `target_scale: small`; no pagination or indexing changes needed
beyond the existing `recipes_user_id_idx`.

## Migration Notes

The new migration only adds a nullable column and two policies — no backfill is
needed. Existing `recipes` rows (from before this change, when every generation was
auto-saved) satisfy the new shape immediately (`notes` reads as `null`) and appear on
the saved-recipes list from the first deploy, per PRD v2's explicit compatibility
decision.

## References

- Source PRD: `context/foundation/prd-v2.md`
- Roadmap slice: `context/foundation/roadmap.md` (M-2, S-01)
- Shaping notes: `context/foundation/shape-notes.md`
- Test conventions: `context/foundation/test-plan.md` §6.2b, §6.4
- Closest existing implementation: `src/pages/api/paints.ts`, `src/pages/api/paints/[id].ts`, `src/components/paints/MyPaintsList.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, RLS, and the generation-side behavior change

#### Automated

- [x] 1.1 Migration applies cleanly against local Supabase — 37e4489
- [x] 1.2 Type checking passes — 37e4489
- [x] 1.3 Production build succeeds — 37e4489
- [x] 1.4 Unit test project passes — 37e4489
- [x] 1.5 Integration test project passes — 37e4489

#### Manual

- [x] 1.6 Generating a recipe no longer inserts a row — 37e4489
- [x] 1.7 New `notes` column and update/delete policies visible in Supabase Studio — 37e4489

### Phase 2: Save, list, and delete saved recipes

#### Automated

- [x] 2.1 Type checking passes — 44d3a40
- [x] 2.2 Production build succeeds — 44d3a40
- [x] 2.3 Integration test project passes — 44d3a40

#### Manual

- [x] 2.4 `GET /api/recipes` returns hydrated paint names — 44d3a40
- [x] 2.5 Saving via the endpoint creates exactly one new row with expected shape — 44d3a40
- [x] 2.6 Deleting removes the recipe from a subsequent `GET` — 44d3a40

### Phase 3: Notes

#### Automated

- [x] 3.1 Type checking passes — 7e92971
- [x] 3.2 Production build succeeds — 7e92971
- [x] 3.3 Integration test project passes — 7e92971

#### Manual

- [x] 3.4 PATCHing a note updates it on a subsequent `GET` — 7e92971
- [x] 3.5 PATCHing an empty string clears the note — 7e92971

### Phase 4: UI — Save button and Saved Recipes page

#### Automated

- [x] 4.1 Type checking passes — 761bc31
- [x] 4.2 Production build succeeds — 761bc31
- [x] 4.3 Full test suite passes — 761bc31

#### Manual

- [x] 4.4 Save button shows "Saved" and disables; resets on new generation — 761bc31
- [x] 4.5 Saved Recipes tab shows the just-saved recipe with correct details — 761bc31
- [x] 4.6 Note add/edit persists across refresh — 761bc31
- [x] 4.7 Delete removes the recipe from the list — 761bc31
- [x] 4.8 An un-saved generated recipe never appears on the list — 761bc31
