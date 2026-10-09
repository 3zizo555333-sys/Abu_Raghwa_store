import { describe, expect, it } from "vitest";
import { adjustEmployeePoints, findPointsEmployee, resetEmployeePoints } from "../client/src/lib/pointsLedger";

const employee = {
  id: "e1",
  name: "أحمد",
  currentPoints: 100,
  rewards: [],
  claimedRewards: [],
  createdDate: "2026-01-01",
};

describe("رصيد نقاط الموظف", () => {
  it("يزيد نقاط الموظف عند إكمال مهمة", () => {
    expect(adjustEmployeePoints([employee], employee, 20)[0].currentPoints).toBe(120);
  });

  it("يخصم النقاط للمخالفة ولا يسمح برصيد سالب", () => {
    expect(adjustEmployeePoints([employee], employee, -150)[0].currentPoints).toBe(0);
  });

  it("يبدأ دورة جديدة من صفر مع حفظ الجوائز والسجل", () => {
    const source = {
      ...employee,
      currentPoints: 1600,
      rewards: [{ id: "r1", pointsRequired: 500, rewardName: "هدية", rewardDescription: "" }],
      claimedRewards: [{ rewardName: "هدية", pointsUsed: 500, claimedDate: "2026-01-02" }],
    };
    const reset = resetEmployeePoints(source);

    expect(reset.currentPoints).toBe(0);
    expect(reset.rewards).toEqual(source.rewards);
    expect(reset.claimedRewards).toEqual(source.claimedRewards);
  });

  it("يحفظ الرصيد الصافي بعد إنجاز 700 نقطة ثم خصم 100 نقطة", () => {
    const afterReward = adjustEmployeePoints([{ ...employee, currentPoints: 0 }], employee, 700);
    const afterPenalty = adjustEmployeePoints(afterReward, { id: "different-worker-id", name: " أحمد " }, -100);

    expect(findPointsEmployee(afterPenalty, employee)?.currentPoints).toBe(600);
  });

  it("يخصم 50 من رصيد 570 ويزامن كل البطاقات المكررة مع تسجيل سبب المخالفة", () => {
    const duplicateRecords = [
      { ...employee, id: "points-card", name: "عبد الله كيس", currentPoints: 570 },
      { ...employee, id: "legacy-card", name: "عبد الله كيس", currentPoints: 570 },
    ];
    const result = adjustEmployeePoints(
      duplicateRecords,
      { id: "employee-record", name: "عبدالله كيس" },
      -50,
      { type: "deduction", description: "تم خصم 50 نقطة بسبب مخالفة: ترك البضاعة", transactionId: "penalty-1" },
    );

    expect(result.map(item => item.currentPoints)).toEqual([520, 520]);
    expect(result[0].pointHistory?.[0]).toMatchObject({
      type: "deduction",
      points: -50,
      description: "تم خصم 50 نقطة بسبب مخالفة: ترك البضاعة",
    });
    expect(result[1].pointHistory?.[0].id).toBe("penalty-1");
  });
});
