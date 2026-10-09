export interface CatalogProduct {
  id: string;
  catalogSource?: "product" | "recipe" | "manual";
  sourceId?: string;
  code?: string;
  name: string;
  unit?: string;
  retailPrice?: number;
  wholesaleRetailPrice?: number;
  category?: string;
  company?: string;
  catalogVisible?: boolean;
  catalogPrice?: number;
  catalogOldPrice?: number;
  catalogDescription?: string;
  catalogImageUrl?: string;
  catalogDetailsUrl?: string;
  loyaltyPoints?: number;
}

export interface CatalogRecipe {
  id: string;
  name: string;
  salePrice?: number;
  productionUnit?: string;
  notes?: string;
  category?: string;
  company?: string;
  catalogVisible?: boolean;
  catalogPrice?: number;
  catalogOldPrice?: number;
  catalogDescription?: string;
  catalogImageUrl?: string;
  catalogDetailsUrl?: string;
  loyaltyPoints?: number;
}

export function recipeToCatalogProduct(recipe: CatalogRecipe): CatalogProduct {
  return {
    id: `catalog_recipe_${recipe.id}`,
    sourceId: recipe.id,
    catalogSource: "recipe",
    code: "تركيبة",
    name: recipe.name,
    unit: recipe.productionUnit || "وحدة",
    wholesaleRetailPrice: Number(recipe.salePrice || 0),
    category: recipe.category || "تركيبات",
    company: recipe.company || "أبو رغوة",
    catalogVisible: recipe.catalogVisible === true,
    catalogPrice: recipe.catalogPrice,
    catalogOldPrice: recipe.catalogOldPrice,
    catalogDescription: recipe.catalogDescription || recipe.notes || "",
    catalogImageUrl: recipe.catalogImageUrl,
    catalogDetailsUrl: recipe.catalogDetailsUrl,
    loyaltyPoints: recipe.loyaltyPoints,
  };
}

export interface CatalogCategory {
  id: string;
  name: string;
}

export interface CatalogCompany {
  id: string;
  name: string;
}

export interface CatalogCartItem {
  productId: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  loyaltyPoints?: number;
}

export const CATALOG_PHONE = "01096935599";
export const CATALOG_WHATSAPP = "201096935599";

export function getCatalogPrice(product: CatalogProduct) {
  return Math.max(0, Number(product.catalogPrice ?? product.wholesaleRetailPrice ?? product.retailPrice ?? 0));
}

export function getCatalogOldPrice(product: CatalogProduct) {
  return Math.max(0, Number(product.catalogOldPrice ?? 0));
}

export function getCatalogDiscountPercent(product: CatalogProduct) {
  const price = getCatalogPrice(product);
  const oldPrice = getCatalogOldPrice(product);
  return oldPrice > price && oldPrice > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
}

export function getCatalogTotal(items: CatalogCartItem[]) {
  return Number(items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
}
export function getProductLoyaltyPoints(product: Pick<CatalogProduct, "loyaltyPoints">) {
  const points = Math.floor(Number(product.loyaltyPoints ?? 0));
  return Number.isFinite(points) && points > 0 ? points : 0;
}
export function getCatalogOrderLoyaltyPoints(items: Pick<CatalogCartItem, "loyaltyPoints" | "quantity">[]) {
  return items.reduce((sum, item) => sum + getProductLoyaltyPoints(item) * Math.max(0, Math.floor(Number(item.quantity) || 0)), 0);
}

export function getSafeCatalogDetailsUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeCatalogText(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("ar-EG");
}

export function catalogProductMatchesSearch(product: Pick<CatalogProduct, "name" | "category" | "company">, query: unknown) {
  const normalizedQuery = normalizeCatalogText(query);
  if (!normalizedQuery) return true;
  return [product.name, product.category, product.company].some(value => normalizeCatalogText(value).includes(normalizedQuery));
}
