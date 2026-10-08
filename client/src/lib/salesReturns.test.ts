import { describe, expect, it } from "vitest";
import { appendSaleReturn, calculateReturnItems, getReturnableQuantity, type ReturnSale } from "./salesReturns";

const sale: ReturnSale = {
  id: "INV-100001",
  total: 270,
  subTotal: 300,
  items: [
    { productId: "p-1", productName: "مسحوق", selectedUnitType: "قطعة", quantity: 2, unitPrice: 100, total: 200, loyaltyPoints: 10 },
    { productId: "p-2", productName: "منظف", selectedUnitType: "قطعة", quantity: 1, unitPrice: 100, total: 100, loyaltyPoints: 0 },
  ],
};

const points = (item: { loyaltyPoints?: number }) => item.loyaltyPoints || 0;

const toPersisted = (items: ReturnType<typeof calculateReturnItems>) => items.map(item => ({
  lineIndex: item.lineIndex,
  productId: item.item.productId,
  productName: item.item.productName,
  quantity: item.quantity,
  unitPrice: item.item.unitPrice,
  total: item.total,
  pointsReversed: item.pointsReversed,
  returnedAt: "2026-08-26T00:00:00.000Z",
}));

describe("sales returns", () => {
  it("calculates a partial return with proportional invoice discount and points", () => {
    const returned = calculateReturnItems(sale, { 0: "1" }, points);
    expect(returned).toHaveLength(1);
    expect(returned[0].quantity).toBe(1);
    expect(returned[0].total).toBe(90);
    expect(returned[0].pointsReversed).toBe(10);
  });

  it("supports a full return across every invoice line", () => {
    const returned = calculateReturnItems(sale, { 0: "2", 1: "1" }, points);
    expect(returned.reduce((sum, item) => sum + item.quantity, 0)).toBe(3);
    expect(returned.reduce((sum, item) => sum + item.pointsReversed, 0)).toBe(20);
    expect(returned.reduce((sum, item) => sum + item.total, 0)).toBe(270);
  });

  it("rejects returning more than the remaining quantity", () => {
    const onceReturned = appendSaleReturn(sale, toPersisted(calculateReturnItems(sale, { 0: "1" }, points)));
    expect(getReturnableQuantity(onceReturned, 0)).toBe(1);
    expect(() => calculateReturnItems(onceReturned, { 0: "2" }, points)).toThrow("أكبر من المتاح");
  });

  it("keeps the original invoice and accumulates separate return events", () => {
    const first = appendSaleReturn(sale, toPersisted(calculateReturnItems(sale, { 0: "1" }, points)));
    const second = appendSaleReturn(first, toPersisted(calculateReturnItems(first, { 0: "1", 1: "1" }, points)));
    expect(second.id).toBe(sale.id);
    expect(second.items).toHaveLength(2);
    expect(second.returnedItems).toHaveLength(3);
    expect(second.returnedTotal).toBe(270);
    expect(second.returnedPointsReversed).toBe(20);
  });
});
