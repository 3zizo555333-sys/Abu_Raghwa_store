import { describe, expect, it } from "vitest";
import { normalizeCatalogOrderQuantity } from "./catalogOrderValidation";

describe("كميات طلبات الكتالوج الوزنية", () => {
  it("يقبل الأوزان الجزئية حتى ست منازل عشرية ويطبعها", () => {
    expect(normalizeCatalogOrderQuantity(0.1)).toBe(0.1);
    expect(normalizeCatalogOrderQuantity(0.25)).toBe(0.25);
    expect(normalizeCatalogOrderQuantity(0.3333333)).toBe(0.333333);
  });

  it("يرفض الصفر والسالب والقيم خارج الحد والدقة", () => {
    for (const value of [0, -0.25, 1001, 0.0000001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => normalizeCatalogOrderQuantity(value)).toThrow("كمية غير صالحة");
    }
  });
});
