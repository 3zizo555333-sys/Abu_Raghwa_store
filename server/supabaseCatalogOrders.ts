import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateCatalogCouponServer } from "./supabaseLoyalty";
import { normalizeCatalogOrderQuantity } from "./catalogOrderValidation";
import { catalogCouponValidationError } from "../shared/catalogCouponRules";
import type { CatalogOrderInput } from "./db";

let adminClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) throw new Error("إعدادات Supabase غير مكتملة لحفظ طلبات الكتالوج؛ يلزم SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY");
  adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return adminClient;
}

function stableUuid(value: string) {
  const bytes = createHash("sha256").update(value).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseItems(itemsJson: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(itemsJson); } catch { throw new Error("بيانات سلة الطلب غير صالحة."); }
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > 100) throw new Error("يجب أن يحتوي الطلب على صنف واحد إلى 100 صنف.");
  return parsed.map(item => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const price = Number(row.price);
    const quantity = normalizeCatalogOrderQuantity(row.quantity);
    const name = String(row.name || "").trim();
    if (!name || !Number.isFinite(price) || price < 0) throw new Error("تحتوي العربة على بيانات منتج أو كمية غير صالحة.");
    return { productId: String(row.productId || ""), name, unit: String(row.unit || "وحدة"), price, quantity, loyaltyPoints: Math.max(0, Number(row.loyaltyPoints) || 0) };
  });
}

async function resolveShopId(order: CatalogOrderInput, client: SupabaseClient) {
  if (order.shopId?.trim()) return order.shopId.trim();
  const configured = process.env.SUPABASE_LOYALTY_SHOP_ID?.trim();
  if (configured) return configured;
  const { data, error } = await client.rpc("get_unique_loyalty_shop_id");
  if (error) throw new Error(`تعذر تحديد متجر الطلب في Supabase: ${error.message}`);
  if (typeof data !== "string" || !data) throw new Error("تعذر تحديد متجر الطلب؛ أرسل رابط الكتالوج الخاص بالمتجر.");
  return data;
}

export async function createSupabaseCatalogOrder(order: CatalogOrderInput) {
  const client = getClient();
  const items = parseItems(order.itemsJson);
  const computedTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shopId = await resolveShopId(order, client);
  let finalTotal = computedTotal;
  if (order.couponCode?.trim()) {
    const code = order.couponCode.trim().toUpperCase();
    const coupon = await validateCatalogCouponServer({ code, orderAmount: computedTotal, shopId, customerPhone: order.customerPhone });
    if (!coupon.valid) throw new Error(catalogCouponValidationError(coupon, computedTotal));
    finalTotal = Math.max(0, Number(coupon.final_amount ?? computedTotal));
    if (!Number.isFinite(order.totalAmount) || order.totalAmount < 0 || Math.abs(finalTotal - order.totalAmount) > 0.01) throw new Error("إجمالي الطلب لا يطابق بنود العربة أو الخصم الخادمي.");
    const id = stableUuid(order.id);
    const { data, error } = await client.rpc("create_catalog_coupon_order", {
      p_id: id,
      p_shop_id: shopId,
      p_customer_name: order.customerName.trim(),
      p_customer_phone: order.customerPhone.trim(),
      p_address: order.address?.trim() || null,
      p_note: order.note?.trim() || null,
      p_items: items,
      p_total_amount: finalTotal,
      p_coupon_code: code,
    });
    if (error) {
      if (/COUPON_ALREADY_USED/i.test(error.message)) throw new Error(catalogCouponValidationError({ valid: false, error_code: "coupon_already_used" }));
      if (/COUPON_MIN_ORDER_NOT_MET/i.test(error.message)) {
        const minimum = Number(error.message.match(/COUPON_MIN_ORDER_NOT_MET[: ]+(\d+(?:\.\d+)?)/i)?.[1]) || 0;
        throw new Error(catalogCouponValidationError({ valid: false, error_code: "min_order_not_met", min_order_amount: minimum }, computedTotal));
      }
      throw new Error(`تعذر حفظ طلب الكوبون في Supabase: ${error.message}`);
    }
    const response = data && typeof data === "object" ? data as Record<string, unknown> : {};
    if (response.success !== true) {
      const validation = response as { error_code?: string; min_order_amount?: number };
      throw new Error(catalogCouponValidationError({ ...validation, valid: false }, computedTotal));
    }
    return { id: String(response.id || id), customerCode: null as string | null };
  }
  if (!Number.isFinite(order.totalAmount) || order.totalAmount < 0 || Math.abs(finalTotal - order.totalAmount) > 0.01) throw new Error("إجمالي الطلب لا يطابق بنود العربة أو الخصم الخادمي.");
  const id = stableUuid(order.id);
  const result = await client.from("catalog_orders").upsert({
    id,
    shop_id: shopId,
    customer_name: order.customerName.trim(),
    customer_phone: order.customerPhone.trim(),
    address: order.address?.trim() || null,
    note: order.note?.trim() || null,
    items,
    total_amount: finalTotal,
    status: "pending",
  }, { onConflict: "id" }).select("id").single();
  if (result.error) throw new Error(`تعذر حفظ الطلب في Supabase: ${result.error.message}`);
  return { id: String(result.data.id), customerCode: null as string | null };
}

export async function getSupabaseCatalogOrdersForCustomer(orderIds: string[], customerPhone: string) {
  if (!orderIds.length) return [];
  const client = getClient();
  const ids = orderIds.map(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : stableUuid(id));
  const result = await client.from("catalog_orders").select("id,customer_name,customer_phone,address,note,items,total_amount,status,created_at,updated_at").in("id", ids).eq("customer_phone", customerPhone).order("created_at", { ascending: false });
  if (result.error) throw new Error(`تعذر قراءة طلبات Supabase: ${result.error.message}`);
  return (result.data || []).map(row => ({
    id: String(row.id),
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerCode: null,
    address: row.address,
    note: row.note,
    itemsJson: JSON.stringify(row.items || []),
    totalAmount: Number(row.total_amount || 0),
    status: row.status === "pending" ? "new" : row.status,
    loyaltyPointsAwarded: 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}
