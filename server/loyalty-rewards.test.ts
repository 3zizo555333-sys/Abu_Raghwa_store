import { describe, expect, it } from "vitest";
import { updateLoyaltyRewardPoints, upsertLoyaltyRewardLevel } from "../client/src/lib/loyaltyRewards";

describe("مستويات هدايا الولاء اليدوية", () => {
  it("يضيف مستوى 500 نقطة ويرتبه مع المستويات الحالية", () => {
    const levels = upsertLoyaltyRewardLevel([{ points: 200, giftName: "هدية 200", confirmed: true }], 500, "هدية 500");
    expect(levels).toEqual([
      { points: 200, giftName: "هدية 200", confirmed: true },
      { points: 500, giftName: "هدية 500", confirmed: false },
    ]);
  });

  it("يحدّث الهدية عند استعمال نفس عدد النقاط", () => {
    const levels = upsertLoyaltyRewardLevel([{ points: 600, giftName: "هدية قديمة", confirmed: true }], 600, "حذاء");
    expect(levels).toEqual([{ points: 600, giftName: "حذاء", confirmed: false }]);
  });

  it("يسمح بتغيير المستوى الافتراضي من 20 إلى 100 نقطة ويحافظ على الهدية بانتظار التأكيد", () => {
    const result = updateLoyaltyRewardPoints([
      { points: 20, giftName: "هدية صغيرة", confirmed: true, giftCost: 12 },
      { points: 50, giftName: "هدية متوسطة", confirmed: true },
    ], 0, 100);
    expect(result).toEqual({ levels: [
      { points: 50, giftName: "هدية متوسطة", confirmed: true },
      { points: 100, giftName: "هدية صغيرة", confirmed: false, giftCost: 12 },
    ] });
  });

  it("يرفض النقاط المكررة أو غير الصحيحة دون تغيير المستويات", () => {
    const levels = [{ points: 20, giftName: "هدية 20", confirmed: true }, { points: 100, giftName: "هدية 100", confirmed: true }];
    expect(updateLoyaltyRewardPoints(levels, 0, 100)).toMatchObject({ error: "duplicate" });
    expect(updateLoyaltyRewardPoints(levels, 0, 0)).toMatchObject({ error: "invalid" });
    expect(levels[0]).toMatchObject({ points: 20, confirmed: true });
  });
});
