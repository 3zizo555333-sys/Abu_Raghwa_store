import { describe, expect, it } from "vitest";
import { getPackageDescription, getPackageStockDeduction, getSalePriceForUnit, getSaleUnitOptions } from "../client/src/lib/packageUnits";
import { calculateStoreProfitSummary } from "../client/src/lib/profit";
import { buildSalesInventoryEntries } from "../client/src/lib/salesInventory";

const diaperBag = {
  id: "diapers-1",
  name: "حقيبة بامبرز جملة",
  unit: "حقيبة",
  contentUnit: "قطعة",
  unitsPerPackage: 40,
  wholesalePrice: 1000,
  wholesaleRetailPrice: 30,
  retailPrice: 32,
  availableQuantity: 3,
};

describe("عبوات منتجات الجملة", () => {
  it("يصف محتوى الحقيبة ويحول سعر وخصم البيع بين العبوة والقطعة", () => {
    expect(getPackageDescription(diaperBag)).toBe("40 قطعة داخل حقيبة");
    expect(getSaleUnitOptions(diaperBag)).toEqual(["قطعة"]);
    expect(getSalePriceForUnit(diaperBag, 30, "حقيبة")).toBe(1200);
    expect(getSalePriceForUnit(diaperBag, 30, "قطعة")).toBe(30);
    expect(getPackageStockDeduction(diaperBag, "قطعة", 20)).toBe(0.5);
    expect(getPackageStockDeduction(diaperBag, "حقيبة", 2)).toBe(2);
  });

  it("يدخل محتوى العبوة في ربح المخزون والجرد الفعلي", () => {
    const stock = calculateStoreProfitSummary([diaperBag]);
    expect(stock.stockCost).toBe(3000);
    expect(stock.stockSale).toBe(3600);
    expect(stock.stockProfit).toBe(600);

    const entries = buildSalesInventoryEntries({
      sales: [{ id: "sale-1", date: "2026-08-24T12:00:00.000Z", total: 2400, items: [{ productId: diaperBag.id, productName: diaperBag.name, selectedUnitType: "حقيبة", quantity: 2, unitPrice: 1200, total: 2400 }] }],
      catalogOrders: [], products: [diaperBag], recipes: [],
    });
    expect(entries[0]?.cost).toBe(2000);
    expect(entries[0]?.profit).toBe(400);
  });
});
