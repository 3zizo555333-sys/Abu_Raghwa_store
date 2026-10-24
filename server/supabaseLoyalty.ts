import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type LoyaltySource = "catalog" | "offer" | "manual" | "reward" | "referral" | "cashier";
export type SupabaseLoyaltyTransaction = {
  id: string;
  points: number;
  type: "earned" | "deduction" | "reset";
  source: LoyaltySource;
  description: string;
  orderId?: string;
  createdAt: string;
};
export type SupabaseLoyaltyProfile = {
  name: string;
  customerCode: string;
  phone: string;
  points: number;
  usedCoupons: string[];
  transactions: SupabaseLoyaltyTransaction[];
};

let adminClient: SupabaseClient | null = null;
function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) throw new Error("إعدادات محفظة Supabase غير مكتملة؛ يلزم SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY");
  adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return adminClient;
}

export function normalizeLoyaltyPhone(phone?: string | null): string {
  return String(phone || "").replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[^0-9]/g, "");
}

async function getShopId(client = getAdminClient()): Promise<string> {
  const configured = process.env.SUPABASE_LOYALTY_SHOP_ID?.trim();
  if (configured) return configured;
  const { data, error } = await client.rpc("get_unique_loyalty_shop_id");
  if (error) throw new Error(`تعذر تحديد متجر محفظة الولاء في Supabase: ${error.message}`);
  if (typeof data !== "string" || !data) throw new Error("حدد SUPABASE_LOYALTY_SHOP_ID عند وجود أكثر من متجر في Supabase");
  return data;
}

function throwRpcError(action: string, error: { message: string; code?: string } | null): never | void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

export async function ensureSupabaseLoyaltyProfile(input: { phone: string; name: string; customerCode?: string }) {
  const phone = normalizeLoyaltyPhone(input.phone);
  if (phone.length < 7 || phone.length > 20) throw new Error("رقم الهاتف غير صالح لربط محفظة الولاء");
  const client = getAdminClient();
  const shopId = await getShopId(client);
  const { data, error } = await client.rpc("ensure_loyalty_customer", {
    p_shop_id: shopId,
    p_phone: phone,
    p_full_name: input.name.trim().slice(0, 180),
    p_customer_code: input.customerCode?.trim() || null,
  });
  throwRpcError("تعذر إنشاء/استرجاع ملف الولاء في Supabase", error);
  return data as { id: string; shop_id: string; customer_code: string; full_name: string; phone: string; current_points: number; created: boolean };
}

export async function validateCatalogCouponServer(input: { code: string; orderAmount: number }) {
  const code = input.code.trim();
  const orderAmount = Number(input.orderAmount);
  if (!code) return { valid: false, error_code: "coupon_not_found" } as const;
  if (!Number.isFinite(orderAmount) || orderAmount < 0) throw new Error("قيمة الطلب غير صالحة للتحقق من الكوبون");
  const client = getAdminClient();
  const shopId = await getShopId(client);
  const { data, error } = await client.rpc("validate_catalog_coupon", { p_shop_id: shopId, p_code: code, p_order_amount: orderAmount });
  throwRpcError("تعذر التحقق من كوبون الكتالوج", error);
  return (data || { valid: false, error_code: "coupon_not_found" }) as { valid: boolean; discount_amount?: number; final_amount?: number; min_order_amount?: number; error_code?: string };
}

export async function getSupabaseLoyaltyProfile(identifier: { phone?: string | null; customerCode?: string | null }): Promise<SupabaseLoyaltyProfile | null> {
  const client = getAdminClient();
  const phone = normalizeLoyaltyPhone(identifier.phone);
  const customerCode = String(identifier.customerCode || "").trim().toUpperCase();
  if (!phone && !customerCode) return null;
  const { data, error } = await client.rpc("get_loyalty_wallet_by_identifier", {
    p_phone: phone || null,
    p_customer_code: customerCode || null,
  });
  throwRpcError("تعذر قراءة محفظة الولاء من Supabase", error);
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const rawTransactions = Array.isArray(row.transactions) ? row.transactions : [];
  return {
    name: String(row.name || "عميل أبو رغوة"),
    customerCode: String(row.customerCode || ""),
    phone: String(row.phone || ""),
    points: Math.max(0, Number(row.points) || 0),
    usedCoupons: Array.isArray(row.usedCoupons) ? row.usedCoupons.map(String) : [],
    transactions: rawTransactions.map((raw: any) => ({
      id: String(raw.id),
      points: Number(raw.points) || 0,
      type: raw.type === "deduction" || raw.type === "reset" ? raw.type : "earned",
      source: raw.source === "catalog" || raw.source === "offer" || raw.source === "reward" || raw.source === "manual" || raw.source === "referral" ? raw.source : "cashier",
      description: String(raw.description || "حركة نقاط"),
      ...(raw.orderId ? { orderId: String(raw.orderId) } : {}),
      createdAt: String(raw.createdAt || ""),
    })),
  };
}

export async function applySupabaseLoyaltyEvent(input: {
  phone: string;
  name: string;
  pointsDelta: number;
  source: LoyaltySource;
  sourceId: string;
  idempotencyKey: string;
  description: string;
}) {
  const phone = normalizeLoyaltyPhone(input.phone);
  const pointsDelta = Number(input.pointsDelta);
  if (phone.length < 7 || phone.length > 20) throw new Error("رقم الهاتف غير صالح لربط نقاط الولاء");
  if (!Number.isFinite(pointsDelta) || pointsDelta === 0 || Math.abs(pointsDelta) > 1_000_000) throw new Error("قيمة حركة الولاء غير صالحة");
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 240) throw new Error("مفتاح حركة الولاء غير صالح");
  const client = getAdminClient();
  const shopId = await getShopId(client);
  const { data, error } = await client.rpc("apply_loyalty_wallet_event", {
    p_shop_id: shopId,
    p_phone: phone,
    p_full_name: input.name.trim().slice(0, 180),
    p_points_delta: pointsDelta,
    p_source: input.source,
    p_source_id: input.sourceId.slice(0, 180),
    p_idempotency_key: input.idempotencyKey,
    p_description: input.description.trim().slice(0, 500),
  });
  throwRpcError("تعذر تسجيل حركة الولاء المركزية في Supabase", error);
  return data as { customer_id: string; customer_code: string; points_delta: number; current_points: number; inserted: boolean };
}

export async function listSupabaseLoyaltyProfiles() {
  const client = getAdminClient();
  const shopId = await getShopId(client);
  const { data, error } = await client.rpc("list_loyalty_wallets", { p_shop_id: shopId });
  throwRpcError("تعذر قراءة بطاقات الولاء من Supabase", error);
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    name: String(row.full_name || ""), customerCode: String(row.customer_code || ""), phone: String(row.phone || ""),
    points: Number(row.current_points) || 0, usedCoupons: [], transactions: [],
  }));
}
