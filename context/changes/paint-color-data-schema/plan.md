# Paint and Color Catalog Data Schema Implementation Plan

## Overview

Add the foundational Supabase schema for 10xPaintMixer: a normalized catalog of paints (with brand and type lookups) and a private per-user "owned paints" list scoped by Row Level Security. Seed the catalog from a user-supplied CSV of 210 Army Painter paints. Target-color selection (FR-005) draws directly from the same `paints` catalog rather than a separate `colors` table — see "Design change during implementation" below. This is F-01 on the roadmap — a foundation with no API routes or UI, unlocking S-02 (add paint to list), S-03 (view/remove), and S-04 (generate recipe).

### Design change during implementation

The original plan (below, left as historical record where it describes `colors`) called for an independent `colors` table for target-color selection. During Phase 1 implementation, once seeded, `colors` turned out to be a byte-for-byte duplicate of `paints` (same name/r/g/b/hex, 210 rows, derived from the same CSV with no dedup collapse since the source had zero duplicate hex values) with no FK to anything. Per user decision during implementation, `colors` was dropped: target-color choices for FR-005/S-04 are queried directly from `paints`. This removes an entire redundant table and its seed-sync burden, consistent with the PRD's `main_goal: low-complexity`. The final schema is **4 tables**: `brands`, `paint_types`, `paints`, `user_paints`.

## Current State Analysis

- `supabase/` contains only `config.toml` (from `supabase init`) and `.gitignore` — no `migrations/` folder, no `seed.sql`, no application tables. `CLAUDE.md` and the roadmap Baseline both confirm Supabase is auth-only today.
- `src/lib/supabase.ts` builds a per-request client from `astro:env/server` vars; no domain/database code exists in `src/` yet (no `src/db/`, no generated types).
- Production is a **hosted cloud Supabase project** (`context/deployment/deploy-plan.md`), not the local Docker instance. Production secrets and the one interactive `wrangler deploy` step were run by the user directly, not the agent — establishing a precedent that production-affecting actions in this repo are human-run.
- `supabase/config.toml` has `[db.seed]` with `sql_paths = ["./seed.sql"]` — this file is applied automatically on local `supabase db reset`, but `supabase db push` (the command used to sync schema to a remote/hosted project) only pushes `migrations/`, never `seed.sql`. This is a real gap the implementer must bridge for production (see Critical Implementation Details).
- Seed source is `context/changes/paint-color-data-schema/paints.csv.csv`: 211 lines (210 data rows + header), columns `Type,Name,HEX,RGB,R,G,B` (UTF-8 with BOM). Verified: no duplicate `Name` values, no duplicate `HEX` values, no empty fields. Distinct `Type` values present: `Standard` (175), `Metallic` (18), `Washes` (17). All rows are a single brand: Army Painter (not a CSV column — supplied by the user directly).

## Desired End State

Four tables exist in both the local and production Supabase Postgres instances: `brands`, `paint_types`, `paints`, `user_paints`. `user_paints` is RLS-scoped so each authenticated user sees and modifies only their own rows; `brands`/`paint_types`/`paints` are readable by any authenticated user and not writable by any client role. Local `supabase db reset` seeds 1 brand row, 3 type rows, and 210 paint rows. Target-color selection (FR-005) queries `paints` directly rather than a separate table. Verified by: migrations applying cleanly, and a manual two-user RLS check showing cross-user isolation.

### Key Discoveries:

- `supabase/config.toml:60-65` — `[db.seed]` block, confirming the `seed.sql` local-only convention.
- `context/deployment/deploy-plan.md:22-27` — production is a separate hosted project; prior production-affecting steps (secrets, first deploy) were run by the user in their own terminal, not the agent's sandboxed shell.
- CSV has `R`, `G`, `B` as already-split integer columns alongside the combined `RGB` string and `HEX` — no string parsing needed, just column mapping.

## What We're NOT Doing

- No API routes or UI for browsing/adding paints — that's S-02/S-03/S-04.
- No generated TypeScript types (`supabase gen types typescript`) — deferred to whichever slice first needs typed table access.
- No paint editing or soft-delete — catalogs are static reference data for MVP; only seeded/reseeded via migration+seed, never mutated by the app.
- No color-mixing algorithm or attributes beyond RGB/hex — that decision is explicitly deferred to S-04's own `/10x-plan`.
- No support for multiple brands' worth of data beyond what's needed to prove the schema (only Army Painter is seeded now); the `brands` table is structured to hold more later without a migration.
- No `updated_at` / edit-tracking columns on catalog tables — they're seeded once and not mutated by the app in MVP.

## Implementation Approach

