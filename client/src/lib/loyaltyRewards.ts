export type LoyaltyRewardLevel = {
  points: number;
  giftName: string;
  confirmed?: boolean;
};

/** يضيف مستوى جديداً أو يستبدل المستوى ذي عدد النقاط نفسه، مع ترتيب المستويات تصاعدياً. */
export const upsertLoyaltyRewardLevel = (
  levels: LoyaltyRewardLevel[],
  points: number,
  giftName: string,
): LoyaltyRewardLevel[] => {
  const safePoints = Math.floor(Number(points));
  const safeGiftName = giftName.trim();
  if (!Number.isFinite(safePoints) || safePoints <= 0 || !safeGiftName) return levels;

  const newLevel: LoyaltyRewardLevel = { points: safePoints, giftName: safeGiftName, confirmed: false };
  const existingIndex = levels.findIndex(level => level.points === safePoints);
  const updated = existingIndex >= 0
    ? levels.map((level, index) => index === existingIndex ? newLevel : level)
    : [...levels, newLevel];

  return [...updated].sort((first, second) => first.points - second.points);
};

export type RewardPointsEditError = "invalid" | "duplicate" | "missing";
export type RewardPointsEditResult<T extends LoyaltyRewardLevel> = { levels: T[]; error?: RewardPointsEditError };

/** Updates one existing threshold without changing its gift/cost; edits require reconfirmation. */
export function updateLoyaltyRewardPoints<T extends LoyaltyRewardLevel>(levels: T[], index: number, points: number): RewardPointsEditResult<T> {
  if (!Number.isInteger(index) || index < 0 || index >= levels.length) return { levels, error: "missing" };
  if (!Number.isSafeInteger(points) || points <= 0) return { levels, error: "invalid" };
  if (levels.some((level, levelIndex) => levelIndex !== index && level.points === points)) return { levels, error: "duplicate" };
  const updated = levels.map((level, levelIndex) => levelIndex === index ? { ...level, points, confirmed: false } : level);
  return { levels: updated.sort((first, second) => first.points - second.points) };
}
