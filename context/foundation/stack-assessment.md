---
project: "10x-astro-starter"
assessed_at: 2026-09-11T00:00:00Z
agent_readiness: ready
context_type: brownfield
stack_components:
  language: TypeScript (strict)
  framework: Astro 6 + React 19 islands
  build_tool: Vite (via Astro)
  test_runner: Vitest 4 (+ @cloudflare/vitest-pool-workers)
  package_manager: npm
  ci_provider: GitHub Actions
  deployment_target: Cloudflare Workers
gates_passed: 8
gates_failed: 0
---

## Stack Components

- **Language:** TypeScript, `^5.9.3`, running in strict mode (`tsconfig.json` extends
  `astro/tsconfigs/strict`). Applies end-to-end — `.ts`/`.tsx` and `.astro` files alike are
  type-checked (`@astrojs/check` wired into `astro sync`).
- **Framework:** Astro 6 (`output: "server"`), with React 19 islands for interactive
  components (`@astrojs/react`). File-based routing under `src/pages/`, island
  architecture keeps interactive surface area explicit and small.
- **Build tool:** Vite, used internally by Astro's build pipeline (`astro build` / `astro
  dev`). Pinned via an `overrides` entry (`vite: ^7.3.2`) in `package.json`.
- **Test runner:** Vitest `^4.1.0`, split into two projects (`unit`, `integration`) in
  `vitest.config.ts`. The `integration` project uses `@cloudflare/vitest-pool-workers` to
  run inside real `workerd`, with `@msw/cloudflare` for HTTP-layer mocking.
- **Package manager:** npm (`package-lock.json` present, committed).
- **CI/CD:** GitHub Actions (`.github/workflows/ci.yml`) — runs `astro sync && lint &&
  build` on push/PR to `master`. Test suites are not yet a required gate (tracked in
  `context/foundation/test-plan.md` §3 Phase 4).
- **Deployment:** Cloudflare Workers via `@astrojs/cloudflare` adapter, configured in
  `wrangler.jsonc`. Live at a `*.workers.dev` subdomain per
  `context/deployment/deploy-plan.md`.
- **Instruction files:** `CLAUDE.md` present at repo root — documents commands,
  architecture, and project-specific guardrails already.

This assessment evaluates the stack as a whole; `context/foundation/prd-v2.md` (the
in-flight brownfield change — saved recipes with notes) does not introduce any new stack
component, so no incremental scoring was needed for it.

## Quality Gate Assessment

| Component   | Typed | Convention | Training Data | Documented | Verdict |
|-------------|-------|------------|----------------|------------|---------|
| Language    | ✓     | —          | —              | —          | pass    |
| Framework   | —     | ✓          | ✓              | ✓          | pass    |
| Build tool  | —     | —          | ✓              | ✓          | pass    |
| Test runner | —     | —          | ✓              | ✓          | pass    |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

### Gate Details

**Typed — TypeScript, strict mode.**
Pass. `tsconfig.json:2` extends `astro/tsconfigs/strict`; `@astrojs/check` (present in
`package.json` dependencies) wires type-checking into `astro sync`, covering `.astro`
files too, not just `.ts`/`.tsx`. An agent can reason about input/output shapes from
source alone.

**Convention-based — Astro.**
Pass. Astro ships file-based routing (`src/pages/**`, confirmed: `src/pages/api/`,
`src/pages/dashboard/`, `src/pages/auth/`) and an island architecture that keeps
interactive React components isolated (`src/components/auth/*.tsx`,
`src/components/paints/*.tsx`, `src/components/recipe/*.tsx`) from static `.astro`
layout/page files (`src/layouts/Layout.astro`, `src/components/{Banner,Topbar,Welcome}.astro`).
A stranger can predict where a new route or component belongs without reading the whole
tree.

**Popular in training data — Astro + React.**
Pass. Astro is a mainstream choice within the JS meta-framework family (alongside
Next.js/Nuxt/SvelteKit) with a large, current corpus of examples and its own official
integrations ecosystem; React is the single most training-data-represented UI library.
Vite and Vitest are both top-tier within the JS build/test tooling family.

**Well-documented — Astro, React, Vite, Vitest.**
Pass. All four maintain current, versioned official docs (astro.build/docs,
react.dev, vite.dev, vitest.dev) with examples that track the installed major version
(Astro 6, React 19, Vitest 4 in this project).

No component failed a gate — there is nothing to compensate for.

## Gaps & Compensation

None. Every scored component passes every applicable gate. No compensation entries are
needed in `CLAUDE.md`/`AGENTS.md` for stack-related agent friction.

One adjacent, non-gate observation worth flagging (not a quality-gate failure, just a
maturity note): the integration test suite's `cross-user-authorization` coverage requires
a real local Supabase instance (`npx supabase start`) and is `describe.skipIf`-skipped
when `.env.test.local` is absent — including in CI today. This is already tracked as its
own open item in `context/foundation/test-plan.md` (§3 Phase 4, wiring test suites into
CI as required gates) and does not need duplicate tracking here.

### Recommended Instruction File Additions

None required — no gate failed. `CLAUDE.md` already documents the load-bearing
project-specific conventions (Supabase client pattern, route protection, auth flow shape,
config-status pattern, component split, path alias, Tailwind v4 CSS-first config) that go
beyond what the framework's own conventions cover.

## Summary

**Overall verdict: ready.** Every stack component — TypeScript (strict), Astro + React,
Vite, Vitest — passes all applicable agent-friendly criteria with no compensation needed.
The existing `CLAUDE.md` already captures the project-specific conventions an agent needs
beyond framework defaults.

**Key strengths:**
- End-to-end strict typing, including `.astro` files via `@astrojs/check`.
- Strong file-based conventions (routing, islands) that make navigation predictable.
- Mainstream, well-documented tooling across the whole chain (framework, build, test).
- An existing `CLAUDE.md` that already documents non-obvious project-specific patterns.

**Key gaps:** none at the quality-gate level. The one open item (integration test suite
not yet a required CI gate) is a process/rollout gap already tracked in
`context/foundation/test-plan.md`, not a stack-agent-friendliness gap.

**Recommended next step:** `/10x-health-check` — audits dependency health, the test
suite, and CI/CD coverage in more depth than this stack-level assessment covers.
