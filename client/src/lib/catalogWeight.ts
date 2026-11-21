import type { CatalogProduct } from "./catalog";

export function isWeightCatalogProduct(product: Pick<CatalogProduct, "name" | "unit" | "category">): boolean {
  return /كجم|كيلو|جرام|غرام|سايب|سائب|وزن/i.test(`${product.unit || ""} ${product.category || ""} ${product.name || ""}`);
}

export function toCatalogKilograms(amount: number, unit: "g" | "kg"): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const kilograms = unit === "g" ? amount / 1000 : amount;
  const normalized = Number(kilograms.toFixed(6));
  return normalized > 0 && normalized <= 1000 ? normalized : null;
}

export function catalogMoneyToKilograms(amount: number, pricePerKilogram: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(pricePerKilogram) || pricePerKilogram <= 0) return null;
  return toCatalogKilograms(amount / pricePerKilogram, "kg");
}
