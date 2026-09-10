# Generate Color Recipe (S-04) — Plan Brief

> Full plan: `context/changes/generate-color-recipe/plan.md`
> Research: `context/changes/generate-color-recipe/research.md`

## What & Why

Implement S-04 from the roadmap: a logged-in user picks a target color from the paint catalog and gets back a generated recipe — a small ratio of their own owned paints — to mix it. This is the core product hypothesis (PRD success metric: 75% of generated recipes accepted by users), sequenced after S-02 (add-paint-to-list) so there's real owned-paint data to mix against.

## Starting Point

The `paints` catalog (r/g/b + hex, 210 seeded rows) and the owner-scoped `user_paints` table already exist and are RLS-protected (F-01, done). There is no `colors` table — target colors are just `paints` rows. No recipe-generation logic, route, or UI exists yet, and `spectral.js` (the chosen Kubelka-Munk mixing library) isn't installed.

## Desired End State

From `/dashboard/recipe`, a user with ≥1 owned paint picks any catalog color and sees, within a few seconds: the target color, the closest achievable mixed color, a plain-language quality label, and the recipe as simple integer parts (e.g. "2 parts Matt Black : 1 part Ash Grey"). A user with 0 owned paints sees a clear message instead. Every generated recipe is saved to a new per-user history table.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Mixing library | `spectral.js` (Kubelka-Munk) | MIT-licensed, zero deps, works under Cloudflare Workers; only gap is missing TS types, fixed with one ambient `.d.ts`. | Research |
| Combination size | Cap at 2-3 owned paints | Matches how hobbyists actually mix by hand; keeps the search space small regardless of catalog growth. | Plan |
| Search space | Enumerate small integer-part ratios directly (not continuous weights + rounding) | Guarantees the displayed recipe is exactly what was scored — no accuracy loss from a later rounding step. | Plan |
| Match-quality UX | Show a "Great match"/"Approximate match" label via OKLab distance | Sets expectations without adding a second untyped dependency (`color-diff`) for CIEDE2000. | Plan |
| Ratio presentation | Simple integer parts | What a hobbyist can actually act on with a brush/dropper, vs. raw percentages or decimals. | Plan |
| Persistence | Persist full recipe history (`recipes` table) | Explicit user choice, even though the PRD only requires on-demand generation. | Plan |
| History UI scope | Save only — no browsing page in this change | Keeps this slice matched to FR-005/US-01; a history viewer becomes a clean follow-up. | Plan |
| Washes handling | Lower `tintingStrength` (0.4) for translucent paints | Cheap, uses the library's built-in lever, more physically realistic than treating them as opaque. | Plan |
| Target selection UX | Reuse the `PaintPicker` list pattern, single-select | Minimal new UI surface, matches the PRD's immediate step-4→5 flow. | Plan |

## Scope

**In scope:**
- `recipes` table migration (owner-RLS, append-only)
- `spectral.js` dependency + ambient TypeScript declaration
- Recipe-generation engine (`src/lib/recipe.ts`)
- `POST /api/recipe` route
- `/dashboard/recipe` page + `RecipeGenerator` component + dashboard link

**Out of scope:**
- Recipe-history browsing UI
- `color-diff`/CIEDE2000 or any second color-matching dependency
- Custom/non-catalog colors
- Editing or deleting past recipes
- Introducing a test runner/framework

## Architecture / Approach

Server-side only, following existing conventions exactly: a pure engine module (`src/lib/recipe.ts`) does the search and mixing math; a thin Astro API route (mirroring `src/pages/api/paints.ts`) handles auth, fetches data, calls the engine, and persists the result; the UI is a new React island copying the `PaintPicker` fetch/search/filter pattern, with an inline result panel instead of an "Add" action.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data & dependency foundation | `recipes` migration, `spectral.js` installed + typed | Ambient `.d.ts` must cover every call site or lint fails |
| 2. Recipe generation engine | Pure search/mix/score function | Search-space size vs. Workers CPU budget (needs a manual timing check) |
| 3. API route | `POST /api/recipe`, persists results | Empty-owned-list must be a guarded `422`, not a `500` |
| 4. UI | Recipe page + component + dashboard link | None significant — follows an established pattern closely |

**Prerequisites:** F-01 (paint-color-data-schema) and S-02 (add-paint-to-list) — both already done.
**Estimated effort:** ~1-2 sessions across 4 phases.

## Open Risks & Assumptions

- The quality-label threshold (`distance < 0.02` in OKLab) is a documented starting assumption, not a derived color-science constant — expect to tune it against real user feedback tied to the PRD's 75%-acceptance metric.
- The search's ~5,000-mix-call budget per request is expected to be well within Cloudflare Workers CPU limits, but this isn't verified against the actual deployment plan's limit — Phase 2 includes a manual timing check specifically to confirm this.
- `Washes` tintingStrength = 0.4 is a modeling approximation, not derived from real pigment data.

## Success Criteria (Summary)

- A user with owned paints can generate a recipe for any catalog color and see a result (swatch, quality label, integer-parts ratio) within a few seconds.
- A user with no owned paints sees a clear message, never an error or blank result.
- Every generated recipe is saved, scoped privately to the generating user.
