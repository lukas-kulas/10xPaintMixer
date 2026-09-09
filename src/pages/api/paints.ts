import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

interface PaintTypeRef {
  name: string;
}

interface PaintRow {
  id: string;
  name: string;
  hex: string;
  paint_types: PaintTypeRef | null;
}

interface UserPaintRow {
  paint_id: string;
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

  const { data: paints, error: paintsError } = await supabase
    .from("paints")
    .select("id, name, hex, paint_types(name)")
    .order("name")
    .overrideTypes<PaintRow[], { merge: false }>();

  if (paintsError) {
    return json({ error: paintsError.message }, 500);
  }

  const { data: owned, error: ownedError } = await supabase
    .from("user_paints")
    .select("paint_id")
    .overrideTypes<UserPaintRow[], { merge: false }>();

  if (ownedError) {
    return json({ error: ownedError.message }, 500);
  }

  const ownedIds = new Set(owned.map((row) => row.paint_id));

  const result = paints.map((paint) => ({
    id: paint.id,
    name: paint.name,
    type: paint.paint_types?.name ?? "",
    hex: paint.hex,
    owned: ownedIds.has(paint.id),
  }));

  return json(result, 200);
};

interface AddPaintBody {
  paint_id?: unknown;
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
  const body = raw as AddPaintBody | null;
  const paintId = body?.paint_id;
  if (typeof paintId !== "string" || !paintId) {
    return json({ error: "paint_id is required" }, 400);
  }

  const { error } = await supabase
    .from("user_paints")
    .upsert({ user_id: user.id, paint_id: paintId }, { onConflict: "user_id,paint_id", ignoreDuplicates: true });

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ ok: true }, 200);
};
