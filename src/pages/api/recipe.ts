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

// Soft, per-isolate rate limit: recipe generation is far more compute-heavy than
// other routes (~5,000 spectral.mix() calls per request). This only limits requests
// hitting the same Worker isolate, not globally across Cloudflare's edge — a real
// distributed limit would need a KV/Durable Object binding, which isn't provisioned
// in this project. Good enough to blunt casual abuse without new infra.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const requestTimestampsByUser = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (requestTimestampsByUser.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestTimestampsByUser.set(userId, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
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

  if (isRateLimited(user.id)) {
    return json({ error: "Too many recipe requests — please wait a moment and try again." }, 429);
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

  return json(
    {
      targetPaint: { id: targetPaint.id, name: targetPaint.name, hex: targetPaint.hex },
      components: recipe.components.map((component) => {
        const paint = paintsById.get(component.paintId);
        return { paintId: component.paintId, name: paint?.name ?? "", hex: paint?.hex ?? "", parts: component.parts };
      }),
      resultHex: recipe.resultHex,
      distance: recipe.distance,
      quality: recipe.quality,
    },
    200,
  );
};
