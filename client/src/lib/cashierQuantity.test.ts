import { describe, expect, it } from "vitest";
import { getCashierQuantityStep, getCashierWeightPresets, isCashierWeightUnit, normalizeCashierQuantity } from "./cashierQuantity";

describe("cashier free decimal quantities", () => {
  it("keeps fine decimal weights such as 100g and 50g", () => {
    expect(normalizeCashierQuantity(0.1)).toBe(0.1);
    expect(normalizeCashierQuantity(0.05)).toBe(0.05);
    expect(normalizeCashierQuantity(0.001)).toBe(0.001);
  });

  it("uses one whole unit for +/- controls, including kilograms and grams", () => {
    expect(getCashierQuantityStep("كيلو")).toBe(1);
    expect(getCashierQuantityStep("جرام")).toBe(1);
    expect(getCashierQuantityStep("لتر")).toBe(1);
    expect(getCashierQuantityStep("وحدة")).toBe(1);
  });

  it("provides kilogram presets and a smaller grams option", () => {
    expect(isCashierWeightUnit("كيلوجرام")).toBe(true);
    expect(getCashierWeightPresets("كيلو")).toEqual([
      { label: "+¼ كجم", delta: 0.25 },
      { label: "+½ كجم", delta: 0.5 },
      { label: "+1 كجم", delta: 1 },
      { label: "+100 جم", delta: 0.1 },
    ]);
  });

  it("converts the same quick-weight presets to gram-based product units", () => {
    expect(getCashierWeightPresets("جرام").map(preset => preset.delta)).toEqual([250, 500, 1000, 100]);
    expect(isCashierWeightUnit("لتر")).toBe(false);
    expect(getCashierWeightPresets("قطعة")).toEqual([]);
  });

  it("rejects invalid numbers without creating a broken cart quantity", () => {
    expect(normalizeCashierQuantity(Number.NaN)).toBe(0);
    expect(normalizeCashierQuantity(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
