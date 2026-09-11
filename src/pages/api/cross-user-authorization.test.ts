import type { APIContext } from "astro";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createTestUser,
  deleteTestUser,
  signInForClient,
  signInForCookieHeader,
  type SupabaseClient,
  type SupabaseTestEnv,
  type TestUser,
} from "@/test-support/rls-harness";
import { GET } from "./paints";
import { DELETE } from "./paints/[id]";

// Real local Supabase values, forwarded via vitest.config.ts's miniflare.bindings — see its
// comment for why this reads process.env directly rather than importing cloudflare:test.
vi.mock("astro:env/server", () => ({
  SUPABASE_URL: process.env.RLS_TEST_SUPABASE_URL ?? "",
  SUPABASE_KEY: process.env.RLS_TEST_SUPABASE_ANON_KEY ?? "",
}));

const configured = Boolean(
  process.env.RLS_TEST_SUPABASE_URL &&
  process.env.RLS_TEST_SUPABASE_ANON_KEY &&
  process.env.RLS_TEST_SUPABASE_SERVICE_ROLE_KEY,
);

const supabaseTestEnv: SupabaseTestEnv = {
  url: process.env.RLS_TEST_SUPABASE_URL ?? "",
  anonKey: process.env.RLS_TEST_SUPABASE_ANON_KEY ?? "",
  serviceRoleKey: process.env.RLS_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "",
};

interface PaintListEntry {
  id: string;
  owned: boolean;
}

function buildGetContext(cookieHeader: string, userId: string): APIContext {
  return {
    request: new Request("https://example.com/api/paints", { method: "GET", headers: { Cookie: cookieHeader } }),
    cookies: { set: () => undefined } as unknown as APIContext["cookies"],
    locals: { user: { id: userId } },
  } as unknown as APIContext;
}

function buildDeleteContext(cookieHeader: string, userId: string, paintId: string): APIContext {
  return {
    request: new Request(`https://example.com/api/paints/${paintId}`, {
      method: "DELETE",
      headers: { Cookie: cookieHeader },
    }),
    params: { id: paintId },
    cookies: { set: () => undefined } as unknown as APIContext["cookies"],
    locals: { user: { id: userId } },
  } as unknown as APIContext;
}

