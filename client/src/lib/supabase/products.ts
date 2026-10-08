import { getSupabaseClient, assertCloudOnline, requireCloudResult } from "./client";
import type { Json, ProductRow } from "./database.types";

export type ProductCursor = { created_at: string; id: string };
export type CloudProduct = {
  id: string;
  shopId: string;
  name: string;
  code?: string | null;
  barcode?: string | null;
  barcodes?: string[];
  plu?: string | null;
  saleMode: "unit" | "weight";
  unit: string;
  contentUnit: string;
  unitsPerPackage: number;
  retailPrice: number;
  wholesaleRetailPrice: number;
  bulkPrice: number;
  wholesalePricePerUnit?: number;
  wholesalePricePerPiece?: number;
  costPerUnit?: number;
  costPerPiece?: number;
  categoryId?: string | null;
  category: string;
  quantity: number;
  minQuantity: number;
  imageId?: string | null;
  imageStoragePath?: string | null;
  loyaltyPoints: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type ProductPage = { items: CloudProduct[]; total: number; has_more: boolean; next_cursor: ProductCursor | null };
export type ProductInput = {
  id?: string;
  name: string;
  code?: string | null;
  barcode?: string | null;
  barcodes?: string[];
  plu?: string | null;
  saleMode?: "unit" | "weight";
  unit?: string;
  contentUnit?: string;
  unitsPerPackage?: number;
  wholesalePricePerUnit?: number;
  wholesalePricePerPiece?: number;
  retailPrice?: number;
  wholesaleRetailPrice?: number;
  bulkPrice?: number;
  costPerUnit?: number;
  costPerPiece?: number;
  bulkProfitPercent?: number;
  retailProfitPercent?: number;
  categoryId?: string | null;
  category?: string;
  quantity?: number;
  minQuantity?: number;
  loyaltyPoints?: number;
};

type ShopContext = { shopId: string; role: "manager" | "admin" | "supervisor" | "seller" };

/** Membership is read from the authoritative database; the short-lived cache is memory-only. */
let shopContextPromise: Promise<ShopContext> | undefined;
let shopContextExpiresAt = 0;
export async function getActiveShopContext(forceRefresh = false): Promise<ShopContext> {
  if (!forceRefresh && shopContextPromise && Date.now() < shopContextExpiresAt) return shopContextPromise;
  shopContextPromise = (async () => {
    const supabase = getSupabaseClient();
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) throw new Error("انتهت الجلسة السحابية. سجّل الدخول مجددًا.");
    const { data, error } = await supabase
      .from("shop_memberships")
      .select("shop_id, role, status")
      .eq("user_id", userResult.user.id)
      .eq("status", "active")
      .limit(2);
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("لا يوجد للمستخدم عضوية نشطة في المحل. اطلب من المدير تفعيل الحساب.");
    if (data.length > 1) throw new Error("للمستخدم أكثر من محل. يجب اختيار المحل النشط قبل متابعة العمل.");
    return { shopId: data[0].shop_id, role: data[0].role };
  })();
  shopContextExpiresAt = Date.now() + 15_000;
  try {
    return await shopContextPromise;
  } catch (error) {
    shopContextPromise = undefined;
    throw error;
  }
}

export function mapProductRow(row: Partial<ProductRow> & Record<string, unknown>, shopId: string): CloudProduct {
  const numberOr = (value: unknown, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    id: String(row.id), shopId,
    name: String(row.name ?? ""), code: typeof row.code === "string" ? row.code : null,
    barcode: typeof row.barcode === "string" ? row.barcode : null,
    barcodes: Array.isArray(row.barcodes) ? row.barcodes.filter((item): item is string => typeof item === "string") : [],
    plu: typeof row.plu === "string" ? row.plu : null,
    saleMode: row.sale_mode === "weight" ? "weight" : "unit",
    unit: String(row.unit_name ?? "عبوة"), contentUnit: String(row.content_unit ?? "قطعة"),
    unitsPerPackage: numberOr(row.units_per_package, 1),
    retailPrice: numberOr(row.retail_price), wholesaleRetailPrice: numberOr(row.wholesale_retail_price), bulkPrice: numberOr(row.bulk_price),
    wholesalePricePerUnit: row.wholesale_price_per_unit == null ? undefined : numberOr(row.wholesale_price_per_unit),
    wholesalePricePerPiece: row.wholesale_price_per_piece == null ? undefined : numberOr(row.wholesale_price_per_piece),
    costPerUnit: row.cost_per_unit == null ? undefined : numberOr(row.cost_per_unit),
    costPerPiece: row.cost_per_piece == null ? undefined : numberOr(row.cost_per_piece),
    categoryId: typeof row.category_id === "string" ? row.category_id : null,
    category: String(row.category_name ?? "بدون فئة"), quantity: numberOr(row.quantity), minQuantity: numberOr(row.min_quantity),
    imageId: typeof row.image_id === "string" ? row.image_id : null,
    imageStoragePath: typeof row.catalog_image_path === "string" ? row.catalog_image_path : null,
    loyaltyPoints: numberOr(row.loyalty_points),
    version: numberOr(row.version, 1), createdAt: String(row.created_at ?? ""), updatedAt: String(row.updated_at ?? ""),
  };
}

