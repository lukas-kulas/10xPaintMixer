import type { User } from "@supabase/supabase-js";
import type { APIContext } from "astro";
import { describe, expect, it, vi } from "vitest";
import { POST } from "./recipe";

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_KEY: "test-anon-key",
}));

interface ErrorBody {
  error?: unknown;
}

function fakeUser(): User {
  return { id: "11111111-1111-4111-8111-111111111111", email: "test@example.com" } as User;
}

function buildContext(body: unknown): APIContext {
  const request = new Request("https://example.com/api/recipe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    request,
    cookies: { set: () => undefined } as unknown as APIContext["cookies"],
    locals: { user: fakeUser() },
  } as unknown as APIContext;
}

async function expectCleanError(response: Response, status: number) {
  expect(response.status).toBe(status);
  const body = (await response.json()) as ErrorBody;
  expect(typeof body.error).toBe("string");
  expect((body.error as string).length).toBeGreaterThan(0);
}

describe("POST /api/recipe", () => {
  it("returns 400 when target_paint_id is missing", async () => {
    const response = await POST(buildContext({}));
    await expectCleanError(response, 400);
  });
});
