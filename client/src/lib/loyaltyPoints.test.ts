import { describe, expect, it } from "vitest";
import { normalizeLoyaltyPoints, resolveProductLoyaltyPoints } from "./loyaltyPoints";

describe("normalizeLoyaltyPoints", () => {
  it("keeps optional loyalty points disabled when the field is empty or invalid", () => {
    expect(normalizeLoyaltyPoints("")).toBe(0);
    expect(normalizeLoyaltyPoints(undefined)).toBe(0);
    expect(normalizeLoyaltyPoints(-5)).toBe(0);
    expect(normalizeLoyaltyPoints("not-a-number")).toBe(0);
  });

  it("stores positive loyalty points as whole points", () => {
    expect(normalizeLoyaltyPoints("10")).toBe(10);
    expect(normalizeLoyaltyPoints(10.9)).toBe(10);
  });

  it("defaults a barcode-free product to 30 points per unit across all sale tiers", () => {
    expect(resolveProductLoyaltyPoints({
      isUnbarcoded: true,
      loyaltyPoints: "",
      retailLoyaltyPoints: "",
      subWholesaleLoyaltyPoints: "",
      wholesaleLoyaltyPoints: "",
    })).toEqual({ loyaltyPoints: 30, retailLoyaltyPoints: 30, subWholesaleLoyaltyPoints: 30, wholesaleLoyaltyPoints: 30 });
  });

  it("uses a custom shared value while retaining explicitly customized sale tiers", () => {
    expect(resolveProductLoyaltyPoints({
      isUnbarcoded: true,
      loyaltyPoints: "42",
      retailLoyaltyPoints: "42",
      subWholesaleLoyaltyPoints: "18",
      wholesaleLoyaltyPoints: "9",
    })).toEqual({ loyaltyPoints: 42, retailLoyaltyPoints: 42, subWholesaleLoyaltyPoints: 18, wholesaleLoyaltyPoints: 9 });
  });

  it("does not apply the unbarcoded default to a new barcoded product", () => {
    expect(resolveProductLoyaltyPoints({
      isUnbarcoded: false,
      loyaltyPoints: "",
      retailLoyaltyPoints: "",
      subWholesaleLoyaltyPoints: "",
      wholesaleLoyaltyPoints: "",
    })).toEqual({ loyaltyPoints: 0, retailLoyaltyPoints: 0, subWholesaleLoyaltyPoints: 0, wholesaleLoyaltyPoints: 0 });
  });
});
