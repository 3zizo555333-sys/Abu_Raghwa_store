import { isUnbarcodedProduct } from "./barcodes";

export type PosMode = "unbarcoded" | "all";
export type PosCategory = { id: string; name: string };
export type PosCatalogProduct = {
  id: string;
  barcode?: string | null;
  barcodes?: string[];
  categoryId?: string | null;
  category?: string | null;
};

export const getPosProductCategoryName = <T extends PosCatalogProduct>(
  product: T,
  categories: readonly PosCategory[],
) => (product.categoryId ? categories.find(category => category.id === product.categoryId)?.name : null)
  ?? (product.category || "بدون فئة");

export function derivePosCatalog<T extends PosCatalogProduct>(
  products: readonly T[],
  categories: readonly PosCategory[],
  mode: PosMode,
  extraUnbarcodedCategoryIds: readonly string[] = [],
): { products: T[]; categories: string[] } {
  const visibleProducts = mode === "unbarcoded"
    ? products.filter(isUnbarcodedProduct)
    : [...products];
  const names = new Set<string>();

  if (mode === "all") {
    categories.forEach(category => names.add(category.name));
  } else {
    const extraIds = new Set(extraUnbarcodedCategoryIds);
    categories.forEach(category => {
      if (extraIds.has(category.id)) names.add(category.name);
    });
  }

  visibleProducts.forEach(product => names.add(getPosProductCategoryName(product, categories)));
  return {
    products: visibleProducts,
    categories: ["__all__", ...Array.from(names).sort((left, right) => left.localeCompare(right, "ar"))],
  };
}

export function filterPosProductsByCategory<T extends PosCatalogProduct>(
  products: readonly T[],
  categories: readonly PosCategory[],
  activeCategory: string,
): T[] {
  if (activeCategory === "__all__") return [...products];
  return products.filter(product => getPosProductCategoryName(product, categories) === activeCategory);
}
