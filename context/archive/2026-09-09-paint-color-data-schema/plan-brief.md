# Paint and Color Catalog Data Schema — Plan Brief

> Full plan: `context/changes/paint-color-data-schema/plan.md`

## What & Why

10xPaintMixer needs a database home for paints, target colors, and each user's private "owned paints" list before any add/browse/recipe feature (S-02/S-03/S-04) can be built. This is F-01 on the roadmap — a pure data-schema foundation, no API routes or UI, that every downstream slice depends on.

## Starting Point

Supabase currently has zero application tables — `supabase/` only has `config.toml` from `supabase init`, and `CLAUDE.md` confirms Supabase is auth-only today. Production is a separate hosted Supabase project (not the local Docker instance), and prior production-affecting steps in this repo (secrets, first deploy) were run by the user directly rather than the agent.

## Desired End State

Four tables exist locally and in production: `brands`, `paint_types`, `paints`, `user_paints`. Any authenticated user can read the three catalog/lookup tables but not write to them; each user can only see and modify their own `user_paints` rows. The catalog is pre-seeded with 210 Army Painter paints (from a user-supplied CSV); target-color selection (FR-005) queries `paints` directly rather than a separate table (see Key Decisions — this reverses the original plan's independent `colors` table, dropped during Phase 1 implementation).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Color representation | RGB (r,g,b) + hex, both stored | Feeds future mixing math (RGB) and UI swatches (hex) with no conversion. | Plan |
| Catalog table shape | `paints` keeps its own RGB/hex; `brand`/`type` normalized into their own lookup tables (`brands`, `paint_types`) via FK | Avoids free-text brand/type, keeps color truth local to each paint row (no join needed to render a paint's swatch). | Plan |
| `colors` table | Dropped during Phase 1 implementation | Once seeded it was a byte-for-byte duplicate of `paints` with no FK to anything; target colors now query `paints` directly, matching PRD's `main_goal: low-complexity`. | Implementation |
| Seed data source | User-supplied CSV, 210 real Army Painter paints | Real data needed to meaningfully test the eventual mixing algorithm and hit the 75%-acceptance success criterion; fits the "niska złożoność" MVP budget. | Plan |
| RLS scope | Owner-only CRUD on `user_paints`; catalogs authenticated-read, no client writes | Matches PRD Access Control and the data-privacy guardrail directly. | Plan |
| Migration/production apply | CLI migrations authored & tested locally; user runs `db push` + seed apply against production | Keeps production DB writes human-run, consistent with how this repo handled prod secrets and first deploy. | Plan |
| Uniqueness constraints | Unique paint (name, brand), unique `(user_id, paint_id)` | Prevents catalog dupes and a user adding the same paint twice at the DB level. | Plan |
| ID strategy | UUID (`gen_random_uuid()`) on all tables | Matches `auth.users.id`'s UUID type, which `user_paints.user_id` must reference anyway. | Plan |

## Scope

**In scope:**
- 4 tables, RLS policies, constraints, indexes
- Seed data generation from the provided CSV into `supabase/seed.sql`
- Local verification (schema + seed + manual RLS cross-user test)
- Documented production handoff (schema push + seed apply, user-run)

**Out of scope:**
- API routes or UI for browsing/adding paints (S-02/S-03/S-04)
- Generated TypeScript types for the new tables
- Color-mixing algorithm or any attributes beyond RGB/hex (deferred to S-04)
- Paint editing, soft-delete, or multi-brand seed data beyond Army Painter

## Architecture / Approach

Standard Supabase CLI migration workflow. One migration creates all 4 tables + RLS + constraints; a generated `seed.sql` populates local dev via `supabase db reset`. Because `db push` doesn't carry seed data to production, the plan explicitly splits the production handoff into two user-run steps: push schema, then apply seed SQL directly.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema Migration | 4 tables, constraints, RLS policies, verified locally | Wrong RLS policy silently leaks data across users — the roadmap's flagged top risk for F-01 |
| 2. Seed Data | `seed.sql` generated from the CSV, 1/3/210 rows verified locally | CSV→SQL transformation error (bad FK resolution, BOM not stripped) |
| 3. Production Handoff & RLS Verification | Local two-user RLS proof; documented production push + seed apply | `db push` not carrying seed data is easy to miss — plan calls it out explicitly |

**Prerequisites:** None — Supabase project already provisioned (local `supabase init` done, production project live per `deploy-plan.md`).
**Estimated effort:** ~1 session across 3 phases (schema-only change, no application code).

## Open Risks & Assumptions

- CSV data (Army Painter RGB/hex values) is assumed accurate as supplied — not independently verified against Army Painter's official color references.
- Target-color names shown for FR-005 will be paint SKU names (e.g. "Matt Black") rather than generic color names, since target colors are just paints — accepted tradeoff, not a blocker.
- Production seed apply requires a direct Postgres connection string (via `psql`) since `db push` won't carry it — user will need that from the Supabase dashboard when running Phase 3.

## Success Criteria (Summary)

- All 4 tables exist locally and in production with RLS enabled and verified to isolate users from each other.
- Local catalog contains exactly 1 brand, 3 paint types, 210 paints, matching the source CSV.
- No client role (other than the owning user, for `user_paints`) can write to any table.
