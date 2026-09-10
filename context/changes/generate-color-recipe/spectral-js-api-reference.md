# spectral.js — API Reference

> Captured 2026-09-10. Source: [README.md @ 3.0.0](https://github.com/rvanwijnen/spectral.js/blob/3.0.0/README.md), [spectraljs.com](https://spectraljs.com/).
> Follow-up to the library selection in [srs-review-session.md](./srs-review-session.md), which picked `spectral.js` (MIT) as the pigment-mixing library for S-04. This file is the API detail needed to actually call it from `/10x-plan`/`/10x-implement` — not a plan itself.

## Install

```
npm install spectral.js
```

Pure JS, zero deps — no native bindings, so it should run under the Cloudflare Workers (`workerd`) runtime this project deploys to.

## `Color` class

```js
new spectral.Color('#002185')
new spectral.Color('rgb(0, 33, 133)')
new spectral.Color([0, 33, 133])
```

Properties:
- `R` — reflectance curve, 380–750nm
- `sRGB`, `lRGB`, `XYZ`, `OKLab`, `OKLCh` — color space representations
- `KS` — Kubelka-Munk absorption/scattering coefficients
- `luminance` — Y value from CIE XYZ
- `tintingStrength` — pigment intensity, default `1`, settable per-instance (`color.tintingStrength = 0.35`) to model weaker/stronger pigments

Methods:
- `inGamut({ epsilon })` — checks displayable-gamut membership
- `toGamut({ method: "clip" | "map" })` — corrects an out-of-gamut color
- `toString({ format, method })` — serializes back to hex/RGB string

## `spectral.mix(...)`

```js
spectral.mix([color1, 0.5], [color2, 0.5])
spectral.mix([color1, 1], [color2, 1], [color3, 1])
```

- Accepts any number of `[Color, weight]` pairs.
- Weights auto-normalize (whole-number ratios like `1, 1, 2` work directly).
- Returns a new `Color`.
- No documented cap on input count (the "2–4 colors" limit mentioned elsewhere applies only to a separate GLSL shader variant, not this JS API).

## `spectral.palette(color1, color2, steps)`

Returns an array of `Color` objects gradating between two colors. Likely not needed for S-04 (no gradient requirement in FR-005).

## `spectral.gradient(t, [c1, 0], [c2, 0.5], [c3, 1], ...)`

Interpolates a color at position `t` (0–1) along multi-color stops. Also likely not needed for S-04.

## Relevance to S-04 (generate-color-recipe)

`spectral.mix()` mixes colors **given** weights — it does not search for weights. S-04's actual job (target color + N owned paints → best-matching ratio) still needs a hand-rolled search on top, per the conclusion in `srs-review-session.md`:

1. Generate candidate weight combinations over the owned-paint set (bounded grid or simplex search — owned-paint counts are small, so this stays cheap).
2. For each candidate, call `spectral.mix([paint1, w1], [paint2, w2], ...)`.
3. Compare the mixed result to the target color in `OKLab`/`OKLCh` (perceptually uniform — Euclidean distance there is a reasonable match metric), or use `color-diff`'s CIEDE2000 ΔE as scored in the prior research.
4. Keep the closest candidate; stop within the NFR's "few seconds" budget by capping search iterations.
