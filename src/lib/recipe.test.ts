import { describe, expect, it } from "vitest";
import { CANDIDATE_POOL_SIZE, EmptyOwnedPaintsError, generateRecipe, type OwnedPaintInput } from "./recipe";

const target = { r: 200, g: 50, b: 50 };

function paint(id: string, r: number, g: number, b: number, typeName = "Standard"): OwnedPaintInput {
  return { id, r, g, b, typeName };
}

function assertOwnedPaintInvariant(ownedPaints: OwnedPaintInput[]) {
  const ownedIds = new Set(ownedPaints.map((p) => p.id));
  const result = generateRecipe(target, ownedPaints);
  expect(result.components.length).toBeGreaterThan(0);
  for (const component of result.components) {
    expect(ownedIds.has(component.paintId)).toBe(true);
  }
}

describe("generateRecipe — owned-paint invariant (Risk #1)", () => {
  it("uses only the owned paint when exactly one is owned", () => {
    assertOwnedPaintInvariant([paint("p1", 255, 0, 0)]);
  });

  it("uses only owned paints across mixed types, including a Washes paint", () => {
    assertOwnedPaintInvariant([
      paint("p1", 255, 0, 0),
      paint("p2", 250, 220, 180, "Washes"),
      paint("p3", 0, 0, 255),
      paint("p4", 255, 255, 0),
    ]);
  });

  it("uses only owned paints when the owned list exceeds the candidate shortlist size", () => {
    const ownedPaints = Array.from({ length: CANDIDATE_POOL_SIZE + 3 }, (_, i) =>
      paint(`p${i}`, (i * 17) % 256, (i * 61) % 256, (i * 113) % 256),
    );
    assertOwnedPaintInvariant(ownedPaints);
  });
});

describe("generateRecipe — empty-input guard (Risk #4 defense-in-depth)", () => {
  it("throws EmptyOwnedPaintsError when there are no owned paints, independent of any caller-side guard", () => {
    expect(() => generateRecipe(target, [])).toThrow(EmptyOwnedPaintsError);
  });
});
