import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import { calculateTradeMarginSummary } from "../profit";

export type CloudDashboardStats = {
  totalSales: number;
  totalRevenue: number;
  totalProducts: number;
  lowStockItems: number;
  totalEmployees: number;
  activeTasks: number;
  activeOffers: number;
  totalRecipes: number;
  totalMaterials: number;
  shopProfitPercent: number;
  shopProfit: number;
  shopCost: number;
};

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function loadCloudDashboardStats(): Promise<CloudDashboardStats> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const supabase = getSupabaseClient();
  const [salesResult, productsResult, tasksResult, offersResult, recipesResult] = await Promise.all([
    supabase.from("invoices").select("id, total").eq("shop_id", shopId).eq("status", "completed").limit(1000),
    supabase.from("products").select("id, quantity, min_quantity, retail_price, wholesale_price_per_unit, cost_per_unit", { count: "exact" }).eq("shop_id", shopId).is("deleted_at", null).limit(50),
    supabase.from("tasks").select("id, status").eq("shop_id", shopId).is("deleted_at", null).limit(1000),
    supabase.from("offers").select("id, status").eq("shop_id", shopId).is("deleted_at", null).limit(1000),
    supabase.from("recipes").select("id, name, cost_price, retail_price").eq("shop_id", shopId).is("deleted_at", null).limit(1000),
  ]);
  const sales = requireCloudResult(salesResult) as any[];
  const products = requireCloudResult(productsResult) as any[];
  const tasks = requireCloudResult(tasksResult) as any[];
  const offers = requireCloudResult(offersResult) as any[];
  const recipes = requireCloudResult(recipesResult) as any[];
  const margin = calculateTradeMarginSummary(products as any, recipes as any);
  return {
    totalSales: sales.length,
    totalRevenue: sales.reduce((sum, sale) => sum + numberValue(sale.total), 0),
    totalProducts: productsResult.count ?? products.length,
    lowStockItems: products.filter(product => numberValue(product.quantity) < numberValue(product.min_quantity)).length,
    totalEmployees: 0,
    activeTasks: tasks.filter(task => !["done", "cancelled", "completed"].includes(String(task.status))).length,
    activeOffers: offers.filter(offer => String(offer.status) === "active").length,
    totalRecipes: recipes.length,
    totalMaterials: 0,
    shopProfitPercent: margin.marginPercent,
    shopProfit: margin.unitProfit,
    shopCost: margin.unitCost,
  };
}
