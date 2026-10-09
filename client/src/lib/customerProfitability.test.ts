import { describe, expect, it } from "vitest";
import { buildCustomerProfitabilityReport } from "./customerProfitability";

describe("customer profitability report", () => {
  it("aggregates multiple invoices for the same customer and subtracts delivered gift cost", () => {
    const rows = buildCustomerProfitabilityReport({
      sales: [
        { id: "INV-1", date: "2026-08-26T10:00:00.000Z", customerCode: "LOY-1", customerName: "محمد", customerPhone: "", total: 100, items: [{ productId: "p1", productName: "Oxy", selectedUnitType: "piece", quantity: 1, unitPrice: 100, total: 100 }] },
        { id: "INV-2", date: "2026-08-27T10:00:00.000Z", customerCode: "LOY-1", customerName: "محمد", customerPhone: "", total: 200, items: [{ productId: "p1", productName: "Oxy", selectedUnitType: "piece", quantity: 2, unitPrice: 100, total: 200 }] },
      ],
      catalogOrders: [],
      products: [{ id: "p1", name: "Oxy", wholesalePrice: 60, wholesalePricePerPiece: 60, retailPrice: 100, wholesaleRetailPrice: 100, loyaltyPoints: 10 }],
      recipes: [],
      customers: [{ name: "محمد", customerCode: "LOY-1", points: 30, transactions: [] }],
      rewards: [{ points: 20, giftName: "هدية", giftCost: 50, confirmed: true }],
      giftDeliveries: [{ customerCode: "LOY-1", customerName: "محمد", customerPhone: "", giftName: "هدية", pointsDeducted: 20, giftCost: 50, date: "2026-08-27" }],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ customerCode: "LOY-1", purchaseCount: 2, currentPoints: 30, revenue: 300, cost: 180, grossProfit: 120, deliveredGiftCost: 50, netProfitAfterGifts: 70, earnedPoints: 30 });
    expect(rows[0].products[0]).toMatchObject({ name: "Oxy", quantity: 3, points: 30, profit: 120 });
    expect(rows[0].currentReward?.giftName).toBe("هدية");
  });

  it("keeps the original invoice count while removing a fully returned invoice from profit", () => {
    const rows = buildCustomerProfitabilityReport({
      sales: [{
        id: "INV-RETURNED",
        date: "2026-08-26T10:00:00.000Z",
        customerCode: "LOY-RETURN",
        customerName: "سارة",
        total: 100,
        items: [{ productId: "p1", productName: "Oxy", quantity: 1, unitPrice: 100, total: 100 }],
        returnedItems: [{ lineIndex: 0, productId: "p1", quantity: 1 }],
      }],
      products: [{ id: "p1", name: "Oxy", wholesalePrice: 60, retailPrice: 100, loyaltyPoints: 10 }],
      recipes: [],
      customers: [{ name: "سارة", customerCode: "LOY-RETURN", points: 0, transactions: [{ id: "sale:INV-RETURNED", points: 10, source: "sale", description: "شراء", createdAt: "2026-08-26" }, { id: "return:RET-1", points: -10, source: "sale", description: "مرتجع", createdAt: "2026-08-26" }] }],
      rewards: [],
      giftDeliveries: [],
    });

    expect(rows[0]).toMatchObject({ purchaseCount: 1, revenue: 0, cost: 0, grossProfit: 0, currentPoints: 0, earnedPoints: 10 });
    expect(rows[0].products).toHaveLength(0);
  });

  it("keeps a zero-point item in sales but excludes it from point contribution", () => {
    const rows = buildCustomerProfitabilityReport({
      sales: [{ id: "INV-3", date: "2026-08-26T10:00:00.000Z", customerCode: "LOY-2", customerName: "علي", total: 50, items: [{ productId: "p2", productName: "صنف بلا نقاط", quantity: 1, unitPrice: 50, total: 50 }] }],
      products: [{ id: "p2", name: "صنف بلا نقاط", wholesalePrice: 20, retailPrice: 50, loyaltyPoints: 0 }],
      recipes: [],
      customers: [{ name: "علي", customerCode: "LOY-2", points: 0, transactions: [] }],
      rewards: [],
      giftDeliveries: [],
    });

    expect(rows[0].products[0].points).toBe(0);
    expect(rows[0].earnedPoints).toBe(0);
    expect(rows[0].netProfitAfterGifts).toBe(30);
  });

  it("excludes archived catalog orders from customer sales and profit", () => {
    const rows = buildCustomerProfitabilityReport({
      sales: [],
      catalogOrders: [{ id: "CAT-ARCHIVE", createdAt: "2026-08-28T10:00:00.000Z", customerCode: "LOY-ARCHIVE", customerName: "عميل تجريبي", customerPhone: "01000000000", status: "delivered", archivedAt: "2026-08-29T10:00:00.000Z", itemsJson: JSON.stringify([{ productId: "p1", name: "Oxy", quantity: 2, price: 100 }]), totalAmount: 200 }],
      products: [{ id: "p1", name: "Oxy", wholesalePrice: 60, retailPrice: 100, loyaltyPoints: 10 }],
      recipes: [],
      customers: [],
      rewards: [],
      giftDeliveries: [],
    });
    expect(rows).toEqual([]);
  });
});