export function toProductPayload(product: ProductInput): Json {
  return {
    name: product.name.trim(), code: product.code ?? null, barcode: product.barcode ?? null,
    barcodes: product.barcodes ?? [], plu: product.plu ?? null, sale_mode: product.saleMode ?? "unit",
    unit_name: product.unit ?? "عبوة", content_unit: product.contentUnit ?? "قطعة", units_per_package: product.unitsPerPackage ?? 1,
    wholesale_price_per_unit: product.wholesalePricePerUnit ?? 0, wholesale_price_per_piece: product.wholesalePricePerPiece ?? 0,
    retail_price: product.retailPrice ?? 0, wholesale_retail_price: product.wholesaleRetailPrice ?? 0, bulk_price: product.bulkPrice ?? 0,
    cost_per_unit: product.costPerUnit ?? 0, cost_per_piece: product.costPerPiece ?? 0,
    bulk_profit_percent: product.bulkProfitPercent ?? 0, retail_profit_percent: product.retailProfitPercent ?? 0,
    category_id: product.categoryId ?? null, category_name: product.category ?? "بدون فئة",
    quantity: product.quantity ?? 0, min_quantity: product.minQuantity ?? 0, loyalty_points: product.loyaltyPoints ?? 0,
  } as Json;
}

export async function listProductsPage(input: { cursor?: ProductCursor | null; search?: string; categoryId?: string | null; limit?: number } = {}): Promise<ProductPage> {
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const result = await supabase.rpc("list_products_page", {
    p_shop_id: shopId,
    p_after_created_at: input.cursor?.created_at ?? null,
    p_after_id: input.cursor?.id ?? null,
    p_search: input.search?.trim() || null,
    p_category_id: input.categoryId || null,
    p_limit: Math.min(Math.max(input.limit ?? 50, 1), 100),
  });
  const data = requireCloudResult(result) as unknown as ProductPage;
  return { ...data, items: data.items.map(item => mapProductRow(item as unknown as Partial<ProductRow> & Record<string, unknown>, shopId)) };
}

export async function createProduct(input: ProductInput): Promise<CloudProduct> {
  assertCloudOnline();
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const result = await supabase.rpc("create_product", { p_shop_id: shopId, p_payload: toProductPayload(input) });
  return mapProductRow(requireCloudResult(result) as unknown as ProductRow, shopId);
}

export async function updateProduct(input: ProductInput & { id: string; expectedVersion: number }): Promise<CloudProduct> {
  assertCloudOnline();
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const result = await supabase.rpc("update_product", {
    p_shop_id: shopId,
    p_product_id: input.id,
    p_expected_version: input.expectedVersion,
    p_payload: toProductPayload(input),
  });
  return mapProductRow(requireCloudResult(result) as unknown as ProductRow, shopId);
}

export async function deleteProducts(ids: string[]): Promise<number> {
  assertCloudOnline();
  if (ids.length === 0 || ids.length > 1000) throw new Error("حدد من 1 إلى 1000 منتج للحذف.");
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const result = await supabase.rpc("soft_delete_products", { p_shop_id: shopId, p_product_ids: ids });
  return requireCloudResult(result);
}

export async function subscribeToShopChanges(shopId: string, onChange: () => void): Promise<() => Promise<unknown>> {
  const supabase = getSupabaseClient();
  let connectedOnce = false;
  const channel = supabase
    .channel(`shop-events:${shopId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "shop_change_events", filter: `shop_id=eq.${shopId}` }, onChange)
    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        if (connectedOnce) onChange();
        connectedOnce = true;
      }
    });
  return async () => supabase.removeChannel(channel);
}
