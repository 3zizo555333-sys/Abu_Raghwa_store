import { describe, expect, it } from "vitest";
import { calculateManualOfferPrice } from "../client/src/lib/manualOffer";

describe("حساب العرض اليدوي", () => {
  it("يحسب نسبة الخصم من سعر القطاعي", () => {
    expect(calculateManualOfferPrice(110, 100, "percent", 5)).toMatchObject({ valid: true, offerPrice: 104.5, discountAmount: 5.5, discountPercent: 5 });
  });

  it("يحسب الخصم الثابت دون تجاوز تكلفة الجملة", () => {
    expect(calculateManualOfferPrice(110, 100, "fixed", 5)).toMatchObject({ valid: true, offerPrice: 105, discountAmount: 5 });
  });

  it("يرفض الخصم الذي يسبب خسارة", () => {
    const result = calculateManualOfferPrice(110, 100, "fixed", 15);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("خسارة");
  });
});
