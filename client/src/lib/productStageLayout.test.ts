import { describe, expect, it } from "vitest";
import { arrangeProductStage } from "./productStageLayout";

describe("arrangeProductStage", () => {
  it.each([1, 2, 3, 4])("creates a bounded cluster for %i products", count => {
    const layers = Array.from({ length: count }, (_, index) => ({ id: `product-${index}` }));
    const arranged = arrangeProductStage(layers);

    expect(arranged).toHaveLength(count);
    expect(arranged.map(layer => layer.id)).toEqual(layers.map(layer => layer.id));
    for (const layer of arranged) {
      expect(layer.x).toBeGreaterThanOrEqual(0.12);
      expect(layer.x).toBeLessThanOrEqual(0.88);
      expect(layer.baseline).toBeGreaterThan(0.5);
      expect(layer.scale).toBeGreaterThan(0);
    }
    if (count > 1) expect(arranged[0].depth).toBeGreaterThan(arranged[1].depth);
  });

  it("caps output at four product layers", () => {
    const arranged = arrangeProductStage(Array.from({ length: 5 }, (_, index) => ({ id: String(index) })));
    expect(arranged).toHaveLength(4);
  });
});
