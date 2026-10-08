import { describe, expect, it } from "vitest";
import { calculateRecipeProfit, calculateRecipesProfitSummary } from "../client/src/lib/recipeProfit";

describe("حساب أرباح التركيبات", () => {
  it("يحسب هامش ربح تركيبة تكلفتها 5 وسعر بيعها 10 بنسبة 50% من سعر البيع", () => {
    expect(calculateRecipeProfit({ totalCost: 5, productionQuantity: 1, salePrice: 10 })).toMatchObject({
      costPerUnit: 5,
      totalSaleValue: 10,
      profitValue: 5,
      profitPerUnit: 5,
      profitPercent: 50,
    });
  });

  it("يفصل ربح الكيلو عن ربح الدفعة كاملة", () => {
    const metrics = calculateRecipeProfit({ totalCost: 1008.05, productionQuantity: 160, salePrice: 10 });
    expect(metrics).toMatchObject({
      totalSaleValue: 1600,
      profitValue: 591.95,
      profitPerUnit: 3.7,
      profitPercent: 37,
    });
    expect(metrics.costPerUnit).toBeCloseTo(6.3003125, 6);
  });

  it("يحسب نسبة الربح الإجمالية الموزونة من تكلفة وقيمة بيع جميع التركيبات", () => {
    const summary = calculateRecipesProfitSummary([
      { totalCost: 5, productionQuantity: 1, salePrice: 10 },
      { totalCost: 100, productionQuantity: 10, salePrice: 12 },
    ]);
    expect(summary.totalCost).toBe(105);
    expect(summary.totalSaleValue).toBe(130);
    expect(summary.profitPercent).toBeCloseTo(19.23, 2);
  });
});
