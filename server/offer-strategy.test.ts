import { describe, expect, it } from "vitest";
import { createOfferForStrategy, getStrategyKind, type OfferCandidate } from "../client/src/lib/offerStrategy";

const items: OfferCandidate[] = [
  { id: "p1", name: "كيس أوكسي", costPrice: 50, retailPrice: 100, type: "product" },
  { id: "r1", name: "كيلو صابون سائل", costPrice: 20, retailPrice: 45, type: "recipe" },
  { id: "p2", name: "منظف ألوان", costPrice: 30, retailPrice: 70, type: "product" },
];

describe("قوالب استراتيجيات العروض", () => {
  it("يصنّف استراتيجية الهدية كهدية لا كخصم", () => {
    expect(getStrategyKind("اشترِ كيساً وخذ كيلو هدية")).toBe("gift");
  });

  it("ينشئ عرض هدية آمن يتضمن تركيبة ضمن عناصر العرض", () => {
    const offer = createOfferForStrategy(items, { name: "اشترِ كيساً وخذ كيلو هدية" }, () => 0);
    expect(offer?.items).toHaveLength(2);
    expect(offer?.items[1]?.offerPrice).toBe(0);
    expect(offer?.items.some(item => item.type === "recipe")).toBe(true);
    expect(offer?.offerPrice).toBeGreaterThan(offer?.totalCostPrice ?? 0);
  });

  it("يبقي الباكدج والخصم قوالب مختلفة", () => {
    expect(getStrategyKind("باكدج البيت المتكامل")).toBe("bundle");
    expect(getStrategyKind("خصم مباشر 10% من السعر القطاعي")).toBe("percentDiscount");
  });

  it("ينفذ استراتيجية قطعتين والثالثة هدية باعتبار قطعتين مدفوعتين", () => {
    const offer = createOfferForStrategy(items, { name: "عرض الأصدقاء قطعتين والثالثة هدية" }, () => 0);
    expect(offer?.items[0]?.name).toContain("2 ×");
    expect(offer?.items[1]?.name).toContain("هدية:");
  });
});
