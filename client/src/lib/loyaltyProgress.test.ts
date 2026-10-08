import { describe, expect, it } from "vitest";
import { getLoyaltyRewardProgress } from "./loyaltyProgress";
import type { LoyaltyRewardLevel } from "./loyaltyRewards";

const rewards: LoyaltyRewardLevel[] = [
  { points: 20, giftName: "هدية أولى", confirmed: true },
  { points: 50, giftName: "هدية ثانية", confirmed: true },
  { points: 100, giftName: "هدية غير معتمدة", confirmed: false },
];

describe("عداد تقدم نقاط الولاء", () => {
  it("shows all points remaining at a zero balance", () => {
    expect(getLoyaltyRewardProgress(0, rewards)).toMatchObject({
      currentPoints: 0,
      pointsRemaining: 20,
      progressPercent: 0,
      nextReward: { points: 20, giftName: "هدية أولى" },
    });
  });

  it("calculates remaining points and progress to the next active reward", () => {
    expect(getLoyaltyRewardProgress(12, rewards)).toMatchObject({
      currentPoints: 12,
      pointsRemaining: 8,
      progressPercent: 60,
      nextReward: { points: 20, giftName: "هدية أولى" },
    });
  });

  it("keeps the already-earned gift visible while counting toward the next one", () => {
    expect(getLoyaltyRewardProgress(25, rewards)).toMatchObject({
      reachedReward: { points: 20, giftName: "هدية أولى" },
      pointsRemaining: 25,
      progressPercent: 50,
      nextReward: { points: 50, giftName: "هدية ثانية" },
    });
  });

  it("reports the highest gift as reached and stops the counter at the top tier", () => {
    expect(getLoyaltyRewardProgress(50, rewards)).toMatchObject({
      reachedReward: { points: 50, giftName: "هدية ثانية" },
      nextReward: undefined,
      pointsRemaining: 0,
      progressPercent: 100,
    });
  });

  it("does not count unconfirmed tiers or invalid rewards", () => {
    expect(getLoyaltyRewardProgress(7, [{ points: 8, giftName: "هدية" }, { points: 0, giftName: "هدية أخرى", confirmed: true }])).toMatchObject({
      reachedReward: undefined,
      nextReward: undefined,
      pointsRemaining: 0,
    });
  });
});
