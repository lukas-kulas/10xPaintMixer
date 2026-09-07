---
project: "10xPaintMixer"
deployed_at: 2026-09-07
platform: Cloudflare Workers
deployment_url: https://10x-astro-starter.lukas-qlas.workers.dev
worker_name: 10x-astro-starter
cloudflare_account_id: e9428455b15e1e08de376464f271134a
tech_stack:
  language: TypeScript/JavaScript
  framework: Astro 6 + React 19
  runtime: Cloudflare Workers (workerd)
---

## Summary

First production deployment, following the platform recommendation in `context/foundation/infrastructure.md` (Cloudflare Workers) and the confirmed target in `context/foundation/tech-stack.md` (`hints.deployment_target: cloudflare-workers`). Deployed manually via `wrangler`, with production Supabase secrets set ahead of the deploy so auth is live from the first release.

Live at: **https://10x-astro-starter.lukas-qlas.workers.dev**

## What was done

1. **Cloud Supabase project created** (manual, user) — a real hosted Supabase project was provisioned; the local Docker-based Supabase setup described in `README.md` is dev-only and unreachable from Cloudflare Workers.
2. **Cloudflare account confirmed** — `npx wrangler whoami` showed a single, unambiguous account (`Lukas.qlas@gmail.com's Account`, id `e9428455b15e1e08de376464f271134a`), so no `account_id` needed adding to `wrangler.jsonc`.
3. **Production secrets set** (manual, user — values never passed through the assistant conversation): `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`, run interactively in the user's own terminal. Verified afterward with `npx wrangler secret list` (names only, no values).
4. **Local `.dev.vars` created** (gitignored) with the same Supabase URL/key, for `npm run dev` / `npm run preview` parity with production.
5. **Build**: `npm run build` — completed cleanly.
6. **Deploy**: `npx wrangler deploy`, run by the user directly in their own terminal (not via the assistant's sandboxed shell) because the first deploy required answering an interactive prompt — see Findings below.
7. **Verified**: homepage and `/auth/signin` both return `HTTP 200`; homepage HTML does not show the "unconfigured Supabase" banner (`src/lib/config-status.ts`), confirming secrets are wired through correctly.

## Findings not anticipated by `infrastructure.md`

- **The `@astrojs/cloudflare` adapter auto-enables two bindings not declared in `wrangler.jsonc`**: an `IMAGES` binding (Cloudflare Images, account-level, no provisioning needed) and a `SESSION` KV namespace binding (Astro's built-in sessions feature). Neither is used by this app's auth (Supabase cookie-based via `@supabase/ssr`, not `Astro.session`), but the adapter enables them regardless. `wrangler deploy` auto-provisioned the `SESSION` KV namespace on first deploy without any manual step — this "just worked," but is worth knowing about if it shows up unexpectedly in the Cloudflare dashboard's KV list.
- **First deploy to a fresh Cloudflare account requires registering a `workers.dev` subdomain**, and `wrangler` refuses to do this non-interactively — even with stdin piped (`echo y | wrangler deploy`), it detects the non-TTY context and hard-defaults to "no," then fails with an error pointing at the dashboard. The dashboard onboarding deep-link Cloudflare prints (`/<account_id>/workers/onboarding`) 404'd for this account. **The only reliable fix was running `wrangler deploy` directly in a real interactive terminal** and answering the subdomain prompt by hand — an agent running commands through a sandboxed/non-TTY shell cannot complete a truly first-ever deploy on a fresh account unattended.

## Operational notes (carried forward from `infrastructure.md`)

- **Rollback**: `npx wrangler rollback [<version-id>]` — omit the id to revert to the immediately-prior deployment. Does not roll back secrets.
- **Logs**: `npx wrangler tail` for live request logs; `observability.enabled: true` is already set in `wrangler.jsonc`.
- **Secrets**: manage via `npx wrangler secret put <NAME>` / `npx wrangler secret list` (names only) / `npx wrangler secret delete <NAME>`. Changing production secrets stays a human-run action.
- **Redeploys**: routine `npm run build && npx wrangler deploy` is safe for the agent to run going forward — the interactive subdomain prompt was strictly a one-time, fresh-account gate and will not recur.

## Open follow-ups (explicitly out of scope for this deployment)

- No CI/CD deploy step yet — `.github/workflows/ci.yml` still only runs `astro sync && lint && build`. Wiring `wrangler deploy` into GitHub Actions (with `CLOUDFLARE_API_TOKEN` as a repo secret) is a separate follow-up.
- No custom domain — the app is live only on the default `*.workers.dev` subdomain.
- No Dockerfile / container config — not applicable to the Workers runtime.
