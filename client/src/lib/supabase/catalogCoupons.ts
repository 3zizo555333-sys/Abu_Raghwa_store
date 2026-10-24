import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database } from "./database.types";

export type CatalogCoupon = Database["public"]["Tables"]["catalog_coupons"]["Row"];
export type CatalogCouponInput = Omit<Database["public"]["Tables"]["catalog_coupons"]["Insert"], "shop_id" | "id" | "created_at" | "updated_at"> & { id?: string };
export type CatalogCouponValidation = {
  valid: boolean;
  discount_amount?: number;
  final_amount?: number;
  min_order_amount?: number;
  error_code?: string;
};

const couponColumns = "id,shop_id,code,title,description,discount_type,discount_value,min_order_amount,max_discount_amount,valid_from,valid_until,is_active,created_at,updated_at";

export async function listCatalogCoupons(): Promise<CatalogCoupon[]> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext(true);
  const result = await getSupabaseClient().from("catalog_coupons").select(couponColumns).eq("shop_id", shopId).order("created_at", { ascending: false }).limit(500);
  return requireCloudResult(result) as CatalogCoupon[];
}

export async function listActiveCatalogCoupons(shopId: string): Promise<CatalogCoupon[]> {
  assertCloudOnline();
  const result = await getSupabaseClient().rpc("list_active_catalog_coupons", { p_shop_id: shopId });
  return requireCloudResult(result) as CatalogCoupon[];
}

export async function validateCatalogCoupon(code: string, orderAmount: number, shopId?: string): Promise<CatalogCouponValidation> {
  assertCloudOnline();
  const id = shopId || (await getActiveShopContext(true)).shopId;
  const result = await getSupabaseClient().rpc("validate_catalog_coupon", { p_shop_id: id, p_code: code.trim(), p_order_amount: orderAmount });
  return (requireCloudResult(result) || { valid: false, error_code: "coupon_not_found" }) as CatalogCouponValidation;
}

export async function saveCatalogCoupon(input: CatalogCouponInput): Promise<CatalogCoupon> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext(true);
  const code = String(input.code || "").trim().toUpperCase();
  const title = String(input.title || "").trim();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new Error("رمز الكوبون يجب أن يكون من 3 إلى 40 حرفًا أو رقمًا.");
  if (!title) throw new Error("عنوان الكوبون مطلوب.");
  const payload = { ...input, code, title, shop_id: shopId, discount_value: Number(input.discount_value), min_order_amount: Number(input.min_order_amount || 0), max_discount_amount: input.max_discount_amount == null ? null : Number(input.max_discount_amount) };
  const query = input.id
    ? getSupabaseClient().from("catalog_coupons").update(payload).eq("id", input.id).eq("shop_id", shopId)
    : getSupabaseClient().from("catalog_coupons").insert(payload);
  return requireCloudResult(await query.select(couponColumns).single()) as CatalogCoupon;
}

export async function deleteCatalogCoupon(id: string): Promise<void> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext(true);
  requireCloudResult(await getSupabaseClient().from("catalog_coupons").delete().eq("id", id).eq("shop_id", shopId));
}
