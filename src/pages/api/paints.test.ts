import type { APIContext } from "astro";
import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "./paints";

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_KEY: "test-anon-key",
}));

interface ErrorBody {
  error?: unknown;
}

function buildUnauthenticatedContext(method: "GET" | "POST", body?: unknown): APIContext {
  const request = new Request("https://example.com/api/paints", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });

  return {
    request,
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

describe("GET /api/paints", () => {
  it("returns 401 when unauthenticated", async () => {
    await expectUnauthorized(await GET(buildUnauthenticatedContext("GET")));
  });
});

describe("POST /api/paints", () => {
  it("returns 401 when unauthenticated", async () => {
    await expectUnauthorized(
      await POST(buildUnauthenticatedContext("POST", { paint_id: "22222222-2222-4222-8222-222222222222" })),
    );
  });
});
