import { describe, expect, it } from "vitest";
import { getCatalogOrderLoyaltyPoints, getProductLoyaltyPoints } from "./catalog";

describe("catalog loyalty points", () => {
  it("uses the manager-defined whole number per product", () => {
    expect(getProductLoyaltyPoints({ loyaltyPoints: 10 })).toBe(10);
    expect(getProductLoyaltyPoints({ loyaltyPoints: 10.9 })).toBe(10);
    expect(getProductLoyaltyPoints({ loyaltyPoints: -4 })).toBe(0);
  });

  it("multiplies product points by quantity and combines products", () => {
    expect(getCatalogOrderLoyaltyPoints([
      { quantity: 2, loyaltyPoints: 10 },
      { quantity: 3, loyaltyPoints: 1 },
      { quantity: 1, loyaltyPoints: 0 },
    ])).toBe(23);
  });

  it("does not grant points for malformed or missing quantities", () => {
    expect(getCatalogOrderLoyaltyPoints([
      { quantity: 0, loyaltyPoints: 50 },
      { quantity: -2, loyaltyPoints: 20 },
      { quantity: Number.NaN, loyaltyPoints: 10 },
    ])).toBe(0);
  });
});
