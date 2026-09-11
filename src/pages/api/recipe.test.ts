import type { User } from "@supabase/supabase-js";
import type { APIContext } from "astro";
import { setupNetwork } from "@msw/cloudflare";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "./recipe";

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_KEY: "test-anon-key",
}));

// Supabase's outbound HTTP is intercepted here, never the @/lib/supabase module itself —
// per context/foundation/test-plan.md §4 ("mocks Supabase's HTTP edge only, never internal
// modules"). vitest-pool-workers' own fetchMock was removed upstream; @msw/cloudflare is the
// current Cloudflare-documented replacement for intercepting fetch() inside workerd.
const network = setupNetwork();

beforeAll(() => {
  network.enable();
});

afterEach(() => {
  network.resetHandlers();
});

afterAll(() => {
  network.disable();
});

interface ErrorBody {
  error?: unknown;
}

const TARGET_PAINT_ID = "22222222-2222-4222-8222-222222222222";

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

function mockTargetPaintFound() {
  network.use(
    http.get("https://test.supabase.co/rest/v1/paints", () =>
      HttpResponse.json([{ id: TARGET_PAINT_ID, name: "Test Red", hex: "#ff0000", r: 255, g: 0, b: 0 }]),
    ),
  );
}

function mockTargetPaintNotFound() {
  network.use(http.get("https://test.supabase.co/rest/v1/paints", () => HttpResponse.json([])));
}

function mockOwnedPaintsEmpty() {
  network.use(http.get("https://test.supabase.co/rest/v1/user_paints", () => HttpResponse.json([])));
}

describe("POST /api/recipe", () => {
  it("returns 400 when target_paint_id is missing", async () => {
    await expectCleanError(await POST(buildContext({})), 400);
  });

  it("returns 400 when target_paint_id has the wrong type", async () => {
    await expectCleanError(await POST(buildContext({ target_paint_id: 42 })), 400);
  });

  it("returns 400 when target_paint_id is an empty string", async () => {
    await expectCleanError(await POST(buildContext({ target_paint_id: "" })), 400);
  });

  it("returns 404 when target_paint_id doesn't match any color, including a malformed non-UUID id", async () => {
    mockTargetPaintNotFound();
    await expectCleanError(await POST(buildContext({ target_paint_id: "not-a-uuid" })), 404);
  });

  it("returns 422 when the user owns no paints", async () => {
    mockTargetPaintFound();
    mockOwnedPaintsEmpty();
    await expectCleanError(await POST(buildContext({ target_paint_id: TARGET_PAINT_ID })), 422);
  });
});
