---
project: "10xPaintMixer"
researched_at: 2026-09-07
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript/JavaScript
  framework: Astro 6 + React 19
  runtime: Cloudflare Workers (workerd)
---

## Recommendation

**Deploy on Cloudflare Workers.**

Cloudflare wins on every axis that matters for this project: it's the platform already scaffolded and wired (`@astrojs/cloudflare` v13.5.0, a working `wrangler.jsonc`), the developer already has hands-on familiarity with it, cost-minimization was the stated priority and Cloudflare's free tier (100k requests/*day*) comfortably covers this project's low-QPS scale at $0/month, and no persistent-connection requirement was identified that would push toward a VM-based platform instead. The only real caveat, addressed below, is that this project's own `tech-stack.md` hand-off is already stale — it says `deployment_target: cloudflare-pages`, but the installed adapter dropped Pages support in v13; the actual, already-deployed-ready target is Workers.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Partial | 4.5/5 |
| Vercel | Pass | Pass | Pass | Partial | Partial | 3.5/5 |
| Netlify | Partial | Pass | Pass | Partial | Pass | 3.5/5 |
| Render | Partial | Pass | Pass | Partial | Partial | 3/5 |
| Fly.io | Pass | Partial | Pass | Partial | Fail | 2.5/5 |
| Railway | Partial | Partial | Pass | Partial | Partial | 2.5/5 |

**Cloudflare Workers** — `wrangler deploy`, `wrangler rollback [deployment-id]`, `wrangler tail` are all deterministic, current commands. Docs are published as `llms.txt`/`llms-full.txt` at `developers.cloudflare.com/docs-for-agents/`, plus per-page markdown. The official Workers Observability MCP server exists but is explicitly labeled work-in-progress by Cloudflare — the only Partial. Free tier: 100k requests/day, comfortably above this project's scale.

**Vercel** — `@astrojs/vercel` is the official adapter (adapter swap required from the current Cloudflare setup). CLI (`vercel`, `vercel rollback`, `vercel logs`) is solid, but Hobby-tier rollback is restricted to only the immediately-previous deployment (Partial on deploy-API stability), and the official MCP server (`mcp.vercel.com`) is Public Beta. Hobby free tier is generous (1M invocations/month) but explicitly **restricted to non-commercial use** — a real constraint to flag even for a hobby project, since the line isn't always obvious. Native WebSocket support is itself Public Beta (not needed here).

**Netlify** — `@astrojs/netlify` v7 is GA for Astro 6. Docs are markdown-native (`docs.netlify.com/llms.txt`, `.md` suffix on any page) and the official `netlify/netlify-mcp` server is presented as production-ready (Claude Code support specifically still "coming soon" per its own repo — Partial-leaning-Pass). The real gap: **no dedicated CLI rollback command** — only the dashboard's "Publish deploy" button or a raw API call, a genuine "requires a browser" hole (Partial on CLI-first). 2026's credit-based pricing model also makes exact cost harder to forecast than Cloudflare's flat request quota.

**Render** — GA CLI (`render deploys create/list`, `render logs`) but, like Netlify, no dedicated rollback subcommand — only the dashboard or a REST API call (Partial). Free web services spin down after 15 minutes idle, adding a ~1-minute cold start on the next request — a real UX hit for a sporadically-used hobby app. Requires switching to `@astrojs/node`. MCP server exists but is newly-added (Partial, preview-stage).

**Fly.io** — True persistent VMs with native WebSocket support (not needed here) and docs on GitHub as MDX. But the general free tier was discontinued in October 2024 — realistic cost is $2–10/month minimum even at low traffic, contradicting the stated cost-minimization priority. Requires switching to `@astrojs/node` and authoring a Dockerfile from scratch (none exists today). MCP integration (`superfly/flymcp`) is early-stage/experimental (4 commits).

**Railway** — Similar profile to Fly.io: real persistent containers, remote MCP server at `mcp.railway.com`, but no perpetual free tier (one-time $5 trial credit, then $5–10/month realistic cost), no dedicated rollback command (only `railway redeploy` against the last deployment), and — like Fly.io/Render — requires an `@astrojs/node` adapter swap plus binding the server to `0.0.0.0` explicitly (Railway's docs call out that missing this causes 502s).

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Highest score and the only platform requiring zero migration — the project is already built against `@astrojs/cloudflare` with a working `wrangler.jsonc`. Wins the cost-minimization and existing-familiarity interview answers outright, and the "no persistent connections needed" answer removes the one advantage (long-lived processes) that VM-based competitors would otherwise offer.

#### 2. Vercel

The closest alternative with the same "no infrastructure to manage" serverless model as Cloudflare, excellent agent-readable docs (`llms-full.txt`), and a very generous Hobby free tier. Loses to Cloudflare on migration cost (full adapter swap required) and carries a non-commercial-use restriction on the free tier that Cloudflare's free tier doesn't have.

#### 3. Netlify

A viable third option with GA docs and an official, actively-promoted MCP server. Loses ground on the missing CLI rollback command (dashboard/API only) and a newer, less-predictable credit-based pricing model — plus, like Vercel, requires a full adapter swap from the already-working Cloudflare setup.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Adapter churn already happened once.** `@astrojs/cloudflare` v13 dropped Pages support outright in a single major version — a project betting on this adapter is exposed to the same kind of breaking change again before this MVP ships, and this project's own `tech-stack.md` hand-off already shows the scar: it still says `deployment_target: cloudflare-pages`.
2. **`workerd` is not Node.** CommonJS-only dependencies, or ones relying on Node internals beyond `nodejs_compat`'s coverage, can fail — sometimes only at `wrangler deploy`, not in local dev, depending on which code path exercises the gap.
3. **No rollback of bound resources.** `wrangler rollback` reverts code but not secrets or bound resource state — a code/environment mismatch that's easy to miss mid-incident if a secret rotation happened alongside a bad deploy.
4. **CPU-time billing, not request-count billing.** Free/paid tiers meter CPU-ms per invocation; a recipe-search algorithm that turns out more compute-heavy than expected could approach limits in a way a "requests per month" mental model wouldn't predict.
5. **The one Partial score is the one that matters most for agent ops.** Cloudflare's own Observability MCP server is explicitly labeled work-in-progress — exactly the tool an agent would reach for to query live logs/metrics without parsing `wrangler tail` output.

### Pre-Mortem — How This Could Fail

Six months in, the solo after-hours developer never reconciled `tech-stack.md`'s `cloudflare-pages` hint with the Workers-only reality already live in the repo. A late-night AI-assisted session, working from that stale hint, followed a Pages-specific tutorial and burned most of a week chasing a `pages_build_output_dir` setting that doesn't exist for Workers — a full third of the three-week budget gone before the mismatch was caught. Separately, a rushed dependency added for the color-matching logic turned out to be CommonJS-only; it worked fine under `npm run dev` (also `workerd`) but broke only at `wrangler deploy` with an opaque module-resolution error and no local repro path. With no teammate to unblock a solo developer, that failure ate the last weekend before the self-imposed deadline, and the actual point of the app — the recipe-generation feature — never shipped.

### Unknown Unknowns

- `tech-stack.md`'s `deployment_target: cloudflare-pages` is already stale relative to the actual installed adapter (Workers-only, confirmed by reading `package.json` and `wrangler.jsonc`) — a documentation-drift risk baked into this project's own artifacts right now, not a hypothetical.
- Workers bills CPU time, not wall-clock time — an I/O-light but computation-heavy recipe-search loop could burn the free tier's CPU-ms budget faster than a naive request-count estimate suggests, even at genuinely low traffic.
- Local dev now runs the *actual* `workerd` runtime via the Cloudflare Vite plugin (a recent Astro 6 + adapter v13 change) — so the old "dev is Node, prod is Workers" mental model that explains a lot of stale tutorial/Stack-Overflow advice no longer applies, and following that outdated advice can send debugging in the wrong direction.
- `wrangler.jsonc`'s `compatibility_date` is pinned to `2026-05-08` — some Workers behaviors this research treats as "current" apply only from later compatibility dates; the project won't actually have them until that date is bumped.
- Supabase auth cookies are handled server-side via `@supabase/ssr` on every request (`src/middleware.ts`); Workers isolates are ephemeral with no built-in session cache, so the Supabase network round-trip happens on every authenticated request. Worth checking against the PRD's "recipe generation is fast" success criterion once auth sits in front of it.
- Cloudflare's free-tier limits reset daily, not monthly — a sudden traffic burst (e.g., the hobby project getting shared somewhere) could hit a daily ceiling and 500 for the rest of that day even though the monthly average looks trivial.

## Operational Story

- **Preview deploys**: `wrangler versions upload` creates a preview version with its own URL without promoting it to production; no PR-to-preview automation is wired up yet — the current `.github/workflows/ci.yml` runs `astro sync && lint && build` only, no deploy step.
- **Secrets**: `SUPABASE_URL` / `SUPABASE_KEY` are declared as server-only, optional secrets in `astro.config.mjs`'s `env.schema` (per `CLAUDE.md`'s documented pattern). Locally they live in `.dev.vars` (gitignored, not yet present — `.env.example` shows the two required keys); in production they're set via `wrangler secret put <NAME>` or the Cloudflare dashboard, never committed to the repo.
- **Rollback**: `wrangler rollback [<version-id>]` — a single deterministic command; omit the id to revert to the immediately-prior deployment. Does not roll back secrets or bound resources — those must be checked separately.
- **Approval**: Routine `wrangler deploy` runs can be agent-driven. Rotating Supabase credentials, changing production secrets, or any other irreversible action stays human-only, per this repo's own `CLAUDE.md` guardrail on production access.
- **Logs**: `wrangler tail` streams live logs from the deployed Worker (last 100 events on connect, then live); `wrangler.jsonc` already has `observability.enabled: true`, which also surfaces structured request logs in the Cloudflare dashboard.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `tech-stack.md` says `deployment_target: cloudflare-pages` but the installed adapter is Workers-only | Unknown unknowns | H | M | Update `tech-stack.md`'s `hints.deployment_target` to reflect Workers, so a future session doesn't chase stale Pages-specific guidance |
| A CommonJS-only or Node-internals-dependent npm package breaks only at `wrangler deploy`, not in local dev | Devil's advocate | L | M | Before adding a new dependency, check it ships an ESM build; verify with a real `wrangler deploy` to a preview version before assuming a dependency is safe |
| `wrangler rollback` doesn't revert secrets or bound resources | Devil's advocate | L | M | If a deploy pairs a code change with a secret rotation, document that pairing so an incident rollback knows to also check secret state |
| Recipe-generation algorithm burns CPU-ms faster than a request-count estimate predicts | Devil's advocate / Unknown unknowns | M | M | Watch `wrangler tail`/dashboard CPU-time metrics once the recipe algorithm is implemented; profile before assuming free-tier headroom |
| Cloudflare's Observability MCP server is work-in-progress | Devil's advocate | L | L | If adopting MCP-based ops tooling, verify current behavior rather than assuming maturity; `wrangler tail` remains the fallback |
| Supabase auth adds a network round-trip on every authenticated request (no session cache in ephemeral isolates) | Unknown unknowns | M | M | Load-test the signed-in recipe-generation path against the PRD's "fast" success criterion once auth and recipe generation are both live |
| Daily (not monthly) reset on free-tier request/CPU limits | Unknown unknowns | L | M | If a traffic spike is expected (e.g., sharing the project publicly), check daily usage in the dashboard rather than assuming monthly averages protect against throttling |

## Getting Started

1. Fix the stale hand-off first: update `context/foundation/tech-stack.md`'s `hints.deployment_target` from `cloudflare-pages` to the actual Workers-only target, so this doesn't mislead a future session or agent.
2. Set up local secrets: create `.dev.vars` (gitignored) with `SUPABASE_URL` and `SUPABASE_KEY`, matching the keys in `.env.example` — see `README.md`'s Supabase Configuration section for local (`npx supabase start`) vs. hosted setup.
3. Build and deploy: `npm run build && npx wrangler deploy`.
4. Set production secrets once, before the first real deploy: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.
5. Verify: `npx wrangler tail` while exercising the deployed app's auth routes (`/auth/signin`, `/auth/signup`) to confirm they work against production secrets, not local ones.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (current CI runs lint + build only; wiring `wrangler deploy` into GitHub Actions is a separate follow-up)
- Production-scale architecture (multi-region, HA, DR)
