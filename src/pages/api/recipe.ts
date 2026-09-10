import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { generateRecipe, type OwnedPaintInput } from "@/lib/recipe";

interface PaintRow {
  id: string;
  name: string;
  hex: string;
  r: number;
  g: number;
  b: number;
}

interface PaintTypeRef {
  name: string;
}

interface OwnedPaintRow {
  paints: (PaintRow & { paint_types: PaintTypeRef | null }) | null;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface RecipeRequestBody {
  target_paint_id?: unknown;
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
  const body = raw as RecipeRequestBody | null;
  const targetPaintId = body?.target_paint_id;
  if (typeof targetPaintId !== "string" || !targetPaintId) {
    return json({ error: "target_paint_id is required" }, 400);
  }

  const { data: targetPaint, error: targetError } = await supabase
    .from("paints")
    .select("id, name, hex, r, g, b")
    .eq("id", targetPaintId)
    .maybeSingle()
    .overrideTypes<PaintRow, { merge: false }>();

  if (targetError) {
    return json({ error: targetError.message }, 500);
  }
  if (!targetPaint) {
    return json({ error: "Target color not found" }, 404);
  }

  const { data: owned, error: ownedError } = await supabase
    .from("user_paints")
    .select("paints(id, name, hex, r, g, b, paint_types(name))")
    .eq("user_id", user.id)
    .overrideTypes<OwnedPaintRow[], { merge: false }>();

  if (ownedError) {
    return json({ error: ownedError.message }, 500);
  }

  const ownedPaints = owned
    .map((row) => row.paints)
    .filter((paint): paint is NonNullable<typeof paint> => paint !== null);

  if (ownedPaints.length === 0) {
    return json({ error: "You don't have any paints yet." }, 422);
  }

  const paintsById = new Map(ownedPaints.map((paint) => [paint.id, paint]));

  const engineInput: OwnedPaintInput[] = ownedPaints.map((paint) => ({
    id: paint.id,
    r: paint.r,
    g: paint.g,
    b: paint.b,
    typeName: paint.paint_types?.name ?? "",
  }));

  const recipe = generateRecipe({ r: targetPaint.r, g: targetPaint.g, b: targetPaint.b }, engineInput);

  const { error: insertError } = await supabase.from("recipes").insert({
    user_id: user.id,
    target_paint_id: targetPaintId,
    components: recipe.components.map((component) => ({ paint_id: component.paintId, parts: component.parts })),
    result_hex: recipe.resultHex,
    distance: recipe.distance,
  });

  if (insertError) {
    return json({ error: insertError.message }, 500);
  }

  return json(
    {
      targetPaint: { id: targetPaint.id, name: targetPaint.name, hex: targetPaint.hex },
      components: recipe.components.map((component) => {
        const paint = paintsById.get(component.paintId);
        return { paintId: component.paintId, name: paint?.name ?? "", hex: paint?.hex ?? "", parts: component.parts };
      }),
      resultHex: recipe.resultHex,
      quality: recipe.quality,
    },
    200,
  );
};
