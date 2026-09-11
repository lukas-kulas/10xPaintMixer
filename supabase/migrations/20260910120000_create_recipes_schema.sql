-- Recipe history schema (S-04 / generate-color-recipe)
--
-- Log of saved recipes, owner-only RLS. Originally append-only ("never edited or
-- removed"); 20260911100000_add_recipes_notes_and_policies.sql adds a `notes`
-- column plus owner-scoped update/delete policies (S-01 / saved-recipes-with-notes).

create table recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_paint_id uuid not null references paints (id) on delete restrict,
  components jsonb not null,
  result_hex text not null check (result_hex ~* '^#[0-9a-f]{6}$'),
  distance real not null,
  created_at timestamptz not null default now()
);

create index recipes_user_id_idx on recipes (user_id);

alter table recipes enable row level security;

create policy "Users can read their own recipes"
  on recipes
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own recipes"
  on recipes
  for insert
  to authenticated
  with check (auth.uid() = user_id);
