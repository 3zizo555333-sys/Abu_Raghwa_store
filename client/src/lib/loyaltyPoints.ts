export function normalizeLoyaltyPoints(value: unknown): number {
  const points = Number(value);
  return Number.isFinite(points) && points > 0 ? Math.trunc(points) : 0;
}

export const DEFAULT_UNBARCODED_LOYALTY_POINTS = 30;

export function resolveProductLoyaltyPoints(input: {
  isUnbarcoded: boolean;
  loyaltyPoints: string;
  retailLoyaltyPoints: string;
  subWholesaleLoyaltyPoints: string;
  wholesaleLoyaltyPoints: string;
}) {
  const rawBasePoints = input.loyaltyPoints.trim();
  const defaultBasePoints = input.isUnbarcoded ? DEFAULT_UNBARCODED_LOYALTY_POINTS : 0;
  const loyaltyPoints = normalizeLoyaltyPoints(rawBasePoints || defaultBasePoints);
  const tierPoints = (value: string) => normalizeLoyaltyPoints(value.trim() || loyaltyPoints);
  const retailLoyaltyPoints = tierPoints(input.retailLoyaltyPoints);

  return {
    loyaltyPoints: input.isUnbarcoded ? loyaltyPoints : retailLoyaltyPoints || loyaltyPoints,
    retailLoyaltyPoints,
    subWholesaleLoyaltyPoints: tierPoints(input.subWholesaleLoyaltyPoints),
    wholesaleLoyaltyPoints: tierPoints(input.wholesaleLoyaltyPoints),
  };
}
