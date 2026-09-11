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
const NONEXISTENT_PAINT_ID = "33333333-3333-4333-8333-333333333333";

// A fresh id per call keeps each test in its own bucket of the route's per-isolate
// rate limiter (recipe.ts's requestTimestampsByUser Map) — sharing one id across many
// tests in this file would eventually trip the 10-req/60s limit and fail unrelated tests.
let fakeUserCounter = 0;

function fakeUser(): User {
  fakeUserCounter += 1;
  return { id: `test-user-${fakeUserCounter.toString()}`, email: "test@example.com" } as User;
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

// PostgREST's response when a filter value can't be cast to the column's type — e.g. a
// non-UUID string against a uuid column — is a Postgres data-exception error (22P02),
// surfaced as a non-2xx JSON error body. supabase-js turns that into a truthy `error`,
// which this route collapses to a 500 (recipe.ts:79-81) regardless of PostgREST's own
// status code, so the exact status/shape mocked here isn't load-bearing beyond "not 2xx."
function mockTargetPaintMalformedId() {
  network.use(
    http.get("https://test.supabase.co/rest/v1/paints", () =>
      HttpResponse.json(
        { code: "22P02", details: null, hint: null, message: 'invalid input syntax for type uuid: "not-a-uuid"' },
        { status: 400 },
      ),
    ),
  );
}

function mockOwnedPaintsEmpty() {
  network.use(http.get("https://test.supabase.co/rest/v1/user_paints", () => HttpResponse.json([])));
}

describe("POST /api/recipe", () => {
  it("returns 400 when target_paint_id is missing", async () => {
    await expectCleanError(await POST(buildContext({})), 400);
  });

  it.each([
    ["number", 42],
    ["object", { id: "x" }],
    ["array", ["x"]],
  ])("returns 400 when target_paint_id has the wrong type (%s)", async (_label, targetPaintId) => {
    await expectCleanError(await POST(buildContext({ target_paint_id: targetPaintId })), 400);
  });

  it("returns 400 when target_paint_id is an empty string", async () => {
    await expectCleanError(await POST(buildContext({ target_paint_id: "" })), 400);
  });

  it("returns 404 when target_paint_id is a well-formed UUID that doesn't match any color", async () => {
    mockTargetPaintNotFound();
    await expectCleanError(await POST(buildContext({ target_paint_id: NONEXISTENT_PAINT_ID })), 404);
  });

  it("returns 500 when target_paint_id is a malformed, non-UUID string", async () => {
    mockTargetPaintMalformedId();
    await expectCleanError(await POST(buildContext({ target_paint_id: "not-a-uuid" })), 500);
  });

  it("returns 422 when the user owns no paints", async () => {
    mockTargetPaintFound();
    mockOwnedPaintsEmpty();
    await expectCleanError(await POST(buildContext({ target_paint_id: TARGET_PAINT_ID })), 422);
  });
});
