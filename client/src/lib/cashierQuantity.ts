export type QuantityUnit = "كيلو" | "جرام" | "لتر" | string;
export type CashierWeightPreset = { label: string; delta: number };

function normalizeUnit(unit: QuantityUnit): string {
  return unit.trim().toLocaleLowerCase("ar").replace(/[\sـ]/g, "");
}

function weightScale(unit: QuantityUnit): 1 | 1000 | null {
  const normalized = normalizeUnit(unit);
  if (["كيلو", "كيلوجرام", "كيلوغرام", "كجم", "كغ", "kg", "kgs"].some(value => normalized.includes(value))) return 1;
  if (["جرام", "غرام", "جم", "غم", "gram", "grams", "g"].some(value => normalized === value || normalized.startsWith(value))) return 1000;
  return null;
}

export function isCashierWeightUnit(unit: QuantityUnit): boolean {
  return weightScale(unit) !== null;
}

export function normalizeCashierQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function getCashierQuantityStep(unit: QuantityUnit): number {
  void unit;
  return 1;
}

/** Presets are expressed in the item's own unit; manual typing remains unrestricted. */
export function getCashierWeightPresets(unit: QuantityUnit): CashierWeightPreset[] {
  const scale = weightScale(unit);
  if (scale === null) return [];
  const fromKg = (kg: number) => kg * scale;
  const fromGrams = (grams: number) => grams * scale / 1000;
  if (scale === 1) {
    return [
      { label: "+¼ كجم", delta: fromKg(0.25) },
      { label: "+½ كجم", delta: fromKg(0.5) },
      { label: "+1 كجم", delta: fromKg(1) },
      { label: "+100 جم", delta: fromGrams(100) },
    ];
  }
  return [
    { label: "+250 جم", delta: fromKg(0.25) },
    { label: "+500 جم", delta: fromKg(0.5) },
    { label: "+1000 جم", delta: fromKg(1) },
    { label: "+100 جم", delta: fromGrams(100) },
  ];
}
