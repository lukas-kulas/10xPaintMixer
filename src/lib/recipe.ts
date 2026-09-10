import { Color, mix } from "spectral.js";

export const CANDIDATE_POOL_SIZE = 12;
export const MAX_COMBINATION_SIZE = 3;
export const MAX_TOTAL_PARTS = 6;
export const WASHES_TINTING_STRENGTH = 0.4;
export const QUALITY_THRESHOLD = 0.02;

export class EmptyOwnedPaintsError extends Error {
  constructor() {
    super("No owned paints available to generate a recipe from.");
    this.name = "EmptyOwnedPaintsError";
  }
}

export interface OwnedPaintInput {
  id: string;
  r: number;
  g: number;
  b: number;
  typeName: string;
}

export interface RecipeResult {
  components: { paintId: string; parts: number }[];
  resultHex: string;
  distance: number;
  quality: "great" | "approximate";
}

interface Candidate {
  paint: OwnedPaintInput;
  color: Color;
}

function oklabDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function isLowestTerms(parts: number[]): boolean {
  return parts.reduce((acc, part) => gcd(acc, part)) === 1;
}

// Every length-`size` tuple of positive integers summing to <= maxTotal, already in lowest terms
// (so the search never scores two tuples that represent the same ratio, e.g. (2,2) vs (1,1)).
function integerRatioTuples(size: number, maxTotal: number): number[][] {
  const results: number[][] = [];

  function extend(remainingSlots: number, current: number[]) {
    if (remainingSlots === 0) {
      if (isLowestTerms(current)) results.push([...current]);
      return;
    }
    const usedSoFar = current.reduce((sum, part) => sum + part, 0);
    const maxForThisSlot = maxTotal - usedSoFar - (remainingSlots - 1);
    for (let part = 1; part <= maxForThisSlot; part++) {
      current.push(part);
      extend(remainingSlots - 1, current);
      current.pop();
    }
  }

  extend(size, []);
  return results;
}

function combinations(items: Candidate[], size: number): Candidate[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  const withFirst = combinations(rest, size - 1).map((combo) => [first, ...combo]);
  const withoutFirst = combinations(rest, size);
  return [...withFirst, ...withoutFirst];
}

/**
 * Searches small integer-ratio combinations (1-{@link MAX_COMBINATION_SIZE} paints, parts summing to
 * at most {@link MAX_TOTAL_PARTS}) of the owned paints nearest the target color, mixes each candidate
 * via spectral.js's Kubelka-Munk model, and returns the closest match.
 */
export function generateRecipe(
  target: { r: number; g: number; b: number },
  ownedPaints: OwnedPaintInput[],
): RecipeResult {
  if (ownedPaints.length === 0) {
    throw new EmptyOwnedPaintsError();
  }

  const targetColor = new Color([target.r, target.g, target.b]);

  const candidates: Candidate[] = ownedPaints.map((paint): Candidate => {
    const color = new Color([paint.r, paint.g, paint.b]);
    if (paint.typeName === "Washes") {
      color.tintingStrength = WASHES_TINTING_STRENGTH;
    }
    return { paint, color };
  });

  candidates.sort(
    (a, b) => oklabDistance(targetColor.OKLab, a.color.OKLab) - oklabDistance(targetColor.OKLab, b.color.OKLab),
  );
  const shortlist = candidates.slice(0, CANDIDATE_POOL_SIZE);

  let best: { components: { paintId: string; parts: number }[]; resultColor: Color; distance: number } | undefined;

  const maxSize = Math.min(MAX_COMBINATION_SIZE, shortlist.length);
  for (let size = 1; size <= maxSize; size++) {
    for (const subset of combinations(shortlist, size)) {
      for (const parts of integerRatioTuples(size, MAX_TOTAL_PARTS)) {
        const resultColor = mix(...subset.map((entry, i): [Color, number] => [entry.color, parts[i]]));
        const distance = oklabDistance(targetColor.OKLab, resultColor.OKLab);
        if (!best || distance < best.distance) {
          best = {
            components: subset.map((entry, i) => ({ paintId: entry.paint.id, parts: parts[i] })),
            resultColor,
            distance,
          };
        }
      }
    }
  }

  if (!best) {
    throw new Error("Recipe search produced no candidates despite a non-empty owned-paint list");
  }

  return {
    components: best.components,
    resultHex: best.resultColor.toString({ format: "hex" }),
    distance: best.distance,
    quality: best.distance < QUALITY_THRESHOLD ? "great" : "approximate",
  };
}
