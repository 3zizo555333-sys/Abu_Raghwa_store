import { describe, expect, it } from "vitest";
import { buildSalesInventoryEntries, filterSalesInventoryEntries, summarizeSalesInventory } from "../client/src/lib/salesInventory";

describe("الجرد الذكي الشامل", () => {
  const entries = buildSalesInventoryEntries({
    products: [{ id: "p1", name: "منتج", wholesalePrice: 60, unitsPerPackage: 6 }],
    recipes: [{ id: "r1", name: "تركيبة", totalCost: 40, productionQuantity: 4 }],
    sales: [
      { id: "INV-1", date: "2026-08-20T10:00:00.000Z", total: 120, items: [{ productId: "p1", productName: "منتج", selectedUnitType: "قطعة", quantity: 2, unitPrice: 60, total: 120 }] },
      { id: "INV-2", date: "2026-08-21T10:00:00.000Z", total: 45, items: [{ recipeId: "r1", productName: "تركيبة", quantity: 3, unitPrice: 15, total: 45 }] },
    ],
      catalogOrders: [{ id: "CAT-1", createdAt: "2026-08-22T10:00:00.000Z", status: "delivered", totalAmount: 50, itemsJson: JSON.stringify([{ productId: "p1", name: "منتج", quantity: 1, price: 50, unit: "قطعة" }]) }, { id: "CAT-2", createdAt: "2026-08-22T10:00:00.000Z", status: "new", totalAmount: 99, itemsJson: "[]" }, { id: "CAT-ARCHIVED", createdAt: "2026-08-22T10:00:00.000Z", status: "delivered", totalAmount: 900, archivedAt: "2026-08-23T10:00:00.000Z", itemsJson: "[]" }],
  });

  it("يفصل المنتجات والتركيبات والكتالوج ولا يحسب طلب الكتالوج غير المسلم كمبيعة", () => {
    expect(entries).toHaveLength(3);
    expect(entries.map(entry => entry.source)).toEqual(["products", "recipes", "catalog"]);
    expect(summarizeSalesInventory(entries)).toMatchObject({ revenue: 215, cost: 60, profit: 155, invoiceCount: 3 });
  });

  it("يرشح الجرد اليومي دون خلط أيام أخرى", () => {
    const day = filterSalesInventoryEntries(entries, "daily", "2026-08-22");
    expect(day).toHaveLength(1);
    expect(day[0]?.invoiceId).toBe("CAT-CAT-1");
  });

  it("يطرح المرتجع الجزئي من كمية وإيراد وتكلفة الفاتورة", () => {
    const returnedEntries = buildSalesInventoryEntries({
      products: [{ id: "p1", name: "منتج", wholesalePrice: 60, unitsPerPackage: 6 }],
      recipes: [],
      catalogOrders: [],
      sales: [{ id: "INV-RETURN", date: "2026-08-23T10:00:00.000Z", total: 120, items: [{ productId: "p1", productName: "منتج", selectedUnitType: "قطعة", quantity: 2, unitPrice: 60, total: 120 }], returnedItems: [{ lineIndex: 0, productId: "p1", quantity: 1 }] }],
    });
    expect(returnedEntries).toHaveLength(1);
    expect(returnedEntries[0]).toMatchObject({ quantity: 1, revenue: 60, cost: 10, profit: 50 });
  });

  it("لا يُظهر الصنف عند إرجاع كامل كميته", () => {
    const returnedEntries = buildSalesInventoryEntries({
      products: [{ id: "p1", name: "منتج", wholesalePrice: 60, unitsPerPackage: 6 }],
      recipes: [],
      catalogOrders: [],
      sales: [{ id: "INV-FULL-RETURN", date: "2026-08-23T10:00:00.000Z", total: 120, items: [{ productId: "p1", productName: "منتج", selectedUnitType: "قطعة", quantity: 2, unitPrice: 60, total: 120 }], returnedItems: [{ lineIndex: 0, productId: "p1", quantity: 2 }] }],
    });
    expect(returnedEntries).toHaveLength(0);
  });
});
