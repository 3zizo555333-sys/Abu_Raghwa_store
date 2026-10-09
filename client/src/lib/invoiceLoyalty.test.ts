import { describe, expect, it } from "vitest";
import { getInvoiceLoyaltyPoints } from "./invoiceLoyalty";

describe("invoice loyalty points", () => {
  it("calculates points per product quantity", () => {
    expect(getInvoiceLoyaltyPoints({ items: [{ quantity: 1, loyaltyPoints: 20 }] })).toBe(20);
    expect(getInvoiceLoyaltyPoints({ items: [{ quantity: 2, loyaltyPoints: 20 }, { quantity: 1, loyaltyPoints: 5 }] })).toBe(45);
  });

  it("uses item points when an older sale stored zero", () => {
    expect(getInvoiceLoyaltyPoints({ loyaltyPointsAwarded: 0, items: [{ quantity: 1, loyaltyPoints: 20 }] })).toBe(20);
  });

  it("keeps a larger server-awarded total when present", () => {
    expect(getInvoiceLoyaltyPoints({ loyaltyPointsAwarded: 30, items: [{ quantity: 1, loyaltyPoints: 20 }] })).toBe(30);
  });
});
