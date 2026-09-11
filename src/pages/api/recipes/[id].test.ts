import type { APIContext } from "astro";
import { describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "./[id]";

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_KEY: "test-anon-key",
}));

interface ErrorBody {
  error?: unknown;
}

const RECIPE_ID = "22222222-2222-4222-8222-222222222222";

function buildUnauthenticatedContext(method: "DELETE" | "PATCH", body?: unknown): APIContext {
  const request = new Request(`https://example.com/api/recipes/${RECIPE_ID}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "PATCH" ? JSON.stringify(body ?? {}) : undefined,
  });

  return {
    request,
    params: { id: RECIPE_ID },
    cookies: { set: () => undefined } as unknown as APIContext["cookies"],
    locals: { user: null },
  } as unknown as APIContext;
}

async function expectUnauthorized(response: Response) {
  expect(response.status).toBe(401);
  const body = (await response.json()) as ErrorBody;
  expect(typeof body.error).toBe("string");
  expect((body.error as string).length).toBeGreaterThan(0);
}

describe("DELETE /api/recipes/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    await expectUnauthorized(await DELETE(buildUnauthenticatedContext("DELETE")));
  });
});

describe("PATCH /api/recipes/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    await expectUnauthorized(await PATCH(buildUnauthenticatedContext("PATCH", { notes: "a note" })));
  });
});
