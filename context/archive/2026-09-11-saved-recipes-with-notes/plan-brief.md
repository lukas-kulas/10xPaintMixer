# Saved Recipes with Notes — Plan Brief

> Full plan: `context/changes/saved-recipes-with-notes/plan.md`

## What & Why

Today, every generated color recipe is silently inserted into the database, but the
user has no way to see it again, delete it, or write down what they learned from
mixing it. This plan makes saving explicit (a "Save" button) and adds a "Saved
Recipes" tab with delete and free-text notes — so a recipe used while painting can be
revisited and annotated instead of vanishing after one view.

## Starting Point

`POST /api/recipe` already computes and unconditionally persists a recipe on every
generation, but nothing reads that data back — there's no list view, no delete, no
notes column, and the `recipes` table's RLS explicitly forbids update/delete today
("recipes are never edited or removed in the MVP"). The recipe-mixing algorithm itself
is untouched by this work.

## Desired End State

Generating a recipe no longer writes anything by itself. A "Save" button on the
generation screen persists exactly the recipe on screen (after re-validating the user
still owns every paint in it). A new "Saved Recipes" tab lists everything saved, each
with full mix details, a delete button, and an add/edit note field — all scoped so no
other user can ever see, delete, or annotate it.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Save-time trust | Validate paint ownership server-side, trust the rest of the client payload | Re-running the generation algorithm at save time isn't guaranteed to reproduce the exact result the user is looking at (unordered DB query feeds a tie-break-sensitive search) | Plan |
| Save button lifecycle | Shows "Saved" and disables after success; resets on next generation | Prevents accidental duplicate rows from double-clicks without adding a hard server-side uniqueness constraint | Plan |
| Delete UX | Immediate, no confirmation dialog | Matches the only existing delete pattern in the app (`MyPaintsList`) and PRD's explicit "no undo" decision | Frame (shape-notes.md) |
| Note editing | Per-row "Add/Edit note" toggles a textarea, one field for add and edit | Mirrors the app's existing "no separate edit FR" precedent from farby M-1 | Frame (shape-notes.md) |
| List detail level | Full mix proportions shown inline, no expand/collapse | User needs the ratios in front of them while mixing paint, not hidden behind a click | Frame (shape-notes.md) |
| Test depth | Full 401 + cross-user-authorization coverage for every new endpoint | Matches this project's top-2 named risk (missing auth checks / cross-user leakage) — the new endpoints are the same attack surface | Frame (shape-notes.md) |
| Removed-paint display | Show saved recipes as-is, no "paint no longer owned" flag | Out of the PRD's stated scope; recipes are a historical record, not a live ownership check | Frame (shape-notes.md) |

## Scope

**In scope:**
- Stopping the automatic insert on generation; adding `distance` to its response
- A `notes` column plus update/delete RLS policies on `recipes`
- `GET`/`POST /api/recipes`, `DELETE`/`PATCH /api/recipes/[id]`
- Save button, Saved Recipes page/tab, delete + note UI
- Rewriting the two existing tests that assert recipes can never be updated/deleted

**Out of scope:**
- Sorting, filtering, search, pagination, sharing, or a trash/undo for deletes
- Any change to the recipe-mixing algorithm or its rate limiting
- Flagging recipes that reference a since-removed owned paint

## Architecture / Approach

Mirrors the existing `paints` / `paints/[id]` API pair exactly for `recipes` /
`recipes/[id]`, adding a `PATCH` handler (the codebase's first) for notes. The trickiest
piece is `GET /api/recipes`: since `components` is stored as `jsonb`, paint names can't
be joined in the query — the handler fetches all referenced paint ids in one follow-up
query and hydrates names in application code, the same pattern generation already uses
against the owned-paints list.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Schema & generation behavior | `notes` column, update/delete RLS, generation stops auto-saving, `distance` added to response | Two existing tests assert the opposite of the new behavior and must be rewritten, not just broken |
| 2. Save/list/delete API | `GET`/`POST /api/recipes`, `DELETE /api/recipes/[id]` | Save must validate ownership without re-running a non-deterministic-order search |
| 3. Notes API | `PATCH /api/recipes/[id]` | First PATCH handler in the codebase — no existing pattern to copy verbatim |
| 4. UI | Save button, Saved Recipes page, delete + note editing | Needs a new shadcn `textarea`; no existing inline-edit UI pattern to copy |

**Prerequisites:** local Supabase running for the RLS integration tests; otherwise none
— all other layers (auth, deploy, frontend/backend structure) are already in place.
**Estimated effort:** matches the roadmap's 3-day, after-hours budget for this slice.

## Open Risks & Assumptions

- Assumes `generateRecipe()` is deterministic enough within a single request that the
  client's displayed recipe is safe to persist as-is once ownership is re-validated —
  this is why save doesn't re-run the algorithm (see Critical Implementation Details
  in the full plan).
- Assumes the `paints` catalog is never mutated post-seed (per `test-plan.md` §7), so a
  saved recipe's component paint ids will always resolve to a real catalog row.

## Success Criteria (Summary)

- A user can save a recipe, see it later on its own tab, delete it, and add/edit a
  note on it — with no cross-user leakage.
- Generating a recipe without saving it leaves no trace in the saved-recipes list.
- The existing recipe-generation flow and its test coverage remain green throughout.
