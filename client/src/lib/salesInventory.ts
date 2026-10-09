import { getPieceCost, type ProfitProductLike } from "./profit";
import { getContentsPerPackage, isOuterPackageUnit } from "./packageUnits";

export type InventorySource = "products" | "recipes" | "catalog";
export type InventoryPeriod = "all" | "daily" | "weekly" | "monthly";

export type SalesInventoryItem = {
  productId?: string;
  recipeId?: string;
  productName?: string;
  selectedUnitType?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  price?: number;
  total?: number;
  loyaltyPoints?: number;
};

export type SalesInventorySale = {
  id: string;
  date: string;
  paymentMethod?: string;
  items?: SalesInventoryItem[];
  total?: number;
  customerName?: string;
  customerPhone?: string;
  customerCode?: string;
  loyaltyPointsAwarded?: number;
  returnedPointsReversed?: number;
  returnedItems?: Array<{ lineIndex?: number; productId?: string; quantity?: number; pointsReversed?: number }>;
};

export type SalesInventoryCatalogOrder = {
  id: string;
  createdAt: Date | string;
  customerName?: string;
  customerPhone?: string;
  customerCode?: string | null;
  status: string;
  itemsJson: string;
  totalAmount: number;
  archivedAt?: Date | string | null;
  archivedPointsReversed?: number;
};

export type SalesInventoryProduct = ProfitProductLike & { id: string; name?: string; loyaltyPoints?: number };
export type SalesInventoryRecipe = { id: string; name?: string; totalCost?: number; productionQuantity?: number; costPerUnit?: number; loyaltyPoints?: number };

export type SalesInventoryEntry = {
  id: string;
  invoiceId: string;
  source: InventorySource;
  date: string;
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  costKnown: boolean;
  loyaltyPoints?: number;
};

export type SalesInventorySummary = {
  revenue: number;
  confirmedRevenue: number;
  cost: number;
  profit: number;
  profitPercent: number;
  unknownCostRevenue: number;
  invoiceCount: number;
};

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rounded = (value: number) => Number(value.toFixed(2));

const itemAmount = (item: SalesInventoryItem) => {
  const total = numberValue(item.total);
  return total > 0 ? total : numberValue(item.quantity) * (numberValue(item.unitPrice) || numberValue(item.price));
};

const recipeUnitCost = (recipe: SalesInventoryRecipe) => {
  const stored = numberValue(recipe.costPerUnit);
  if (stored > 0) return stored;
  const total = numberValue(recipe.totalCost);
  const quantity = numberValue(recipe.productionQuantity);
  return total > 0 && quantity > 0 ? total / quantity : 0;
};

const productUnitCost = (product: SalesInventoryProduct, unit: string) => {
  const pieceCost = getPieceCost(product);
  if (!isOuterPackageUnit(product, unit)) return pieceCost;
  const cartonCost = numberValue(product.wholesalePrice) || numberValue(product.wholesalePricePerUnit);
  if (cartonCost > 0) return cartonCost;
  return pieceCost * getContentsPerPackage(product);
};

const periodStart = (period: InventoryPeriod, referenceDate: string) => {
  const reference = new Date(`${referenceDate}T12:00:00`);
  if (Number.isNaN(reference.getTime()) || period === "all") return null;
  if (period === "daily") return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  if (period === "weekly") {
    const day = reference.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + offset);
  }
  return new Date(reference.getFullYear(), reference.getMonth(), 1);
};

export function filterSalesInventoryEntries(entries: SalesInventoryEntry[], period: InventoryPeriod, referenceDate: string) {
  const start = periodStart(period, referenceDate);
  if (!start) return entries;
  const end = new Date(start);
  if (period === "daily") end.setDate(end.getDate() + 1);
  if (period === "weekly") end.setDate(end.getDate() + 7);
  if (period === "monthly") end.setMonth(end.getMonth() + 1);
  return entries.filter(entry => {
    const date = new Date(entry.date);
    return !Number.isNaN(date.getTime()) && date >= start && date < end;
  });
}

