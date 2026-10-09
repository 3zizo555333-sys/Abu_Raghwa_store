import { describe, expect, it } from "vitest";
import { calculateManualOfferPrice } from "./manualOffer";

describe("حساب العروض اليدوية", () => {
  it("يحساب خصم النسبة من سعر القطاعي", () => {
    expect(calculateManualOfferPrice(110, 100, "percent", 5)).toMatchObject({ valid: true, offerPrice: 104.5, discountAmount: 5.5, discountPercent: 5 });
  });

  it("يحساب خصم المبلغ الثابت", () => {
    expect(calculateManualOfferPrice(110, 100, "fixed", 5)).toMatchObject({ valid: true, offerPrice: 105, discountAmount: 5 });
  });

  it("يرفض الخصم الذي ينزل بسعر العرض تحت تكلفة الجملة", () => {
    const result = calculateManualOfferPrice(110, 100, "fixed", 15);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("خسارة");
  });
});
