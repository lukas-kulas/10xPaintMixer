# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — dev server (runs under Cloudflare's `workerd` runtime via the Astro Cloudflare adapter, not plain Node)
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the production build
- `npm run lint` / `npm run lint:fix` — ESLint (type-checked rules; requires `npx astro sync` first if `.astro/types.d.ts` is stale)
- `npm run format` — Prettier (astro + tailwind-class-sorting plugins)
- `npm run test` — Vitest (`unit` project: plain-Node, no I/O; `integration` project: real `workerd` via `@cloudflare/vitest-pool-workers`, some suites requiring a running local Supabase — see `context/foundation/test-plan.md` §6)

CI (`.github/workflows/ci.yml`) runs `npx astro sync && npm run lint && npm run build` on push/PR to `master`; the Vitest suites are not yet a required CI gate (`test-plan.md` §3 Phase 4).

## Architecture

Astro 6 in `output: "server"` mode + React 19 islands, deployed to Cloudflare Workers via `@astrojs/cloudflare`. Supabase provides both auth and app data — `brands`/`paint_types`/`paints` (shared catalog, authenticated-read) plus `user_paints`/`recipes` (per-user, owner-only via Row Level Security: `auth.uid() = user_id`) — see README's Supabase Configuration section for local vs. cloud setup.

- **Server-only Supabase client** (`src/lib/supabase.ts`): built per-request from `astro:env/server` (`SUPABASE_URL`, `SUPABASE_KEY`), declared `optional` in `astro.config.mjs`'s `env.schema`. `createClient()` returns `null` when either var is unset — every caller must handle that case (pattern in `src/pages/api/auth/signin.ts`). Never move these into `astro:env/client`.
- **Route protection**: `src/middleware.ts` creates the Supabase client per request, resolves `context.locals.user` (typed in `src/env.d.ts`), and redirects to `/auth/signin` for any path matching the `PROTECTED_ROUTES` array. Add new protected paths there rather than checking auth ad hoc inside pages.
- **Auth flow is form-POST, not fetch/JSON**: the React forms in `src/components/auth/*` submit natively (`method="POST" action="/api/auth/..."`) to the Astro API routes in `src/pages/api/auth/{signin,signup,signout}.ts`, which call Supabase directly and respond with `redirect()`, passing failures as an `?error=` query param rather than a JSON body.
- **Config-status pattern** (`src/lib/config-status.ts`): centralizes "is this external service configured" checks for surfacing setup guidance in the UI (currently just Supabase). Add new services here rather than scattering ad hoc config checks; note the user-facing message is in Polish.
- **Component split**: `.astro` for static/layout pieces (`src/components/{Banner,Topbar,Welcome}.astro`, `src/layouts/Layout.astro`); React `.tsx` for interactive islands (`src/components/auth/*`). `src/components/ui/` follows shadcn/ui conventions (`components.json`, `cn()` helper in `src/lib/utils.ts` combining `clsx` + `tailwind-merge`) — add new primitives with `npx shadcn add <component>` rather than hand-rolling.
- **Path alias**: `@/*` → `src/*` (set in both `tsconfig.json` and `components.json`).
- **Tailwind v4**: config is CSS-first, in `src/styles/global.css` — there is no `tailwind.config.*` file.

## Guardrails

- Never write to `context/archive/` — archived changes are immutable. If a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead." (Restated here from the 10x-cli block below so it isn't missed at the bottom of the file.)
- Production access is scoped, not master keys, and destructive actions (drop a database, rotate a primary secret, delete a project) are human-only, even if the agent suggests them. Tokens live in env vars, never committed to the repo. (Restated from the 10x-cli block's "Production-access boundary" section.)

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 1

Open Module 3 by producing a **durable, risk-first quality contract** before any test is written — then drive each rollout phase through the standard change chain.

```
PRD + roadmap + archive
        │
        ▼
   /10x-test-plan  ──►  context/foundation/test-plan.md  (strategy §1–§5 frozen + cookbook §6 grows)
        │
        ▼  (one rollout phase at a time, /clear between handoffs)
   /10x-new ──► /10x-research ──► /10x-plan ──► /10x-implement
```

`/10x-test-plan` is a **stateful orchestrator**, not a one-shot generator. On first run it writes the phased rollout to `context/foundation/test-plan.md`. On every subsequent run it re-derives state from on-disk artifacts and presents the next handoff. The lesson focus is **strategy and rollout sequencing, not configuration**. Hooks, MCP servers, and CI YAML are configured in later lessons of this module.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Quality strategy as a rules-file (lesson focus)** | |
| `/10x-test-plan` | You have a PRD (and ideally a roadmap and a few archived slices) and you are about to write the project's first tests, or you noticed that AI-generated tests are landing on helpers while critical flows go uncovered. First invocation runs discovery (PRD + roadmap + archive + hot-spot scan), a 5-question user interview, and a synthesis pass with a mandatory challenger check, then writes `test-plan.md` in `context/foundation/` with a risk map (5–7 failure scenarios), a phased rollout table, a stack table, a quality-gates table, a cookbook section (`§6`, fills in as phases ship), and a negative-space section (what we deliberately don't test). Subsequent invocations advance the rollout one handoff at a time. |
| `/10x-test-plan --status` | A `test-plan.md` already exists and you want a compact snapshot of where the rollout stands — which phases are `not started`, `change opened`, `researched`, `planned`, `implementing`, or `complete`, and what the next action is. Does no work; safe to run any time. |
| `/10x-test-plan --refresh` | A `test-plan.md` already exists and one of: a new top-3 risk surfaced from the roadmap or archive, a tool's `checked:` date is older than three months, the project's tech stack changed, or §7 negative-space no longer matches what the team believes. Opens a new `test-plan-refresh-<YYYY-MM-DD>` change folder rather than editing the guide in place. |

