import { describe, expect, it } from "vitest";
import { createOfferExpiryWindow, getOfferExpiryInfo, parseLegacyOfferDate } from "../client/src/lib/offerExpiry";

describe("مدة صلاحية العروض", () => {
  it("تحسب مدة العرض الجديدة من لحظة إنشائه لا من عداد ثابت", () => {
    const now = Date.UTC(2026, 7, 22, 9, 0, 0);
    const window = createOfferExpiryWindow(30, now);
    const info = getOfferExpiryInfo(window, now);
    expect(info.status).toBe("active");
    expect(info.days).toBe(30);
    expect(info.hours).toBe(0);
  });

  it("يقرأ تاريخ العرض القديم المكتوب بالأرقام العربية", () => {
    const endAt = parseLegacyOfferDate("٢٢‏/٨‏/٢٠٢٦");
    expect(endAt).not.toBeNull();
    expect(new Date(endAt!).getFullYear()).toBe(2026);
  });

  it("يصنف العرض المنتهي بصورة صحيحة", () => {
    const now = Date.UTC(2026, 7, 22, 9, 0, 0);
    expect(getOfferExpiryInfo({ endAt: now - 1 }, now).status).toBe("expired");
  });
});
