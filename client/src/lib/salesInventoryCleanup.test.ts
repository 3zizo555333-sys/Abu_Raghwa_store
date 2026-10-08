import { describe, expect, it } from "vitest";
import { addArchivedSale, filterActiveSales, getOutstandingSalePoints, getOutstandingSaleQuantity, parseArchivedSales, removeArchivedSale } from "./salesInventoryCleanup";

describe("reversible inventory sale cleanup", () => {
  const sale = {
    id: "INV-test",
    date: "2026-09-28T10:00:00.000Z",
    total: 50,
    customerName: "عميل تجربة",
    customerCode: "ABCD",
    loyaltyPointsAwarded: 10,
    returnedPointsReversed: 2,
    items: [
      { productId: "p1", productName: "منتج", selectedUnitType: "قطعة", quantity: 4, loyaltyPoints: 2 },
      { productId: "p2", productName: "منتج آخر", quantity: 3, loyaltyPoints: 1 },
    ],
    returnedItems: [
      { lineIndex: 0, productId: "p1", quantity: 1, pointsReversed: 2 },
      { lineIndex: 1, productId: "p2", quantity: 1, pointsReversed: 0 },
    ],
  };

  it("archives, restores, and permanently removes only the selected sale snapshot", () => {
    const entry = { archiveId: "archive-1", archivedAt: "2026-09-28T11:00:00.000Z", pointsReversed: 8, stockRestored: { p1: 0.5 }, sale };
    expect(addArchivedSale([], entry)).toEqual([entry]);
    expect(removeArchivedSale([entry, { ...entry, archiveId: "archive-2", sale: { ...sale, id: "INV-other" } }], sale.id)).toHaveLength(1);
    expect(parseArchivedSales(JSON.stringify([entry]))).toEqual([entry]);
    expect(parseArchivedSales("bad-json")).toEqual([]);
  });

  it("ignores already-returned units and calculates only unreturned units", () => {
    expect(getOutstandingSaleQuantity(sale, 0)).toBe(3);
    expect(getOutstandingSaleQuantity(sale, 1)).toBe(2);
    expect(getOutstandingSalePoints(sale)).toBe(8);
  });

  it("supports old sale records without loyalty metadata", () => {
    expect(getOutstandingSalePoints({ id: "INV-old", date: "2026-01-01", items: [{ quantity: 2, loyaltyPoints: 3 }] })).toBe(6);
  });

  it("filters only archived and permanently deleted invoices from active sales", () => {
    const archived = { archiveId: "archive-1", archivedAt: "2026-09-28T11:00:00.000Z", pointsReversed: 0, stockRestored: {}, sale };
    expect(filterActiveSales([sale, { ...sale, id: "INV-kept" }, { ...sale, id: "INV-purged" }], [archived], ["INV-purged"]).map(item => item.id)).toEqual(["INV-kept"]);
  });
});