### Rollout chain — what happens after the guide is written

The guide's §3 *Phased Rollout* table is the orchestrator's state. For each non-`complete` row the orchestrator selects the next handoff based on which artifacts exist in `context/changes/<change-id>/`:

| State on disk | Next handoff | Status transitions to |
| --- | --- | --- |
| change folder missing | `/10x-new <change-id>` | `change opened` |
| `change.md` only | `/10x-research` (with a risks-to-verify brief) | `researched` |
| `+ research.md` | `/10x-plan` (with cost × signal + cookbook-update constraints) | `planned` |
| `+ plan.md` with pending `## Progress` items | `/10x-implement <change-id> phase <N>` | `implementing` / `complete` |
| `+ plan.md` fully `[x]` | Mark §3 row `complete`; loop to next pending row | — |

Each handoff is a **STOP point**. The orchestrator copies the next command to the clipboard, asks the user to `/clear` and run it, then exits. Re-invoke `/10x-test-plan` (no arguments) to advance.

### Risk-first prioritization rules

- Risks are **failure scenarios in user / business terms**, not test names. "Logged-out user reaches paid content via stale token" is a risk; "test the login form" is not.
- 5 to 7 risks. Fewer is too coarse; more makes prioritization useless.
- Impact and likelihood are user/business ratings, not technical complexity.
- Every risk traces to a source: PRD section, archived slice, roadmap entry, Phase 2 interview question, hot-spot **directory** with churn count, or a tech-stack constraint. No invented risks.
- **Signal, not knowledge.** §2 cites *evidence that raised the risk*, never a file as "where the failure lives." File:line anchors, function names, schema names, and module names are forbidden in §2 — they belong in `/10x-research`'s output, produced per rollout phase against current code. The plan is a QA spec; it is not a code audit.
- Coverage is not the metric. **Risk coverage** is the metric.

### Dual-layer mapping rules

- Classic layer first: the cheapest test that gives a real signal wins. Promote to e2e only when no cheaper layer covers the risk.
- AI-native layer second, and only where it adds signal classic tests do not give cheaply.
- Every AI-native row has a **"When NOT to use"** line. If you cannot write one, drop the row.
- Every tool name carries a `checked: <YYYY-MM-DD>` date. Tool names are examples of the category, not endorsements.
- Both layers must be non-empty in the final guide if the project warrants them. Classic-only is a 2020 plan; AI-native-only is hype. AI-native phases are not mandatory — include them only when the brief justified them under cost × signal.

### Quality gates rules

- Required gates (lint, typecheck, unit+integration, e2e on critical flows) must map to actual CI steps. If a required gate is not yet wired, mark it as `required after §3 Phase <N>` and let the named rollout phase wire it.
- Post-edit hook is **recommended local**, not a CI substitute.
- Multimodal visual review is **selective**, applied to 1–3 critical screens, not to every page.
- Vision-driven fallback (Anthropic Computer Use or OpenAI CUA) is reserved for DOM-unreachable surfaces; expensive per action.

### Cookbook patterns (§6) — fills in over time

`test-plan.md` is both a phased strategy and a **growing cookbook**. §6 starts as placeholders (`TBD — see §3 Phase <N>`) and fills in incrementally — each rollout phase's plan ends with a sub-phase that updates the relevant §6 entry (location, naming, reference test, run command). After Module 3 completes, §6 becomes the canonical answer to "how do I add a test for X in this project?" — and is what `/10x-tdd` reads in Lesson 2.

### Lesson boundaries

- Do not write test code. That is Lesson 2 (`/10x-tdd` and unit-test authoring).
- Do not configure hooks, hook lifecycle, or debugging hooks. That is Lesson 3.
- Do not configure MCP servers, Playwright API, e2e code, or multimodal scenario code. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test workflow. That is Lesson 5.
- Do not author CI/CD pipelines from scratch or write GitHub Actions YAML. The guide names gates; configuration is owned by Module 1 Lesson 5 and Module 2 Lesson 5.
- Do not benchmark multimodal models. Cite criteria (cost, latency, agent-friendliness), never a ranking.
- Do not read the codebase for knowledge (call graphs, schemas, "which file owns this failure"). That is `/10x-research`'s job, per rollout phase.

### Paths used by this lesson

- `context/foundation/test-plan.md` — the quality contract produced and maintained by `/10x-test-plan`
- `context/foundation/prd.md` — primary risk source
- `context/foundation/roadmap.md` — likelihood weighting
- `context/foundation/tech-stack.md` — stack input (when present)
- `context/archive/<change-id>/plan.md` — implemented risk surface
- `context/changes/<change-id>/` — per-rollout-phase change folder (one per row in §3)

<!-- END @przeprogramowani/10x-cli -->
