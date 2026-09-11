import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const DELETE: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 500);
  }

  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const recipeId = context.params.id;
  if (typeof recipeId !== "string" || !recipeId) {
    return json({ error: "id is required" }, 400);
  }

  const { error } = await supabase.from("recipes").delete().eq("user_id", user.id).eq("id", recipeId);

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ ok: true }, 200);
};

interface PatchRecipeBody {
  notes?: unknown;
}

export const PATCH: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 500);
  }

  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const recipeId = context.params.id;
  if (typeof recipeId !== "string" || !recipeId) {
    return json({ error: "id is required" }, 400);
  }

  const raw: unknown = await context.request.json().catch(() => null);
  const body = raw as PatchRecipeBody | null;
  const notes = body?.notes;
  if (typeof notes !== "string") {
    return json({ error: "notes must be a string" }, 400);
  }

  const { error } = await supabase.from("recipes").update({ notes }).eq("user_id", user.id).eq("id", recipeId);

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ ok: true }, 200);
};
