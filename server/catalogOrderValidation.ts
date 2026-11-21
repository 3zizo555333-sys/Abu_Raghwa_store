export function normalizeCatalogOrderQuantity(value: unknown): number {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
    throw new Error("تحتوي العربة على بيانات منتج أو كمية غير صالحة.");
  }
  const normalized = Number(quantity.toFixed(6));
  if (normalized <= 0) {
    throw new Error("تحتوي العربة على بيانات منتج أو كمية غير صالحة.");
  }
  return normalized;
}
