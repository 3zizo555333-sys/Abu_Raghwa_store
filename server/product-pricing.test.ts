import { describe, expect, it } from "vitest";
import { calculateStoreProfitSummary, calculateTradeMarginSummary, getPieceCost, getPieceSalePrice } from "../client/src/lib/profit";

describe("تسعير الكراتين والقطاعي", () => {
  const cartonProduct = {
    unit: "كرتونة",
    unitsPerPackage: 4,
    wholesalePrice: 400,
    wholesalePricePerUnit: 400,
    wholesalePricePerPiece: 100,
    retailPrice: 105,
    wholesaleRetailPrice: 110,
    availableQuantity: 3,
  };

  it("يحسب سعر جملة الوحدة مباشرة من سعر الكرتونة وعدد الوحدات", () => {
    expect(getPieceCost(cartonProduct)).toBe(100);
  });

  it("يعتمد سعر القطاعي المنفصل ولا يستبدله بسعر التجزئة", () => {
    expect(getPieceSalePrice(cartonProduct)).toBe(110);
  });

  it("يحسب قيمة مخزون ثلاث كراتين بسعر 400 للكرتونة", () => {
    const summary = calculateStoreProfitSummary([cartonProduct]);
    expect(summary.stockPieces).toBe(12);
    expect(summary.stockCost).toBe(1200);
    expect(summary.stockSale).toBe(1320);
    expect(summary.stockProfit).toBe(120);
  });

  it("يفصل هامش ربح المهنة عن كمية المخزون ويضم سعر وحدة التركيبة", () => {
    const trade = calculateTradeMarginSummary(
      [{ ...cartonProduct, availableQuantity: 999 }],
      [{ totalCost: 40, productionQuantity: 4, salePrice: 15 }],
    );
    // المنتج: تكلفة 100 وبيع 110، والتركيبة: تكلفة 10 وبيع 15.
    expect(trade.pricedProducts).toBe(1);
    expect(trade.pricedRecipes).toBe(1);
    expect(trade.unitCost).toBe(110);
    expect(trade.unitSale).toBe(125);
    expect(trade.unitProfit).toBe(15);
    expect(trade.marginPercent).toBeCloseTo((15 / 110) * 100, 8);
  });
});
