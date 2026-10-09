import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { LoyaltyCustomerRecord, LoyaltyRewardRecord, GiftDeliveryRecord } from "../customerProfitability";
import type { SalesInventoryCatalogOrder, SalesInventoryProduct, SalesInventoryRecipe, SalesInventorySale } from "../salesInventory";

export type CloudReportData = {
  sales: SalesInventorySale[];
  products: SalesInventoryProduct[];
  recipes: SalesInventoryRecipe[];
  customers: LoyaltyCustomerRecord[];
  rewards: LoyaltyRewardRecord[];
  giftDeliveries: GiftDeliveryRecord[];
  catalogOrders: SalesInventoryCatalogOrder[];
};

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const jsonArray = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
};

export async function loadCloudReportData(): Promise<CloudReportData> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (!(role === "manager" || role === "admin" || role === "supervisor")) {
    throw new Error("التقارير متاحة للمدير أو المسؤول أو المشرف فقط.");
  }

  const supabase = getSupabaseClient();
  const [invoicesResult, productsResult, recipesResult, customersResult, rewardsResult, redemptionsResult, ordersResult] = await Promise.all([
    supabase.from("invoices").select("*").eq("shop_id", shopId).eq("status", "completed").order("created_at", { ascending: false }).limit(1000),
    supabase.from("products").select("*").eq("shop_id", shopId).is("deleted_at", null).limit(1000),
    supabase.from("recipes").select("*").eq("shop_id", shopId).is("deleted_at", null).limit(1000),
    supabase.from("loyalty_customers").select("*").eq("shop_id", shopId).is("deleted_at", null).limit(1000),
    supabase.from("loyalty_rewards").select("*").eq("shop_id", shopId).is("deleted_at", null).eq("is_active", true).limit(500),
    supabase.from("loyalty_redemptions").select("*").eq("shop_id", shopId).order("delivered_at", { ascending: false }).limit(1000),
    supabase.from("catalog_orders").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(1000),
  ]);
  const invoices = requireCloudResult(invoicesResult) as any[];
  const products = requireCloudResult(productsResult) as any[];
  const recipes = requireCloudResult(recipesResult) as any[];
  const customers = requireCloudResult(customersResult) as any[];
  const rewards = requireCloudResult(rewardsResult) as any[];
  const redemptions = requireCloudResult(redemptionsResult) as any[];
  const catalogOrders = requireCloudResult(ordersResult) as any[];

  const invoiceIds = invoices.map(invoice => String(invoice.id));
  const itemResult = invoiceIds.length
    ? await supabase.from("manager_invoice_items").select("*").eq("shop_id", shopId).in("invoice_id", invoiceIds).limit(5000)
    : { data: [], error: null };
  const invoiceItems = requireCloudResult(itemResult) as any[];
  const productsById = new Map(products.map(product => [String(product.id), product]));
  const customersById = new Map(customers.map(customer => [String(customer.id), customer]));

  const sales: SalesInventorySale[] = invoices.map(invoice => ({
    id: String(invoice.id),
    date: String(invoice.created_at),
    customerName: String(invoice.customer_name || ""),
    customerPhone: String(invoice.customer_phone || ""),
    paymentMethod: String(invoice.payment_method || "other"),
    total: numberValue(invoice.total),
    loyaltyPointsAwarded: numberValue(invoice.loyalty_points_awarded),
    items: invoiceItems.filter(item => String(item.invoice_id) === String(invoice.id)).map(item => {
      const product = productsById.get(String(item.product_id));
      return {
        productId: String(item.product_id || ""),
        productName: String(item.product_name_snapshot || product?.name || ""),
        selectedUnitType: String(item.selected_unit_snapshot || ""),
        quantity: numberValue(item.quantity),
        unitPrice: numberValue(item.unit_price_snapshot),
        total: numberValue(item.line_total),
        loyaltyPoints: numberValue(product?.loyalty_points),
      };
    }),
  }));

  const cloudProducts: SalesInventoryProduct[] = products.map(product => ({
    id: String(product.id), name: String(product.name || ""), loyaltyPoints: numberValue(product.loyalty_points),
    retailPrice: numberValue(product.retail_price), wholesaleRetailPrice: numberValue(product.wholesale_retail_price),
    wholesalePricePerUnit: numberValue(product.cost_per_unit), wholesalePricePerPiece: numberValue(product.cost_per_piece), unitsPerPackage: numberValue(product.units_per_package) || 1,
    unit: String(product.unit_name || "عبوة"), quantity: numberValue(product.quantity),
  } as SalesInventoryProduct));
  const cloudRecipes: SalesInventoryRecipe[] = recipes.map(recipe => ({
    id: String(recipe.id), name: String(recipe.name || ""), totalCost: numberValue(recipe.cost_price), costPerUnit: numberValue(recipe.cost_price), productionQuantity: 1,
    loyaltyPoints: 0,
  }));
  const loyaltyCustomers: LoyaltyCustomerRecord[] = customers.map(customer => ({
    name: String(customer.full_name || "عميل"), customerCode: String(customer.customer_code || ""), phone: String(customer.phone || ""), points: numberValue(customer.current_points), transactions: [],
  }));
  const loyaltyRewards: LoyaltyRewardRecord[] = rewards.map(reward => ({ points: numberValue(reward.points_required), giftName: String(reward.gift_name || ""), giftCost: numberValue(reward.gift_cost), confirmed: Boolean(reward.is_active) }));
  const giftDeliveries: GiftDeliveryRecord[] = redemptions.map(redemption => {
    const customer = customersById.get(String(redemption.customer_id));
    const reward = rewards.find(item => String(item.id) === String(redemption.reward_id));
    return { customerCode: customer?.customer_code, customerName: customer?.full_name || "عميل", customerPhone: customer?.phone, giftName: reward?.gift_name || "هدية", pointsDeducted: numberValue(redemption.points_deducted), giftCost: numberValue(redemption.gift_cost), date: String(redemption.delivered_at) };
  });
  const cloudOrders: SalesInventoryCatalogOrder[] = catalogOrders.map(order => ({
    id: String(order.id), createdAt: String(order.created_at), customerName: String(order.customer_name || ""), customerPhone: String(order.customer_phone || ""), status: String(order.status),
    itemsJson: JSON.stringify(jsonArray(order.items)), totalAmount: numberValue(order.total_amount), customerCode: null,
  }));

  return { sales, products: cloudProducts, recipes: cloudRecipes, customers: loyaltyCustomers, rewards: loyaltyRewards, giftDeliveries, catalogOrders: cloudOrders };
}
