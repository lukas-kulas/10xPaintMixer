import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export type SupabaseClient = ReturnType<typeof createSupabaseClient>;

export interface SupabaseTestEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

function randomPassword(): string {
  return `Test-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function adminClient(env: SupabaseTestEnv): SupabaseClient {
  return createSupabaseClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Admin-creates a real, email-confirmed user in the local Supabase instance. */
export async function createTestUser(env: SupabaseTestEnv): Promise<TestUser> {
  const email = `rls-test-${crypto.randomUUID()}@example.com`;
  const password = randomPassword();
  const { data, error } = await adminClient(env).auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }
  return { id: data.user.id, email, password };
}

/** Admin-deletes a test user; cascades to their user_paints/recipes rows via `on delete cascade`. */
export async function deleteTestUser(env: SupabaseTestEnv, userId: string): Promise<void> {
  const { error } = await adminClient(env).auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`Failed to delete test user ${userId}: ${error.message}`);
  }
}

/** A plain, signed-in client for the direct-DB layer (bypasses app routes entirely). */
export async function signInForClient(env: SupabaseTestEnv, email: string, password: string): Promise<SupabaseClient> {
  const client = createSupabaseClient(env.url, env.anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Failed to sign in test user ${email}: ${error.message}`);
  }
  return client;
}

/**
 * Signs in with a cookie-capturing jar and replays the captured Set-Cookie values as a
 * `Cookie` header string. `src/lib/supabase.ts` reads sessions from the raw `Cookie` request
 * header, so setting this header on a constructed `Request` hydrates the same real,
 * RLS-carrying session a browser would have — for the via-route test layer.
 */
export async function signInForCookieHeader(env: SupabaseTestEnv, email: string, password: string): Promise<string> {
  const captured: { name: string; value: string }[] = [];
  const client = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => captured.push({ name, value }));
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Failed to sign in test user ${email}: ${error.message}`);
  }
  return captured.map(({ name, value }) => `${name}=${value}`).join("; ");
}
