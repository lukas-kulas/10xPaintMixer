import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

// Real LOCAL Supabase values for the cross-user-authorization RLS suite (Phase 2/3 of
// context/changes/testing-authorization-route-auth-wiring/). Deliberately NOT `.dev.vars` —
// that file holds this project's cloud dev target (see README), and the RLS suite must
// always point at the throwaway local instance (`npx supabase start`), never wherever the
// app's own dev environment happens to be configured. `.env.test.local` is gitignored;
// populate it from `npx supabase status`'s printed URL/keys. Loaded here (Node context,
// not inside workerd) and forwarded via `miniflare.bindings` below — confirmed (by actually
// running it) that `nodejs_compat` exposes configured bindings via `process.env` INSIDE the
// workerd sandbox, so test files read `process.env.RLS_TEST_SUPABASE_*` directly, no
// `cloudflare:test` import needed. (`cloudflare:test`'s own `env`/`SELF` exports do NOT work
// in this project: importing them triggers a Durable-Object dispatch that requires
// statically resolving the main Worker entry-point, which is `@astrojs/cloudflare/entrypoints/
// server` here — a package export Miniflare's analyzer cannot resolve outside Astro's own
// build, so any test importing `cloudflare:test` fails to collect at all.) Prefixed
// `RLS_TEST_*` to avoid any collision with `.dev.vars`' own `SUPABASE_URL`/`SUPABASE_KEY`.
// Absent in CI (that suite only runs where local Supabase is up — wiring it into CI is
// test-plan.md §3 Phase 4).
try {
  process.loadEnvFile(".env.test.local");
} catch {
  // .env.test.local absent (e.g. CI, or a machine without local Supabase) — RLS suite is skipped
}

export default defineConfig({
  resolve: {
    alias: { "@": srcDir },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/lib/**/*.test.ts"],
        },
      },
      {
        extends: true,
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: {
                RLS_TEST_SUPABASE_URL: process.env.TEST_SUPABASE_URL ?? "",
                RLS_TEST_SUPABASE_ANON_KEY: process.env.TEST_SUPABASE_ANON_KEY ?? "",
                RLS_TEST_SUPABASE_SERVICE_ROLE_KEY: process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? "",
              },
            },
          }),
        ],
        test: {
          name: "integration",
          include: ["src/pages/**/*.test.ts"],
        },
      },
    ],
  },
});
