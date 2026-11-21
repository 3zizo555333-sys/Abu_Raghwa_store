import { describe, expect, it } from "vitest";
import {
  calculateApartmentValuation,
  calculateFormulationOnHand,
  calculateRawMaterialValuation,
  createInventoryValuationItem,
  summarizeInventory,
  type InventoryValuationItem,
} from "./inventoryValuation";

const item = (overrides: Partial<InventoryValuationItem> = {}): InventoryValuationItem => ({
  id: "test:1", name: "صنف", section: "products", sectionName: "منتجات", category: "منظفات",
  quantity: 2, unit: "عبوة", unitCost: 10, unitSalePrice: 15,
  capital: 20, expectedSales: 30, expectedProfit: 10, marginPercent: 100 / 3,
  ...overrides,
});

describe("inventory valuation calculations", () => {
  it("aggregates weighted totals and margin rather than averaging item percentages", () => {
    const summary = summarizeInventory([item(), item({ id: "test:2", quantity: 1, unitCost: 100, unitSalePrice: 110, capital: 100, expectedSales: 110, expectedProfit: 10, marginPercent: 100 / 11 })]);
    expect(summary).toMatchObject({ capital: 120, expectedSales: 140, expectedProfit: 20, itemCount: 2 });
    expect(summary.marginPercent).toBeCloseTo(20 / 140 * 100, 8);
  });

  it("values apartment cartons and extra pieces proportionally", () => {
    expect(calculateApartmentValuation({ quantity: 2, extraPieces: 5, piecesPerUnit: 10, wholesalePrice: 100, retailPrice: 150 })).toEqual({
      equivalentUnits: 2.5, capital: 250, expectedSales: 375,
    });
  });

  it("uses the recorded material unit price or derives it from the same recorded quantity", () => {
    expect(calculateRawMaterialValuation({ quantity: 3, totalWeight: 10, totalPrice: 500, pricePerKilo: 40 })).toEqual({ quantity: 10, unitCost: 40, capital: 400 });
    expect(calculateRawMaterialValuation({ quantity: 4, totalWeight: 0, totalPrice: 200, pricePerKilo: 0 })).toEqual({ quantity: 4, unitCost: 50, capital: 200 });
    expect(createInventoryValuationItem({ id: "material:1", name: "خامة", section: "materials", sectionName: "الخامات", category: "الخامات", quantity: 4, unit: "كيلو", unitCost: 50, unitSalePrice: 0, capitalOnly: true }).expectedProfit).toBe(0);
  });

  it("subtracts formulation sales and adds only recorded returns without going below zero", () => {
    expect(calculateFormulationOnHand(20, 8, 2)).toBe(14);
    expect(calculateFormulationOnHand(2, 8, 1)).toBe(0);
  });
});
