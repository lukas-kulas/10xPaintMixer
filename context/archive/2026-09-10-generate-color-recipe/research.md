---
date: 2026-09-10T20:12:01+02:00
researcher: lukas.qlas
git_commit: 7b2b1b21c44c664f5eb2e2d299a0413d8f4adf21
branch: master
repository: 10xPaintMixer
topic: "Is spectral.js compatible with this codebase for implementing S-04 (generate-color-recipe)?"
tags: [research, codebase, spectral.js, s-04, color-mixing, cloudflare-workers, typescript]
status: complete
last_updated: 2026-09-10
last_updated_by: lukas.qlas
---

# Research: spectral.js compatibility with the codebase for S-04

**Date**: 2026-09-10T20:12:01+02:00
**Researcher**: lukas.qlas
**Git Commit**: 7b2b1b21c44c664f5eb2e2d299a0413d8f4adf21
**Branch**: master
**Repository**: 10xPaintMixer

## Research Question

Review the codebase and decide whether `context/changes/generate-color-recipe/spectral-js-api-reference.md` (the `spectral.js` library) is compatible with it, in order to implement S-04 from `context/foundation/roadmap.md`.

## Summary

**Yes, compatible — with one required accommodation.** `spectral.js` v3.0.0 is a zero-dependency UMD bundle (pure math on arrays, no Node built-ins, no DOM dependency), so it runs fine under this project's Cloudflare Workers (`workerd`) deployment regardless of the `nodejs_compat` flag. Its `Color` constructor accepts either hex or `[r,g,b]` directly, and the `paints` table already stores both (`r`, `g`, `b` smallint columns **and** `hex`), so no data-shape adapter is needed on the way in.

The one real friction point: **`spectral.js` ships no TypeScript types**, and this project's ESLint config uses `typescript-eslint`'s `strictTypeChecked` + `stylisticTypeChecked` tiers, which flag `no-unsafe-assignment`/`no-unsafe-call`/`no-unsafe-member-access` on anything inferred as `any`. Importing the package untyped will fail `npm run lint`, which CI runs on every push/PR to `master`. This needs a small ambient module declaration (or a thin typed wrapper) before `spectral.js` calls can land — see Open Questions / recommendation below.

Beyond that, S-04 still needs a hand-rolled ratio-search on top of `spectral.mix()` (confirmed already in `srs-review-session.md`) — the library mixes colors given weights, it doesn't search for weights. The existing schema and API-route patterns (`src/pages/api/paints.ts`, `[id].ts`) give a clear template for where that search would live.

## Detailed Findings

### Runtime compatibility (Cloudflare Workers / workerd)

- `spectral.js@3.0.0`'s npm metadata declares `"main": "spectral.js"`, an **empty `dependencies` object**, and no `type`/`module`/`exports`/`types`/`engines` fields (verified directly against the npm registry JSON, not just the README).
- The actual bundle is a UMD wrapper (`typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) : ...`), containing only class/array/math logic (reflectance curves, matrix conversions for OKLab/XYZ). No `fs`, `crypto`, `Buffer`, or any other Node built-in is referenced.
- This means it needs no polyfill and doesn't depend on the project's `nodejs_compat` compatibility flag (`wrangler.jsonc:5`) at all — it would run identically in a browser, Node, or `workerd`. Vite (which Astro 6 uses under the hood) pre-bundles CJS/UMD deps into ESM automatically, so the lack of an `exports`/`module` field is a non-issue for the build.
- Conclusion: no runtime blocker for the Cloudflare adapter (`astro.config.mjs:16`, `@astrojs/cloudflare`).

### TypeScript / lint compatibility — the one real gap

