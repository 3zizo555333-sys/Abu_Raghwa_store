import { describe, expect, it } from "vitest";
import { getCashierSaleValues, repriceCashierCart, type CashierCartItem } from "./cashierPricing";

describe("cashier tier pricing", () => {
  const product = {
    retailPrice: 10,
    wholesaleRetailPrice: 8,
    bulkPrice: 6,
    loyaltyPoints: 1,
    retailLoyaltyPoints: 3,
    subWholesaleLoyaltyPoints: 2,
    wholesaleLoyaltyPoints: 0.5,
  };

  it("selects the corresponding price and points for each sale tier", () => {
    expect(getCashierSaleValues(product, "retail")).toMatchObject({ unitPrice: 10, loyaltyPoints: 3 });
    expect(getCashierSaleValues(product, "wholesale")).toMatchObject({ unitPrice: 8, loyaltyPoints: 2 });
    expect(getCashierSaleValues(product, "bulk")).toMatchObject({ unitPrice: 6, loyaltyPoints: 0.5 });
  });

  it("reprices every cart line and its total and points immediately", () => {
    const cart: CashierCartItem[] = [{
      productId: "p-1",
      name: "منظف",
      quantity: 2,
      unitPrice: 10,
      total: 20,
      unit: "قطعة",
      loyaltyPoints: 3,
      prices: { retail: 10, wholesale: 8, bulk: 6 },
      points: { retail: 3, wholesale: 2, bulk: 0.5 },
    }];

    expect(repriceCashierCart(cart, "bulk")[0]).toMatchObject({ unitPrice: 6, total: 12, loyaltyPoints: 0.5 });
    expect(cart[0]).toMatchObject({ unitPrice: 10, total: 20, loyaltyPoints: 3 });
  });

  it("keeps the existing retail fallback for missing tier values", () => {
    expect(getCashierSaleValues({ retailPrice: 9, loyaltyPoints: 4 }, "wholesale")).toMatchObject({ unitPrice: 9, loyaltyPoints: 4 });
    expect(getCashierSaleValues({ retailPrice: 9, loyaltyPoints: 4 }, "bulk")).toMatchObject({ unitPrice: 9, loyaltyPoints: 4 });
  });
});
