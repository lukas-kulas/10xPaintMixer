import type { User } from "@supabase/supabase-js";
import type { APIContext } from "astro";
import { setupNetwork } from "@msw/cloudflare";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./recipes";

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_KEY: "test-anon-key",
}));

// Supabase's outbound HTTP is intercepted here, never the @/lib/supabase module itself —
// per context/foundation/test-plan.md §4 ("mocks Supabase's HTTP edge only, never internal
// modules"). Same pattern as src/pages/api/recipe.test.ts.
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
const OWNED_PAINT_ID = "44444444-4444-4444-8444-444444444444";
const UNOWNED_PAINT_ID = "55555555-5555-4555-8555-555555555555";

// A fresh id per call keeps each test isolated, mirroring recipe.test.ts's fakeUser().
let fakeUserCounter = 0;

function fakeUser(): User {
  fakeUserCounter += 1;
  return { id: `test-user-${fakeUserCounter.toString()}`, email: "test@example.com" } as User;
}

function buildContext(method: "GET" | "POST", body?: unknown): APIContext {
  const request = new Request("https://example.com/api/recipes", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });

  return {
    request,
    cookies: { set: () => undefined } as unknown as APIContext["cookies"],
    locals: { user: fakeUser() },
  } as unknown as APIContext;
}

function buildUnauthenticatedContext(method: "GET" | "POST", body?: unknown): APIContext {
  const request = new Request("https://example.com/api/recipes", {
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

async function expectCleanError(response: Response, status: number) {
  expect(response.status).toBe(status);
  const body = (await response.json()) as ErrorBody;
  expect(typeof body.error).toBe("string");
  expect((body.error as string).length).toBeGreaterThan(0);
}

function mockOwnedPaints(ownedIds: string[]) {
  network.use(
    http.get("https://test.supabase.co/rest/v1/user_paints", () =>
      HttpResponse.json(ownedIds.map((id) => ({ paint_id: id }))),
    ),
  );
}

function mockInsertSuccess() {
  network.use(http.post("https://test.supabase.co/rest/v1/recipes", () => HttpResponse.json([{}], { status: 201 })));
}

function mockInsertError() {
  network.use(
    http.post("https://test.supabase.co/rest/v1/recipes", () =>
      HttpResponse.json(
        { code: "23503", details: null, hint: null, message: "insert or update violates foreign key constraint" },
        { status: 400 },
      ),
    ),
  );
}

function savePayload(overrides: Record<string, unknown> = {}) {
  return {
    target_paint_id: TARGET_PAINT_ID,
    components: [{ paint_id: OWNED_PAINT_ID, parts: 1 }],
    result_hex: "#ff0000",
    distance: 0,
    ...overrides,
  };
}

describe("GET /api/recipes", () => {
  it("returns 401 when unauthenticated", async () => {
    await expectUnauthorized(await GET(buildUnauthenticatedContext("GET")));
  });
});

describe("POST /api/recipes", () => {
  it("returns 401 when unauthenticated", async () => {
    await expectUnauthorized(
      await POST(
        buildUnauthenticatedContext(
          "POST",
          savePayload({ components: [{ paint_id: "33333333-3333-4333-8333-333333333333", parts: 1 }] }),
        ),
      ),
    );
  });

  it("returns 400 when components is missing", async () => {
    const { components: _components, ...rest } = savePayload();
    await expectCleanError(await POST(buildContext("POST", rest)), 400);
  });

  it("returns 400 when components is an empty array", async () => {
    await expectCleanError(await POST(buildContext("POST", savePayload({ components: [] }))), 400);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
  ])("returns 400 when a component's parts is %s", async (_label, parts) => {
    await expectCleanError(
      await POST(buildContext("POST", savePayload({ components: [{ paint_id: OWNED_PAINT_ID, parts }] }))),
      400,
    );
  });

  it("returns 400 when a component references a paint the caller doesn't own", async () => {
    mockOwnedPaints([]);
    await expectCleanError(
      await POST(buildContext("POST", savePayload({ components: [{ paint_id: UNOWNED_PAINT_ID, parts: 1 }] }))),
      400,
    );
  });

  it("saves successfully when components reference the same owned paint twice (deduped ownership check)", async () => {
    mockOwnedPaints([OWNED_PAINT_ID]);
    mockInsertSuccess();
    const response = await POST(
      buildContext(
        "POST",
        savePayload({
          components: [
            { paint_id: OWNED_PAINT_ID, parts: 1 },
            { paint_id: OWNED_PAINT_ID, parts: 2 },
          ],
        }),
      ),
    );
    expect(response.status).toBe(200);
  });

  it("returns 400 with the Supabase error message when the insert fails", async () => {
    mockOwnedPaints([OWNED_PAINT_ID]);
    mockInsertError();
    await expectCleanError(await POST(buildContext("POST", savePayload())), 400);
  });
});
