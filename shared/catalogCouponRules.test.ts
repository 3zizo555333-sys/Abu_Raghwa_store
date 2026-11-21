import { describe, expect, it } from "vitest";
import { catalogCouponValidationError, normalizeCatalogCouponPhone } from "./catalogCouponRules";

describe("catalog coupon rules", () => {
  it("removes whitespace and one leading +2 phone prefix", () => {
    expect(normalizeCatalogCouponPhone(" +2 010 123 45678 ")).toBe("01012345678");
    expect(normalizeCatalogCouponPhone("010 123 45678")).toBe("01012345678");
  });

  it("explains the minimum order and the exact remaining amount", () => {
    expect(catalogCouponValidationError({ valid: false, error_code: "min_order_not_met", min_order_amount: 500 }, 320))
      .toBe("الحد الأدنى لاستخدام هذا الكوبون هو ٥٠٠ جنيه (أضف منتجات بقيمة ١٨٠ جنيه لتفعيله)");
  });

  it("returns the required one-use-per-customer message", () => {
    expect(catalogCouponValidationError({ valid: false, error_code: "coupon_already_used" }))
      .toBe("لقد استخدمت هذا الكوبون من قبل؛ يُسمح باستخدام الكوبون مرة واحدة فقط لكل عميل");
  });
});
