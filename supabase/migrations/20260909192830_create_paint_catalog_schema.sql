-- Paint and color catalog schema (F-01 / paint-color-data-schema)
--
-- Four tables:
--   brands, paint_types  — small lookup tables, authenticated-read only
--   paints                — paint catalog (FR-002), FK to brands/paint_types, authenticated-read only;
--                            also serves as the target-color source for FR-005 (no separate `colors`
--                            table — target colors are just paint colors picked from this catalog)
--   user_paints          — each user's owned-paints list (FR-002/003/004), owner-only RLS

-- ============================================================
-- brands
-- ============================================================

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table brands enable row level security;

create policy "Authenticated users can read brands"
  on brands
  for select
  to authenticated
  using (true);

-- ============================================================
-- paint_types
-- ============================================================

create table paint_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table paint_types enable row level security;

create policy "Authenticated users can read paint_types"
  on paint_types
  for select
  to authenticated
  using (true);

-- ============================================================
-- paints (paint catalog; also the target-color source for FR-005)
-- ============================================================

create table paints (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_id uuid not null references brands (id) on delete restrict,
  type_id uuid not null references paint_types (id) on delete restrict,
  r smallint not null check (r between 0 and 255),
  g smallint not null check (g between 0 and 255),
  b smallint not null check (b between 0 and 255),
  hex text not null check (hex ~* '^#[0-9a-f]{6}$'),
  unique (name, brand_id)
);

create index paints_brand_id_idx on paints (brand_id);
create index paints_type_id_idx on paints (type_id);

alter table paints enable row level security;

create policy "Authenticated users can read paints"
  on paints
  for select
  to authenticated
  using (true);

-- ============================================================
-- user_paints (private, owner-only)
-- ============================================================

create table user_paints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  paint_id uuid not null references paints (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, paint_id)
);

create index user_paints_user_id_idx on user_paints (user_id);

alter table user_paints enable row level security;

create policy "Users can read their own paints"
  on user_paints
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own paints"
  on user_paints
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own paints"
  on user_paints
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own paints"
  on user_paints
  for delete
  to authenticated
  using (auth.uid() = user_id);
