export type LoyaltyCartLine = { loyaltyPoints: number; quantity: number };

export function getCartLoyaltyPointsTotal(lines: readonly LoyaltyCartLine[]): number {
  return lines.reduce((sum, line) => {
    const pointsPerUnit = Math.max(0, Number(line.loyaltyPoints) || 0);
    const quantity = Math.max(0, Number(line.quantity) || 0);
    return sum + pointsPerUnit * quantity;
  }, 0);
}