// Requires a running local Supabase (`npx supabase start`) with RLS_TEST_SUPABASE_* bindings
// configured — see context/foundation/test-plan.md §6.2. Skips cleanly when absent.
describe.skipIf(!configured)("cross-user authorization (Risk #3)", () => {
  let userA: TestUser;
  let userB: TestUser;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let cookieHeaderA: string;
  let paintIdX: string;
  let paintIdY: string;

  beforeAll(async () => {
    userA = await createTestUser(supabaseTestEnv);
    userB = await createTestUser(supabaseTestEnv);
    clientA = await signInForClient(supabaseTestEnv, userA.email, userA.password);
    clientB = await signInForClient(supabaseTestEnv, userB.email, userB.password);
    cookieHeaderA = await signInForCookieHeader(supabaseTestEnv, userA.email, userA.password);

    const { data: paints, error } = await clientA.from("paints").select("id").limit(2);
    if (error || paints.length < 2) {
      throw new Error(`Failed to fetch catalog paints for fixtures: ${error?.message ?? "not enough rows"}`);
    }
    [{ id: paintIdX }, { id: paintIdY }] = paints as { id: string }[];
  });

  afterAll(async () => {
    // Best-effort cleanup, isolated per user: if beforeAll failed partway (e.g. userB was
    // never assigned), accessing its `.id` throws — caught here so it can't mask the real
    // beforeAll failure that already reported the root cause.
    try {
      await deleteTestUser(supabaseTestEnv, userA.id);
    } catch {
      // swallow — see comment above
    }
    try {
      await deleteTestUser(supabaseTestEnv, userB.id);
    } catch {
      // swallow — see comment above
    }
  });

  describe("via real routes", () => {
    beforeAll(async () => {
      const { error } = await clientB.from("user_paints").insert({ user_id: userB.id, paint_id: paintIdY });
      if (error) {
        throw new Error(`Failed to seed B's owned paint: ${error.message}`);
      }
    });

    it("GET /api/paints reflects only the caller's own owned paints, never another user's", async () => {
      const response = await GET(buildGetContext(cookieHeaderA, userA.id));
      expect(response.status).toBe(200);
      const body = (await response.json()) as PaintListEntry[];
      const bsPaint = body.find((p) => p.id === paintIdY);
      expect(bsPaint?.owned).toBe(false);
    });

    it("DELETE /api/paints/[id] cannot delete another user's row by supplying their paint_id directly", async () => {
      // The route always 200s regardless of whether any row matched (delete is filtered by
      // both user_id and paint_id) — the real security proof is B's row surviving, below.
      const response = await DELETE(buildDeleteContext(cookieHeaderA, userA.id, paintIdY));
      expect(response.status).toBe(200);

      const { data } = await clientB.from("user_paints").select("paint_id").eq("paint_id", paintIdY);
      expect(data).toHaveLength(1);
    });
  });

  describe("direct DB, bypassing routes — user_paints", () => {
    beforeAll(async () => {
      const { error } = await clientB
        .from("user_paints")
        .upsert({ user_id: userB.id, paint_id: paintIdX }, { onConflict: "user_id,paint_id" });
      if (error) {
        throw new Error(`Failed to seed B's owned paint: ${error.message}`);
      }
    });

    it("A cannot select B's row directly", async () => {
      const { data } = await clientA.from("user_paints").select("*").eq("user_id", userB.id);
      expect(data).toEqual([]);
    });

    it("A cannot insert a row as B (WITH CHECK rejects)", async () => {
      const { error } = await clientA.from("user_paints").insert({ user_id: userB.id, paint_id: paintIdY });
      expect(error).not.toBeNull();
    });

    it("A cannot update B's row", async () => {
      const { data } = await clientA
        .from("user_paints")
        .update({ paint_id: paintIdY })
        .eq("user_id", userB.id)
        .select();
      expect(data).toEqual([]);

      const { data: stillOwnedByB } = await clientB.from("user_paints").select("paint_id").eq("user_id", userB.id);
      expect(stillOwnedByB?.some((row) => row.paint_id === paintIdX)).toBe(true);
    });

    it("A cannot delete B's row", async () => {
      await clientA.from("user_paints").delete().eq("user_id", userB.id);

      const { data: stillOwnedByB } = await clientB.from("user_paints").select("paint_id").eq("user_id", userB.id);
      expect(stillOwnedByB?.some((row) => row.paint_id === paintIdX)).toBe(true);
    });
  });

  describe("direct DB, bypassing routes — recipes", () => {
    beforeAll(async () => {
      const { error } = await clientB.from("recipes").insert({
        user_id: userB.id,
        target_paint_id: paintIdX,
        components: [],
        result_hex: "#112233",
        distance: 0,
      });
      if (error) {
        throw new Error(`Failed to seed B's recipe: ${error.message}`);
      }
    });

    it("A cannot select B's recipe directly", async () => {
      const { data } = await clientA.from("recipes").select("*").eq("user_id", userB.id);
      expect(data).toEqual([]);
    });

    it("A cannot insert a recipe as B (WITH CHECK rejects)", async () => {
      const { error } = await clientA
        .from("recipes")
        .insert({ user_id: userB.id, target_paint_id: paintIdX, components: [], result_hex: "#445566", distance: 0 });
      expect(error).not.toBeNull();
    });

    it("nobody, not even the owner, can update a recipe — no policy exists for that operation", async () => {
      const { data } = await clientB.from("recipes").update({ distance: 1 }).eq("user_id", userB.id).select();
      expect(data).toEqual([]);
    });

    it("nobody, not even the owner, can delete a recipe — no policy exists for that operation", async () => {
      await clientB.from("recipes").delete().eq("user_id", userB.id);

      const { data: stillExists } = await clientB.from("recipes").select("id").eq("user_id", userB.id);
      expect(stillExists?.length).toBeGreaterThan(0);
    });
  });
});
