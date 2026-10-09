import { describe, expect, it } from "vitest";
import { buildLoyaltyRanking, buildLoyaltyWhatsAppUrl, hasOptionalLoyaltyPoints, normalizeWhatsAppPhone } from "./loyaltyReport";

describe("تقرير نقاط الولاء ومشاركة الكود", () => {
  it("يجمع نقاط المنتج والتركيبة ويستبعد الصنف بلا نقاط", () => {
    const result = buildLoyaltyRanking(
      [{ items: [{ productId: "p1", quantity: 2 }, { productId: "catalog_recipe_r1", quantity: 3 }, { productId: "p2", quantity: 5 }] }],
      [{ id: "p1", name: "Oxy", loyaltyPoints: 10 }, { id: "p2", name: "بدون نقاط", loyaltyPoints: 0 }],
      [{ id: "r1", name: "تركيبة", loyaltyPoints: 4 }],
    );
    expect(result).toEqual([{ name: "Oxy", sold: 2, points: 20 }, { name: "تركيبة", sold: 3, points: 12 }]);
  });

  it("يجعل النقاط اختيارية ويحوّل القيمة الفارغة إلى صفر", () => {
    expect(hasOptionalLoyaltyPoints(undefined)).toBe(0);
    expect(hasOptionalLoyaltyPoints("0")).toBe(0);
    expect(hasOptionalLoyaltyPoints("12.8")).toBe(12);
  });

  it("يبني رابط واتساب للكود نفسه مع تحويل الرقم المصري", () => {
    expect(normalizeWhatsAppPhone("01012345678")).toBe("201012345678");
    const url = buildLoyaltyWhatsAppUrl("https://shop.test", "AR-123", "محمد", "01012345678");
    expect(url).toContain("https://wa.me/201012345678?text=");
    expect(decodeURIComponent(url)).toContain("/loyalty?code=AR-123");
  });
});