- `tsconfig.json:2` extends `astro/tsconfigs/strict`.
- `eslint.config.mjs:16` extends `tseslint.configs.strictTypeChecked` and `stylisticTypeChecked` — the strictest typescript-eslint tier, which includes `no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-argument`, `no-unsafe-return`.
- `spectral.js` ships **no `.d.ts` files and no `types`/`typings` field** (confirmed against the registry metadata). A bare `import * as spectral from "spectral.js"` (or `import spectral from "spectral.js"`) will resolve to an implicit `any` module.
- Every subsequent call — `new spectral.Color(...)`, `spectral.mix(...)`, reading `.OKLab`/`.tintingStrength` off the result — would trip the `no-unsafe-*` rules above under `strictTypeChecked`.
- `CLAUDE.md`'s own CI command (`npx astro sync && npm run lint && npm run build`) runs this lint config on every push/PR to `master`, so this isn't a style nit — it will hard-fail CI as-is.
- **Fix is small and standard**: add an ambient module declaration, e.g. `src/types/spectral.d.ts`:
  ```ts
  declare module "spectral.js" {
    export class Color {
      constructor(input: string | number[]);
      R: number[];
      sRGB: number[];
      OKLab: number[];
      OKLCh: number[];
      tintingStrength: number;
      inGamut(opts?: { epsilon?: number }): boolean;
      toGamut(opts?: { method?: "clip" | "map" }): Color;
      toString(opts?: { format?: string; method?: string }): string;
    }
    export function mix(...args: [Color, number][]): Color;
  }
  ```
  This is a one-time, contained cost — worth calling out explicitly in `/10x-plan` as a task, not something to discover mid-implementation.

### Data shape fit (F-01 schema → spectral.js input)

- `supabase/migrations/20260909192830_create_paint_catalog_schema.sql:48-58` — the `paints` table stores **both** `r, g, b` (smallint, 0–255) **and** `hex` (`text`, regex-checked `^#[0-9a-f]{6}$`) per row. `spectral.js`'s `Color` constructor accepts either `[r,g,b]` or a hex string directly — no conversion/adapter code is needed between the DB row and the library's input shape.
- Per the migration's own header comment (`...sql:1-8`), there is **no separate `colors` table** — target colors for FR-005 are just rows from the same `paints` catalog. This matches `spectral.js` needs exactly: both "target color" and "owned paint" inputs are the same shape (`paints` rows), so the same `Color` construction path serves both.
- `user_paints` (`...sql:75-81`) is the owner-scoped join table (`user_id`, `paint_id`), RLS-restricted to `auth.uid() = user_id` — this is what a recipe-generation route would join against to get the candidate mixing set for the current user.
- Seed data (`supabase/seed.sql:1-4`): 210 paints, 3 `paint_types` (`Metallic`, `Standard`, `Washes`), single brand. A given user's owned-paint set will realistically be a small fraction of that — comfortably small enough for a bounded ratio search (grid/simplex/hill-climbing) to finish within the NFR's "few seconds" budget entirely server-side.
- Note (not a compatibility blocker, but worth flagging for `/10x-plan`): `Washes` are typically translucent/diluted paints, which behave differently under Kubelka-Munk mixing than opaque `Standard`/`Metallic` paints. `spectral.js` exposes `tintingStrength` per `Color` precisely for this kind of case — worth deciding whether Washes need a different default `tintingStrength` or should be excluded from the recipe search, as a modeling decision rather than a library limitation.

### Where this would be wired in (existing route/pattern conventions)

- `src/pages/api/paints.ts:26-68` (`GET`) and `:74-101` (`POST`) show the established Astro API route pattern: build the Supabase client via `createClient(context.request.headers, context.cookies)` (`src/lib/supabase.ts`), return `500` if `null` (not configured), require `context.locals.user` and return `401` otherwise, then do the Supabase query and respond via a local `json(body, status)` helper.
- `src/pages/api/paints/[id].ts:11-34` (`DELETE`) shows the same pattern for a dynamic-segment route.
- A new S-04 route (e.g. `src/pages/api/recipe.ts` or `src/pages/api/paints/recipe.ts`) would follow this exact shape: auth-gate, fetch the user's `user_paints` joined to `paints` (candidate mixing set) plus the target `paints` row by id, run the `spectral.js`-backed ratio search server-side, and return the resulting recipe as JSON — consistent with this project's form-POST-for-mutations / JSON-for-data-reads split noted in `CLAUDE.md`.
- No test runner is configured in this project (confirmed in `CLAUDE.md` and no test script in `package.json`), so the ratio-search logic's correctness will need to be verified by manual exercise (per the project's UI-testing guardrail) rather than a unit-test suite, unless a test runner is introduced as part of this change.

## Code References

