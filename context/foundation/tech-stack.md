---
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-paint-mixer
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
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
---

## Why this stack

10xPaintMixer is a solo, after-hours MVP with a 3-week budget and one must-have
technology-forcing feature: email/password auth (FR-001). The recommended
default for (web-app, js) is 10x Astro Starter, an opinionated full-stack
pick that bundles Astro + React + TypeScript + Tailwind with Supabase
(Postgres + auth + storage) and Cloudflare Pages/Workers deploy — covering
auth and data persistence out of the box so the short timeline goes toward
the color-mixing recipe logic instead of stack plumbing. Bootstrapper
confidence is first-class: the CLI is registered and expected to work, though
not yet battle-tested end-to-end, so minor manual steps are possible.
Deployment stays on the starter's own default, cloudflare-workers (the
`@astrojs/cloudflare` adapter dropped Pages support in v13; confirmed via
`/10x-infra-research` against the installed v13.5.0 and the project's
Workers-only `wrangler.jsonc`), and CI runs
on GitHub Actions with auto-deploy-on-merge — the standard shape for a solo
project with no staging-gate requirement.
