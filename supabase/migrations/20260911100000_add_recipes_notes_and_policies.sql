-- Add notes + update/delete policies to recipes (S-01 / saved-recipes-with-notes)
--
-- Recipes are no longer append-only: users can now edit a free-text note on their
-- own recipe and delete it. This supersedes the "never edited or removed" comment
-- in 20260910120000_create_recipes_schema.sql.

alter table recipes add column notes text;

create policy "Users can update their own recipes"
  on recipes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own recipes"
  on recipes
  for delete
  to authenticated
  using (auth.uid() = user_id);
