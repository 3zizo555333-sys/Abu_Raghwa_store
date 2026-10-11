import { describe, expect, it } from "vitest";
import { getCartLoyaltyPointsTotal } from "./cashierLoyalty";

describe("cashier loyalty estimate", () => {
  it("multiplies each item's points by quantity and totals the invoice points", () => {
    expect(getCartLoyaltyPointsTotal([
      { loyaltyPoints: 30, quantity: 3 },
      { loyaltyPoints: 5, quantity: 2 },
    ])).toBe(100);
  });

  it("treats invalid or negative preview values as zero", () => {
    expect(getCartLoyaltyPointsTotal([
      { loyaltyPoints: -10, quantity: 2 },
      { loyaltyPoints: 30, quantity: Number.NaN },
    ])).toBe(0);
  });
});
