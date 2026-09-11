import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { QUALITY_THRESHOLD } from "@/lib/recipe";

interface RecipeRow {
  id: string;
  target_paint_id: string;
  components: { paint_id: string; parts: number }[];
  result_hex: string;
  distance: number;
  notes: string | null;
  created_at: string;
}

interface PaintRow {
  id: string;
  name: string;
  hex: string;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 500);
  }

  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: recipes, error: recipesError } = await supabase
    .from("recipes")
    .select("id, target_paint_id, components, result_hex, distance, notes, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .overrideTypes<RecipeRow[], { merge: false }>();

  if (recipesError) {
    return json({ error: recipesError.message }, 500);
  }

  if (recipes.length === 0) {
    return json([], 200);
  }

  const paintIds = new Set<string>();
  for (const recipe of recipes) {
    paintIds.add(recipe.target_paint_id);
    for (const component of recipe.components) {
      paintIds.add(component.paint_id);
    }
  }

  const { data: paints, error: paintsError } = await supabase
    .from("paints")
    .select("id, name, hex")
    .in("id", [...paintIds])
    .overrideTypes<PaintRow[], { merge: false }>();

  if (paintsError) {
    return json({ error: paintsError.message }, 500);
  }

  const paintsById = new Map(paints.map((paint) => [paint.id, paint]));

  const result = recipes.map((recipe) => {
    const targetPaint = paintsById.get(recipe.target_paint_id);
    return {
      id: recipe.id,
      targetPaint: { id: recipe.target_paint_id, name: targetPaint?.name ?? "", hex: targetPaint?.hex ?? "" },
      components: recipe.components.map((component) => {
        const paint = paintsById.get(component.paint_id);
        return {
          paintId: component.paint_id,
          name: paint?.name ?? "",
          hex: paint?.hex ?? "",
          parts: component.parts,
        };
      }),
      resultHex: recipe.result_hex,
      distance: recipe.distance,
      quality: recipe.distance < QUALITY_THRESHOLD ? "great" : "approximate",
      notes: recipe.notes,
      createdAt: recipe.created_at,
    };
  });

  return json(result, 200);
};

interface SaveRecipeBody {
  target_paint_id?: unknown;
  components?: unknown;
  result_hex?: unknown;
  distance?: unknown;
}

interface ComponentInput {
  paint_id: string;
  parts: number;
}

function parseComponents(raw: unknown): ComponentInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const components: ComponentInput[] = [];
  for (const entry of raw) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { paint_id?: unknown }).paint_id !== "string" ||
      !(entry as { paint_id: string }).paint_id ||
      typeof (entry as { parts?: unknown }).parts !== "number"
    ) {
      return null;
    }
    components.push({
      paint_id: (entry as { paint_id: string }).paint_id,
      parts: (entry as { parts: number }).parts,
    });
  }
  return components;
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 500);
  }

  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const raw: unknown = await context.request.json().catch(() => null);
  const body = raw as SaveRecipeBody | null;

  const targetPaintId = body?.target_paint_id;
  if (typeof targetPaintId !== "string" || !targetPaintId) {
    return json({ error: "target_paint_id is required" }, 400);
  }

  const components = parseComponents(body.components);
  if (!components) {
    return json({ error: "components must be a non-empty array of { paint_id, parts }" }, 400);
  }

  const resultHex = body.result_hex;
  if (typeof resultHex !== "string" || !resultHex) {
    return json({ error: "result_hex is required" }, 400);
  }

  const distance = body.distance;
  if (typeof distance !== "number") {
    return json({ error: "distance is required" }, 400);
  }

  const componentPaintIds = [...new Set(components.map((component) => component.paint_id))];

  const { data: owned, error: ownedError } = await supabase
    .from("user_paints")
    .select("paint_id")
    .eq("user_id", user.id)
    .in("paint_id", componentPaintIds)
    .overrideTypes<{ paint_id: string }[], { merge: false }>();

  if (ownedError) {
    return json({ error: ownedError.message }, 500);
  }

  if (owned.length < componentPaintIds.length) {
    return json({ error: "One or more paints in this recipe are no longer in your list." }, 400);
  }

  const { error: insertError } = await supabase.from("recipes").insert({
    user_id: user.id,
    target_paint_id: targetPaintId,
    components,
    result_hex: resultHex,
    distance,
  });

  if (insertError) {
    return json({ error: insertError.message }, 400);
  }

  return json({ ok: true }, 200);
};
