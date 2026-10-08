import type { LoyaltyRewardLevel } from "./loyaltyRewards";

export type LoyaltyRewardProgress = {
  currentPoints: number;
  reachedReward?: LoyaltyRewardLevel;
  nextReward?: LoyaltyRewardLevel;
  pointsRemaining: number;
  progressPercent: number;
};

export function getLoyaltyRewardProgress(points: number, levels: LoyaltyRewardLevel[]): LoyaltyRewardProgress {
  const currentPoints = Math.max(0, Math.trunc(Number(points) || 0));
  const activeLevels = (Array.isArray(levels) ? levels : [])
    .filter(level => level?.confirmed && Number.isSafeInteger(Number(level.points)) && Number(level.points) > 0 && String(level.giftName || "").trim())
    .map(level => ({ ...level, points: Number(level.points), giftName: String(level.giftName).trim() }))
    .sort((first, second) => first.points - second.points);

  const reachedReward = [...activeLevels].reverse().find(level => currentPoints >= level.points);
  const nextReward = activeLevels.find(level => currentPoints < level.points);
  const pointsRemaining = nextReward ? Math.max(0, nextReward.points - currentPoints) : 0;
  const progressPercent = nextReward ? Math.max(0, Math.min(100, currentPoints / nextReward.points * 100)) : (reachedReward ? 100 : 0);

  return { currentPoints, reachedReward, nextReward, pointsRemaining, progressPercent };
}
