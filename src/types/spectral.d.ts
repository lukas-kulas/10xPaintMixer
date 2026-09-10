/**
 * spectral.js (v3.0.0) ships no TypeScript types. This ambient declaration covers
 * only the API surface this codebase actually calls — not the full library.
 * See context/changes/generate-color-recipe/spectral-js-api-reference.md.
 */
declare module "spectral.js" {
  export class Color {
    constructor(input: string | number[]);
    readonly sRGB: number[];
    readonly OKLab: number[];
    tintingStrength: number;
    toString(options?: { format?: string; method?: string }): string;
  }

  export function mix(...colors: [Color, number][]): Color;
}
