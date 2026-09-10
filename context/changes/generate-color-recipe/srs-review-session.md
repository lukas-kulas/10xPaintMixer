# S-04 (generate-color-recipe) — Library Research

> Research session, captured 2026-09-10. Answers: "what libraries are available to implement S-04?"
> Source: web search (Exa). Not a plan — informal input for `/10x-plan` when S-04 is picked up.

## Problem shape

S-04 needs two pieces:
1. **Pigment mixing simulation** — given a set of owned paints, simulate what color they produce when combined.
2. **Recipe/ratio search** — given a target color and the owned-paint set, find the ratio (or combination) that best approximates it.

Runtime constraint: this project deploys to Cloudflare Workers via `@astrojs/cloudflare` (`workerd` runtime, not plain Node) — any chosen library must be pure JS/TS with no native bindings and no reliance on unsupported Node APIs.

## 1. Pigment mixing simulation

| Library | What it does | License | Notes |
|---|---|---|---|
| **[spectral.js](https://spectraljs.com/)** (npm: `spectral.js`) | Kubelka-Munk pigment mixing via spectral reflectance curves; also provides OKLab/OKLCh conversion and ΔE-based gamut mapping. | **MIT** | Zero deps, actively maintained (v3.0, ~1.2k★ on GitHub), pure JS — safe for Workers. Best license fit for this project. |
| **[mixbox](https://scrtwpns.com/mixbox)** (npm: `mixbox`) | Also Kubelka-Munk based; simple RGB-in/RGB-out `lerp()` / latent-space API. Used in Procreate and other painting apps. | **CC-BY-NC-4.0 (non-commercial)** | ⚠️ License blocks commercial use without a paid commercial license from Secret Weapons. Flag as a decision point before adopting — otherwise the simplest API of the two. |

## 2. Nearest/target-color matching

| Library | What it does | License |
|---|---|---|
| **[color-diff](https://www.npmjs.com/package/color-diff)** (npm: `color-diff`) | CIEDE2000 ΔE calculation, RGB↔Lab conversion, `closest()`/`diff()` against a palette. Zero deps, mature (~400K weekly downloads). | BSD-3-Clause |

## 3. Recipe/ratio search (owned paints → target color)

No dominant off-the-shelf npm package found for "given N owned paints, find the mix ratio(s) closest to a target color." Reference implementations found (not directly reusable as libraries, but useful prior art):

- **[mixmypalette](https://github.com/elmuso/mixmypalette)** — Mixbox-powered, multi-branch evolutionary hill-climbing solver with CIE94 ΔE scoring; SolidJS app, not a library.
- **[artistassistapp](https://github.com/eugene-khyst/artistassistapp)** — hand-rolled empirical Kubelka-Munk model + own matrix/linear-algebra code; no external color-math deps at all.
- **[paintmixer](https://github.com/prsephton/paintmixer)** — simpler CMYK/reflective-model recipe generator with a pigment-strength calibration step.

Conclusion: expect to hand-roll a small optimizer on top of the mixing model above — a bounded grid/simplex search over ratios (fine for a small owned-paint set, deterministic, cheap enough for the NFR's "result within a few seconds") or a lightweight hill-climbing/evolutionary loop if arbitrary paint counts need support.

## Suggested combo

`spectral.js` (MIT, mixing) + `color-diff` (ΔE, match scoring) + a hand-rolled ratio search. All pure JS, no native bindings, Workers-safe, and consistent with this project's low-complexity goal (`main_goal: low-complexity` in roadmap.md). Surface the `mixbox` license issue explicitly if it comes up during `/10x-plan`, since its non-commercial license may be a blocker depending on intended use of the product.
