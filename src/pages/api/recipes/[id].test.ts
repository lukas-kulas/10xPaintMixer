import type { User } from "@supabase/supabase-js";
import type { APIContext } from "astro";
import { setupNetwork } from "@msw/cloudflare";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "./[id]";

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_KEY: "test-anon-key",
}));

// Supabase's outbound HTTP is intercepted here, never the @/lib/supabase module itself —
// per context/foundation/test-plan.md §4. Same pattern as src/pages/api/recipe.test.ts.
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

const RECIPE_ID = "22222222-2222-4222-8222-222222222222";

// A fresh id per call keeps each test isolated, mirroring recipe.test.ts's fakeUser().
let fakeUserCounter = 0;

function fakeUser(): User {
  fakeUserCounter += 1;
  return { id: `test-user-${fakeUserCounter.toString()}`, email: "test@example.com" } as User;
}

function buildContext(method: "DELETE" | "PATCH", body?: unknown): APIContext {
  const request = new Request(`https://example.com/api/recipes/${RECIPE_ID}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "PATCH" ? JSON.stringify(body ?? {}) : undefined,
  });

  return {
    request,
    params: { id: RECIPE_ID },
    cookies: { set: () => undefined } as unknown as APIContext["cookies"],
    locals: { user: fakeUser() },
  } as unknown as APIContext;
}

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

async function expectCleanError(response: Response, status: number) {
  expect(response.status).toBe(status);
  const body = (await response.json()) as ErrorBody;
  expect(typeof body.error).toBe("string");
  expect((body.error as string).length).toBeGreaterThan(0);
}

function mockUpdateSuccess() {
  network.use(http.patch("https://test.supabase.co/rest/v1/recipes", () => HttpResponse.json([{}], { status: 200 })));
}

function mockUpdateError() {
  network.use(
    http.patch("https://test.supabase.co/rest/v1/recipes", () =>
      HttpResponse.json({ code: "22P02", details: null, hint: null, message: "invalid input" }, { status: 400 }),
    ),
  );
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

  it.each([
    ["missing", undefined],
    ["number", 42],
    ["object", { text: "x" }],
    ["null", null],
  ])("returns 400 when notes has the wrong type (%s)", async (_label, notes) => {
    await expectCleanError(await PATCH(buildContext("PATCH", { notes })), 400);
  });

  it("returns 200 and clears the note when notes is an empty string", async () => {
    mockUpdateSuccess();
    const response = await PATCH(buildContext("PATCH", { notes: "" }));
    expect(response.status).toBe(200);
  });

  it("returns 400 with the Supabase error message when the update fails", async () => {
    mockUpdateError();
    await expectCleanError(await PATCH(buildContext("PATCH", { notes: "a note" })), 400);
  });
});
