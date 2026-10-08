import { describe, expect, it } from "vitest";
import { getCatalogOrderLoyaltyPoints, recipeToCatalogProduct } from "./catalog";

describe("نقاط البيع المباشر للمنتجات والتركيبات", () => {
  it("يجمع نقاط أكثر من منتج في نفس الفاتورة حسب الكمية", () => {
    expect(getCatalogOrderLoyaltyPoints([
      { quantity: 1, loyaltyPoints: 10 },
      { quantity: 2, loyaltyPoints: 3 },
    ])).toBe(16);
  });

  it("يحسب نقاط التركيبة من إعدادها ويحافظ على معرفها الموحد", () => {
    const recipe = recipeToCatalogProduct({ id: "oxy-recipe", name: "تركيبة Oxy", salePrice: 80, loyaltyPoints: 7 });
    expect(recipe.id).toBe("catalog_recipe_oxy-recipe");
    expect(getCatalogOrderLoyaltyPoints([{ quantity: 3, loyaltyPoints: recipe.loyaltyPoints }])).toBe(21);
  });

  it("لا يضيف نقاطًا للصنف الذي لم يحدد له المدير نقاطًا", () => {
    expect(getCatalogOrderLoyaltyPoints([{ quantity: 4 }, { quantity: 1, loyaltyPoints: 0 }])).toBe(0);
  });
});