Standard Supabase CLI migration workflow: author SQL migrations locally under `supabase/migrations/`, verify against the local Postgres instance via `supabase db reset` (which also runs `seed.sql`), then hand off two production steps to the user — `supabase db push` for schema, and a separate manual application of the seed SQL against production (since `db push` doesn't carry seed data). Seed data is generated once from the CSV into `supabase/seed.sql`; the CSV itself stays in the change folder as the source-of-truth reference, not moved into `supabase/`.

## Critical Implementation Details

### Timing & lifecycle

`supabase db push` only applies files under `supabase/migrations/`; it does not run `supabase/seed.sql`. Since production needs the same catalog data as local dev, Phase 3 must give the user a command to apply `seed.sql` to production directly (e.g. `psql "<connection-string>" -f supabase/seed.sql`, using the connection string from the Supabase dashboard) — not just re-run `supabase db push`. Do this only after the schema migration has been pushed, since `seed.sql` references the tables the migration creates.

## Phase 1: Schema Migration

### Overview

Create the four tables, their constraints, and RLS policies via one Supabase CLI migration, verified against the local Postgres instance.

### Changes Required:

#### 1. Lookup tables: `brands`, `paint_types`

**File**: `supabase/migrations/<timestamp>_create_paint_catalog_schema.sql`

**Intent**: Two small reference tables so a paint's brand and type are normalized FKs rather than free text, per the confirmed table shape.

**Contract**: `brands(id uuid pk default gen_random_uuid(), name text not null unique)`. `paint_types(id uuid pk default gen_random_uuid(), name text not null unique)`. RLS enabled on both; a single `SELECT` policy allowing any authenticated user (`auth.role() = 'authenticated'`); no `INSERT`/`UPDATE`/`DELETE` policy for any client role (writes only via migration/seed, which run as the Postgres owner and bypass RLS).

#### 2. `paints` table

**File**: same migration file

**Intent**: The paint catalog (FR-002), each row carrying its own RGB/hex plus FKs to `brands` and `paint_types`.

**Contract**: `paints(id uuid pk default gen_random_uuid(), name text not null, brand_id uuid not null references brands(id) on delete restrict, type_id uuid not null references paint_types(id) on delete restrict, r smallint not null, g smallint not null, b smallint not null, hex text not null, unique(name, brand_id))`. CHECK constraints: `r`, `g`, `b` each `BETWEEN 0 AND 255`; `hex` matches `^#[0-9A-Fa-f]{6}$`. Index on `brand_id` and `type_id` (FK columns benefit from an index for RLS/join performance even at this scale — cheap to add now). Same RLS shape as the lookup tables. This table doubles as the target-color source for FR-005/S-04 (no separate `colors` table — see "Design change during implementation" above).

#### 3. `user_paints` table

**File**: same migration file

**Intent**: The private, per-user "owned paints" list (FR-002/FR-003/FR-004) — the only table users can write to.

**Contract**: `user_paints(id uuid pk default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, paint_id uuid not null references paints(id) on delete restrict, created_at timestamptz not null default now(), unique(user_id, paint_id))`. RLS enabled; four policies (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) all gated by `auth.uid() = user_id` (`WITH CHECK (auth.uid() = user_id)` on `INSERT`/`UPDATE`). Index on `user_id` (FK to `auth.users`, and the column every RLS check and app query filters on).

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against the local instance: `npx supabase db reset`
- `npx astro sync && npm run lint` still passes (no drift from schema addition — no app code touches these tables yet)

#### Manual Verification:

- Open Supabase Studio locally (`npx supabase status` for the URL) and confirm all 4 tables exist with the expected columns and RLS enabled (shield icon / `rowsecurity = true`).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Seed Data

### Overview

Transform `paints.csv.csv` into `supabase/seed.sql` and verify it loads correctly on a local reset.

### Changes Required:

#### 1. Generate `supabase/seed.sql` from the CSV

**File**: `supabase/seed.sql`

**Intent**: Populate `brands` (1 row: "Army Painter"), `paint_types` (3 rows: the distinct `Type` values found in the CSV — `Standard`, `Metallic`, `Washes`), and `paints` (210 rows, one per CSV row, `brand_id`/`type_id` resolved via subselect on name).

**Contract**: Plain SQL `INSERT` statements (or `INSERT ... SELECT` with a `VALUES` list joined to `brands`/`paint_types` by name to resolve FKs), generated once from the CSV — implementer's choice of generation method (script, spreadsheet formula, hand-written), the committed artifact is the resulting `seed.sql`. Strip the CSV's UTF-8 BOM on the header row when parsing.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` completes without error and seeds all rows
- Row counts match expectations: `select count(*) from brands` = 1, `select count(*) from paint_types` = 3, `select count(*) from paints` = 210 (run via `npx supabase db reset` output or `psql`/Studio SQL editor against the local instance)

#### Manual Verification:

- Spot-check 3–5 rows in Studio's table editor: paint name/brand/type/hex look correct and match the source CSV.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Production Handoff & RLS Verification

### Overview

Prove the RLS isolation guarantee locally with two real accounts, then hand the user the two production steps (schema push + seed apply) this plan deliberately keeps human-run.

### Changes Required:

#### 1. Manual RLS cross-user check (local)

**Intent**: Confirm the PRD's privacy guardrail actually holds at the database level, not just in policy text — this is the risk the roadmap flags as F-01's biggest.

**Contract**: No code change. Using the local instance: sign up two test users via the existing auth flow, insert one `user_paints` row per user (as each authenticated user, via the Supabase client or SQL editor "run as" role), then confirm each user's `select * from user_paints` returns only their own row, and that a client attempt to `insert`/`update`/`delete` a catalog table (`paints`, `brands`, `paint_types`) as an authenticated (non-service) role is rejected by RLS.

#### 2. Production migration + seed apply (user-run)

**Intent**: Get the schema and seed data onto the hosted project, consistent with this repo's existing precedent of running production-affecting commands from the user's own terminal rather than the agent's sandbox.

**Contract**: Document (in the plan's References or a short handoff note) the two commands the user runs: `npx supabase link --project-ref <ref>` then `npx supabase db push` for schema; then apply `supabase/seed.sql` directly against production (e.g. `psql "<connection-string-from-dashboard>" -f supabase/seed.sql`) since `db push` does not carry seed data. No agent-run production writes in this phase.

### Success Criteria:

#### Automated Verification:

- N/A — this phase is verification + a documented handoff, not new automated surface.

#### Manual Verification:

- Two-user RLS isolation confirmed locally as described above.
- Catalog tables confirmed read-only to an authenticated non-service client (insert attempt fails with an RLS/policy error).
- User confirms production schema push and seed apply completed (row counts in the hosted project's Studio match local: 1/3/210).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no test runner is configured in this project (per `CLAUDE.md`), and this change has no application code, only schema/SQL.

### Integration Tests:

- N/A for this phase; RLS behavior is verified manually per Phase 3 (a future slice with API routes may add automated RLS tests once there's application code to test through).

### Manual Testing Steps:

1. Studio table/column/RLS spot-check after Phase 1.
2. Row-count and data spot-check after Phase 2.
3. Two-user RLS isolation test after Phase 3.

## Performance Considerations

Indexes on `paints.brand_id`, `paints.type_id`, and `user_paints.user_id` cover the join/filter patterns every downstream slice will use (catalog browse by brand/type, "my paints" lookup). At the target scale (small user base, ~210-row catalogs), no further tuning is warranted.

## Migration Notes

`supabase db push` only syncs `supabase/migrations/`, not `supabase/seed.sql` — production seeding is a separate manual step (see Phase 3, Critical Implementation Details). Re-running the seed script is not idempotent as written (plain `INSERT`s) — if production ever needs a re-seed, either truncate first or the implementer should add `ON CONFLICT DO NOTHING` on the seed inserts before re-running; not needed for the initial seed since tables start empty.

## References

- Roadmap: `context/foundation/roadmap.md` (F-01: paint-color-data-schema)
- PRD: `context/foundation/prd.md` (FR-002–FR-005, Access Control)
- Deployment precedent: `context/deployment/deploy-plan.md`
- Seed source: `context/changes/paint-color-data-schema/paints.csv.csv`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schema Migration

#### Automated

- [x] 1.1 Migration applies cleanly against the local instance (`npx supabase db reset`) — ebe01ce
- [x] 1.2 `npx astro sync && npm run lint` still passes — ebe01ce

#### Manual

- [x] 1.3 Studio confirms all 4 tables exist with expected columns and RLS enabled — ebe01ce

### Phase 2: Seed Data

#### Automated

- [x] 2.1 `npx supabase db reset` completes without error and seeds all rows — 8a187d9
- [x] 2.2 Row counts match expectations (1 / 3 / 210) — 8a187d9

#### Manual

- [x] 2.3 Spot-check 3–5 seeded paint rows against the source CSV — 8a187d9

### Phase 3: Production Handoff & RLS Verification

#### Manual

- [x] 3.1 Two-user RLS isolation confirmed locally
- [x] 3.2 Catalog tables confirmed read-only to an authenticated non-service client
- [x] 3.3 Production schema push and seed apply completed, row counts match local
