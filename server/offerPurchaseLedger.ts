export type OfferPurchaseLedgerTransaction = {
  id: string;
  points: number;
  type: "earned" | "deduction" | "reset";
  source: "catalog" | "offer" | "sale" | "reward" | "manual";
  description: string;
  orderId?: string;
  createdAt: string;
};

export function planOfferPurchaseLedgerUpdate(input: {
  requestId: string;
  offerId: string;
  customerCode: string;
  offerTitle: string;
  offerPoints: number;
  currentPoints: number;
  transactionsJson: string | null;
  usedCouponsJson: string;
  now?: string;
}) {
  let transactions: OfferPurchaseLedgerTransaction[] = [];
  let usedCoupons: string[] = [];
  try {
    const parsed = JSON.parse(input.transactionsJson || "[]");
    if (Array.isArray(parsed)) transactions = parsed as OfferPurchaseLedgerTransaction[];
  } catch {}
  try {
    const parsed = JSON.parse(input.usedCouponsJson || "[]");
    if (Array.isArray(parsed)) usedCoupons = parsed.filter((value): value is string => typeof value === "string");
  } catch {}

  const id = `offer-purchase:${input.requestId}:earned`;
  const existingAward = transactions.find(transaction => transaction?.id === id);
  const legacyAlreadyUsed = transactions.some(transaction => transaction?.id === `offer:${input.offerId}:${input.customerCode}`);
  const points = Math.max(0, Math.trunc(Number(input.offerPoints) || 0));
  const newlyAwardedPoints = existingAward || legacyAlreadyUsed || points === 0 ? 0 : points;
  const awardedPoints = existingAward ? Math.max(0, Math.trunc(Number(existingAward.points) || 0)) : legacyAlreadyUsed ? 0 : points;
  const nextTransactions = existingAward || legacyAlreadyUsed || points === 0 ? transactions : [{
    id,
    points,
    type: "earned" as const,
    source: "offer" as const,
    orderId: input.requestId,
    description: `${points} نقطة بعد موافقة المحل على شراء العرض: ${input.offerTitle}`,
    createdAt: input.now || new Date().toISOString(),
  }, ...transactions].slice(0, 500);
  const nextUsedCoupons = usedCoupons.includes(input.offerId) ? usedCoupons : [...usedCoupons, input.offerId];

  return {
    points: Math.max(0, Math.trunc(Number(input.currentPoints) || 0)) + newlyAwardedPoints,
    awardedPoints,
    transactionsJson: JSON.stringify(nextTransactions),
    usedCouponsJson: JSON.stringify(nextUsedCoupons),
  };
}
