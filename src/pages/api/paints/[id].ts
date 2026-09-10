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

  const paintId = context.params.id;

  const { error } = await supabase.from("user_paints").delete().eq("user_id", user.id).eq("paint_id", paintId);

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ ok: true }, 200);
};
