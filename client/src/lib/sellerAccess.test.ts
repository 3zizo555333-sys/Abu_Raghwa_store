import { describe, expect, it } from "vitest";
import { canSellerAccessPath } from "./sellerAccess";

describe("صلاحيات تنقل البائع", () => {
  it("يسمح بنقطة البيع والكتالوج والعروض العامة فقط", () => {
    expect(canSellerAccessPath("/cashier")).toBe(true);
    expect(canSellerAccessPath("/catalog?category=all")).toBe(true);
    expect(canSellerAccessPath("/catalog-offers/")).toBe(true);
    expect(canSellerAccessPath("/public-offer?id=offer-1")).toBe(true);
  });

  it("يرفض واجهات الإدارة والتكاليف والسجلات ونقاط الولاء الداخلية", () => {
    for (const path of ["/sales", "/loyalty", "/products", "/smart-offers", "/recipes", "/materials", "/expenses", "/reports", "/dashboard", "/catalog-manager"]) {
      expect(canSellerAccessPath(path), path).toBe(false);
    }
  });
});