- `package.json:14-35` - current dependencies; `spectral.js` is not yet installed
- `astro.config.mjs:10-16` - `output: "server"`, Cloudflare adapter config
- `wrangler.jsonc:4-5` - `compatibility_flags: ["nodejs_compat"]` (not required by spectral.js, but present regardless)
- `tsconfig.json:1-2` - `astro/tsconfigs/strict` base
- `eslint.config.mjs:16` - `strictTypeChecked` + `stylisticTypeChecked` — source of the untyped-import friction
- `supabase/migrations/20260909192830_create_paint_catalog_schema.sql:48-58` - `paints` table: `r,g,b` + `hex` columns
- `supabase/migrations/20260909192830_create_paint_catalog_schema.sql:75-97` - `user_paints` table + owner-only RLS policies
- `supabase/seed.sql:1-4` - seed volume: 210 paints, 3 types, 1 brand
- `src/pages/api/paints.ts:26-68` - GET route pattern (auth gate, Supabase query, JSON response)
- `src/pages/api/paints.ts:74-101` - POST route pattern (body parsing, upsert)
- `src/pages/api/paints/[id].ts:11-34` - dynamic-segment DELETE route pattern
- `src/lib/supabase.ts` - `createClient()` factory, returns `null` when unconfigured (per `CLAUDE.md`)

## Architecture Insights

- This is a small, low-complexity MVP (`main_goal: low-complexity` in `roadmap.md:8`) — the existing API routes are intentionally thin (auth check → single/double Supabase query → JSON), and S-04 should follow that same shape rather than introducing new architectural layers (e.g., no need for a separate service/worker process — the ratio search can run inline in the API route handler, given the small candidate-paint counts).
- The project already treats "target color" and "owned paint" as the same underlying entity (`paints` rows) rather than modeling them as separate concepts — this simplifies S-04's data access to one table plus the join table, and means `spectral.Color` construction logic can be shared/reused for both inputs.
- Untyped third-party JS dependencies are a new situation for this codebase — every current dependency (`@supabase/supabase-js`, `react`, `astro`, shadcn/ui pieces, etc.) ships its own types. `spectral.js` will be the first exception, so the ambient-declaration pattern introduced for it may be worth documenting in `CLAUDE.md` if more untyped libraries get added later (e.g. `color-diff`, also flagged as untyped in the `srs-review-session.md` combo).

## Historical Context (from prior changes)

- `context/changes/generate-color-recipe/srs-review-session.md` - prior library-selection research (2026-09-10): chose `spectral.js` (MIT) over `mixbox` (CC-BY-NC-4.0, license risk) for pigment mixing, paired with `color-diff` (BSD-3-Clause) for CIEDE2000 ΔE match scoring; concluded no off-the-shelf package exists for the ratio-search step itself — confirms this research's finding that a hand-rolled search is still required on top of `spectral.js`.
- `context/changes/generate-color-recipe/spectral-js-api-reference.md` - detailed API reference for `spectral.js` (Color class, `mix()`/`palette()`/`gradient()`), written earlier this session directly from the library's README — this research file builds on it by checking that API against the actual codebase (schema, build tooling, lint config) rather than the library in isolation.
- `context/archive/2026-09-09-paint-color-data-schema/` (F-01) - established the `paints`/`user_paints` schema this research relies on; no separate `colors` table was a deliberate decision recorded there per the migration's header comment.

## Related Research

- `context/changes/generate-color-recipe/srs-review-session.md` - library selection (spectral.js vs. mixbox, color-diff, ratio-search prior art)
- `context/changes/generate-color-recipe/spectral-js-api-reference.md` - spectral.js API detail

## Open Questions

- Should `color-diff` (also untyped, per the prior research) be added now for match scoring, or should S-04's `/10x-plan` decide to compute ΔE directly from `spectral.js`'s own `OKLab`/`OKLCh` output instead of pulling in a second untyped dependency? Either works technically; it's a scope/dependency-count tradeoff for `/10x-plan` to make.
- Should `Washes` (translucent paints) be excluded from the recipe search, or handled via a lower default `tintingStrength`? Not a library limitation — a modeling decision, flagged here so it doesn't get missed.
- What's the concrete ratio-search algorithm and its iteration/time budget against the NFR ("result within a few seconds")? `srs-review-session.md` suggests grid/simplex search or hill-climbing but doesn't pick one — this is `/10x-plan`'s job, informed by the ~small owned-paint-count reality confirmed here via the seed data.
