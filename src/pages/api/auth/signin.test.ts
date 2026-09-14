import type { APIContext } from "astro";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestUser, deleteTestUser, type SupabaseTestEnv, type TestUser } from "@/test-support/rls-harness";
import { POST } from "./signin";

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

function buildSignInContext(email: string, password: string): APIContext {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  return {
    request: new Request("https://example.com/api/auth/signin", { method: "POST", body: form }),
    cookies: { set: () => undefined } as unknown as APIContext["cookies"],
    redirect: (path: string, status = 302) => new Response(null, { status, headers: { Location: path } }),
  } as unknown as APIContext;
}

// Requires a running local Supabase (`npx supabase start`) with RLS_TEST_SUPABASE_* bindings
// configured — see context/foundation/test-plan.md §6.2. Skips cleanly when absent.
describe.skipIf(!configured)("POST /api/auth/signin", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser(supabaseTestEnv);
  });

  afterAll(async () => {
    // Best-effort cleanup: if beforeAll failed, `user` is never assigned and accessing
    // `.id` throws — caught here so it can't mask the real beforeAll failure that already
    // reported the root cause (same pattern as cross-user-authorization.test.ts).
    try {
      await deleteTestUser(supabaseTestEnv, user.id);
    } catch {
      // swallow — see comment above
    }
  });

  it("redirects to /dashboard on success", async () => {
    const response = await POST(buildSignInContext(user.email, user.password));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/dashboard");
  });

  it("redirects to /auth/signin with an error on wrong credentials, unchanged", async () => {
    const response = await POST(buildSignInContext(user.email, "definitely-wrong-password"));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toMatch(/^\/auth\/signin\?error=/);
  });
});