export function summarizeSalesInventory(entries: SalesInventoryEntry[]): SalesInventorySummary {
  const revenue = entries.reduce((sum, entry) => sum + entry.revenue, 0);
  const knownEntries = entries.filter(entry => entry.costKnown);
  const confirmedRevenue = knownEntries.reduce((sum, entry) => sum + entry.revenue, 0);
  const cost = knownEntries.reduce((sum, entry) => sum + entry.cost, 0);
  const profit = confirmedRevenue - cost;
  return {
    revenue: rounded(revenue),
    confirmedRevenue: rounded(confirmedRevenue),
    cost: rounded(cost),
    profit: rounded(profit),
    profitPercent: cost > 0 ? rounded((profit / cost) * 100) : 0,
    unknownCostRevenue: rounded(revenue - confirmedRevenue),
    invoiceCount: new Set(entries.map(entry => entry.invoiceId)).size,
  };
}

export function buildSalesInventoryEntries(input: {
  sales: SalesInventorySale[];
  catalogOrders: SalesInventoryCatalogOrder[];
  products: SalesInventoryProduct[];
  recipes: SalesInventoryRecipe[];
}) {
  const productById = new Map(input.products.map(product => [product.id, product]));
  const recipeById = new Map(input.recipes.map(recipe => [recipe.id, recipe]));
  const recipeByName = new Map(input.recipes.filter(recipe => recipe.name).map(recipe => [recipe.name!, recipe]));
  const buildInvoiceEntries = (invoiceId: string, date: string, items: SalesInventoryItem[], invoiceRevenue: number, sourceOverride?: InventorySource, returnedItems?: SalesInventorySale["returnedItems"]) => {
    const itemsTotal = items.reduce((sum, item) => sum + itemAmount(item), 0);
    const allocation = itemsTotal > 0 && invoiceRevenue >= 0 ? invoiceRevenue / itemsTotal : 1;
    return items.flatMap((item, index): SalesInventoryEntry[] => {
      const productId = String(item.productId || "");
      const recipeId = String(item.recipeId || productId.replace(/^catalog_recipe_/, ""));
      const recipe = recipeById.get(recipeId) || recipeByName.get(String(item.productName || ""));
      const product = productById.get(productId);
      const source = sourceOverride || (recipe ? "recipes" : "products");
      const soldQuantity = Math.max(0, numberValue(item.quantity));
      const returnedQuantity = (returnedItems || []).filter(returned => returned.lineIndex === index || (returned.lineIndex == null && String(returned.productId || "") === productId)).reduce((sum, returned) => sum + Math.max(0, numberValue(returned.quantity)), 0);
      const quantity = Math.max(0, soldQuantity - returnedQuantity);
      if (!quantity) return [];
      const quantityFactor = soldQuantity > 0 ? quantity / soldQuantity : 0;
      const revenue = rounded(itemAmount(item) * allocation * quantityFactor);
      const unitCost = recipe ? recipeUnitCost(recipe) : product ? productUnitCost(product, String(item.selectedUnitType || item.unit || "")) : 0;
      const costKnown = unitCost > 0;
      const cost = costKnown ? rounded(unitCost * quantity) : 0;
      return [{ id: `${invoiceId}-${index}`, invoiceId, source, date, name: String(item.productName || recipe?.name || product?.name || "صنف غير مسجل"), quantity, revenue, cost, profit: rounded(revenue - cost), costKnown, loyaltyPoints: Math.max(0, Math.trunc(Number(recipe?.loyaltyPoints ?? product?.loyaltyPoints) || 0)) }];
    });
  };

  const directEntries = input.sales.flatMap(sale => buildInvoiceEntries(String(sale.id), String(sale.date), Array.isArray(sale.items) ? sale.items : [], numberValue(sale.total), undefined, sale.returnedItems));
  const catalogEntries = input.catalogOrders
    .filter(order => order.status === "delivered" && !order.archivedAt)
    .flatMap(order => {
      try {
        const items = JSON.parse(order.itemsJson);
        return Array.isArray(items) ? buildInvoiceEntries(`CAT-${order.id}`, String(order.createdAt), items, numberValue(order.totalAmount), "catalog") : [];
      } catch {
        return [];
      }
    });
  return [...directEntries, ...catalogEntries];
}
