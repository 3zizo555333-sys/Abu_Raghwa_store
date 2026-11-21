import { describe, expect, it } from "vitest";
import { catalogMoneyToKilograms, isWeightCatalogProduct, toCatalogKilograms } from "./catalogWeight";

describe("تحويل أوزان الكتالوج", () => {
  it("يحوّل الغرام والكسور إلى كيلوغرام بدقة ست منازل", () => {
    expect(toCatalogKilograms(100, "g")).toBe(0.1);
    expect(toCatalogKilograms(250, "g")).toBe(0.25);
    expect(toCatalogKilograms(0.75, "kg")).toBe(0.75);
  });

  it("يحسب الوزن المقابل لمبالغ الشراء ويرفض السعر الصفري", () => {
    expect(catalogMoneyToKilograms(10, 50)).toBe(0.2);
    expect(catalogMoneyToKilograms(5, 0)).toBeNull();
  });

  it("يقصر أداة الوزن على المنتجات الموسومة بوحدة/اسم وزن", () => {
    expect(isWeightCatalogProduct({ name: "زهرة بيضاء", unit: "كيلو", category: "سايب" })).toBe(true);
    expect(isWeightCatalogProduct({ name: "جركن منظف", unit: "عبوة", category: "منظفات" })).toBe(false);
    expect(toCatalogKilograms(0, "g")).toBeNull();
  });
});
