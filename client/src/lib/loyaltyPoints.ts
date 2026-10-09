export function normalizeLoyaltyPoints(value: unknown): number {
  const points = Number(value);
  return Number.isFinite(points) && points > 0 ? Math.trunc(points) : 0;
}
