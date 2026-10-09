export type QuantityUnit = "كيلو" | "جرام" | "لتر" | string;

export function normalizeCashierQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function getCashierQuantityStep(unit: QuantityUnit): number {
  return unit === "كيلو" || unit === "جرام" || unit === "لتر" ? 0.001 : 1;
}
