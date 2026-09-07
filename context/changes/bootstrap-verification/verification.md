---
bootstrapped_at: 2026-09-07T19:25:29Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: 10x-paint-mixer
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-paint-mixer
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

10xPaintMixer is a solo, after-hours MVP with a 3-week budget and one must-have technology-forcing feature: email/password auth (FR-001). The recommended default for (web-app, js) is 10x Astro Starter, an opinionated full-stack pick that bundles Astro + React + TypeScript + Tailwind with Supabase (Postgres + auth + storage) and Cloudflare Pages/Workers deploy — covering auth and data persistence out of the box so the short timeline goes toward the color-mixing recipe logic instead of stack plumbing. Bootstrapper confidence is first-class: the CLI is registered and expected to work, though not yet battle-tested end-to-end, so minor manual steps are possible. Deployment stays on the starter's own default, cloudflare-pages, and CI runs on GitHub Actions with auto-deploy-on-merge — the standard shape for a solo project with no staging-gate requirement.

## Pre-scaffold verification

| Signal      | Value                                                      | Severity | Notes                                                                |
| ----------- | ------------------------------------------------------------ | -------- | --------------------------------------------------------------------- |
| npm package | not run                                                       | n/a      | `cmd_template` starts with `git clone`; no npm CLI package to check   |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-08-22    | fresh    | from card `docs_url`                                                  |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 0 moved silently; 17 sidelined as `.scaffold` siblings
**Conflicts (.scaffold siblings)**: `.env.example`, `.nvmrc`, `.prettierrc.json`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `package-lock.json`, `package.json`, `tsconfig.json`, `wrangler.jsonc`, `README.md`, `.github/`, `.husky/`, `.vscode/`, `public/`, `src/`, `supabase/`
**.gitignore handling**: append-merged (scaffold's copy was byte-identical to cwd's — no new lines added)
**.bootstrap-scaffold cleanup**: deleted (including its cloned `.git/`, removed before move-up)

This was a re-run into an already-populated cwd (a prior bootstrap run had already completed successfully on 2026-09-07T18:58:05Z per the previous `verification.md`, now overwritten by this file). Every top-level path in the fresh clone collided with an existing file or directory from that prior run, so nothing moved silently this time — the entire scaffold was sidelined per the conflict matrix.

Two deviations from the literal matrix, noted for the audit trail:

- **`CLAUDE.md`**: the freshly-cloned copy was byte-identical to the existing `CLAUDE.md.scaffold` sibling left by the prior run, so the redundant duplicate was dropped rather than creating a second sibling (there is no `.scaffold.scaffold` convention).
- **`node_modules/`**: discarded rather than sidelined as `node_modules.scaffold`. It is a gitignored, reproducible build artifact installed from the same `package-lock.json` already present in cwd; duplicating several hundred MB with no diff value contradicts the sibling convention's purpose (`diff <file> <file>.scaffold`), which doesn't apply to a directory of installed packages.

`context/` in the scaffold: none present — nothing to drop.

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 1 CRITICAL, 14 HIGH, 7 MODERATE, 3 LOW
**Direct vs transitive**: 0/1/2/0 direct of total 1/14/7/3 (per-advisory `isDirect` flag)

Findings are unchanged from the prior run — same starter, same lockfile, same dependency tree.

#### CRITICAL findings

- **tar** (transitive via `supabase`) — multiple advisories: PAX size override causing tar-parser interpretation differential (file smuggling), process crash via PAX numeric path type confusion, decompression/parse DoS via unlimited input, negative entry size causing infinite loop, uncaught exception DoS via NUL byte in PAX records, uncontrolled recursion causing stack-overflow DoS via crafted long-path tar. Fix available.

#### HIGH findings

- **astro** (direct) — multiple XSS advisories (unescaped spread attribute names, `transition:*` directive values, View Transition animation properties, unescaped slot name), Host header SSRF in prerendered error page fetch, plus advisories inherited from `esbuild`/`sharp`. Fix available.
- **brace-expansion** (transitive) — DoS via exponential-time / unbounded expansion. Fix available.
- **browserslist** (transitive) — unbounded memory growth; uncaught crash via untrusted stats file. Fix available.
- **devalue** (transitive) — DoS via sparse array deserialization. Fix available.
- **fast-uri** (transitive) — host confusion / SSRF via malformed URI normalization. Fix available.
- **js-yaml** (transitive) — quadratic-complexity DoS in merge-key / `!!omap` handling. Fix available.
- **miniflare** (transitive via `sharp`/`undici`/`ws`) — inherited advisories. Fix available.
- **nanoid** (transitive) — generators can loop indefinitely with negative/zero size. Fix available.
- **postcss** (transitive) — path traversal / arbitrary `.map` file disclosure via `sourceMappingURL`. Fix available.
- **sharp** (transitive) — inherited libvips CVEs. Fix available.
- **svgo** (transitive) — `removeScripts` plugin leaves some executable scripts intact. Fix available.
- **undici** (transitive) — multiple advisories (TLS bypass via SOCKS5 proxy, header injection, WS DoS, cache poisoning, cross-user info disclosure). Fix available.
- **vite** (transitive) — NTLMv2 hash disclosure via UNC path (Windows); `server.fs.deny` bypass on Windows. Fix available.
- **ws** (transitive) — uninitialized memory disclosure; memory-exhaustion DoS via tiny fragments. Fix available.

#### MODERATE findings

- **@astrojs/language-server** (transitive via `volar-service-yaml`)
- **@cloudflare/vite-plugin** (transitive via `miniflare`/`wrangler`/`ws`)
- **supabase** (direct) — via `tar`
- **volar-service-yaml** (transitive via `yaml-language-server`)
- **wrangler** (direct) — via `esbuild`/`miniflare`
- **yaml** (transitive) — stack overflow via deeply nested collections
- **yaml-language-server** (transitive via `yaml`)

All fix-available per `npm audit`.

#### LOW / INFO findings

- **@babel/core** (transitive) — arbitrary file read via `sourceMappingURL` comment
- **esbuild** (transitive) — arbitrary file read on Windows dev server
- **postcss-selector-parser** (transitive) — DoS via uncontrolled AST recursion

All fix-available per `npm audit`.

## Hints recorded but not acted on

| Hint                    | Value                 |
| ----------------------- | --------------------- |
| bootstrapper_confidence | first-class           |
| quality_override        | false                  |
| path_taken              | standard               |
| self_check_answers      | null                   |
| team_size               | solo                   |
| deployment_target       | cloudflare-pages       |
| ci_provider              | github-actions         |
| ci_default_flow          | auto-deploy-on-merge   |
| has_auth                | true                   |
| has_payments            | false                  |
| has_realtime            | false                  |
| has_ai                  | false                  |
| has_background_jobs     | false                  |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- This run produced 17 fresh `.scaffold` siblings on top of the one (`CLAUDE.md.scaffold`) left by the prior run. Since your project was already fully scaffolded before this re-run, review whether you actually need the new siblings — most are probably safe to delete (`rm *.scaffold .github.scaffold .husky.scaffold .vscode.scaffold public.scaffold src.scaffold supabase.scaffold` after confirming with `diff` that nothing you've since edited got shadowed).
- `git init` (if you have not already) to start your own repo history — a `.git/` already exists in cwd, so this is likely already done.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log. `npm audit fix` resolves most of them (all 25 advisories report a fix available); re-run `npm audit` afterward to confirm.
