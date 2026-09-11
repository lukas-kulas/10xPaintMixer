import { describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, signInForClient, type SupabaseTestEnv } from "@/test-support/rls-harness";

// Bindings declared in vitest.config.ts's `miniflare.bindings`, forwarded into this workerd
// sandbox via `process.env` (confirmed empirically — see vitest.config.ts's comment on why
// `cloudflare:test`'s own `env` import is avoided in this project).
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

// Requires a running local Supabase (`npx supabase start`) with TEST_SUPABASE_* values in
// .env.test.local — see context/foundation/test-plan.md §6.2. Skips cleanly when absent
// (e.g. CI, or a machine without Docker/local Supabase) rather than failing the whole suite.
describe.skipIf(!configured)("rls-harness", () => {
  it("creates, signs in as, and deletes a real local test user", async () => {
    const user = await createTestUser(supabaseTestEnv);
    expect(user.id).toBeTruthy();

    const client = await signInForClient(supabaseTestEnv, user.email, user.password);
    const { data, error } = await client.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.id).toBe(user.id);

    await deleteTestUser(supabaseTestEnv, user.id);

    await expect(signInForClient(supabaseTestEnv, user.email, user.password)).rejects.toThrow();
  });
});
