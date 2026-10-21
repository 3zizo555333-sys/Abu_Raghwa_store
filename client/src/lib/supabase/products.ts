import { getSupabaseClient, assertCloudOnline, requireCloudResult } from "./client";
import type { Json, ProductRow } from "./database.types";
import { setCachedActiveShopId } from "@/lib/persistentCloudCache";

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
  bulkUnitName: string | null;
  unitsPerBulk: number;
  bulkUnitPrice: number | null;
  retailPrice: number;
  wholesaleRetailPrice: number;
  bulkPrice: number;
  retailLoyaltyPoints: number;
  subWholesaleLoyaltyPoints: number;
  wholesaleLoyaltyPoints: number;
  bulkProfitPercent?: number;
  retailProfitPercent?: number;
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
  imageUrl?: string;
  loyaltyPoints: number;
  catalogVisible: boolean;
  catalogPrice: number | null;
  catalogOldPrice: number | null;
  catalogDescription: string;
  catalogDetailsUrl: string;
  catalogCategory: string;
  catalogCompany: string;
  catalogLoyaltyPoints: number;
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
  bulkUnitName?: string | null;
  unitsPerBulk?: number;
  bulkUnitPrice?: number | null;
  wholesalePricePerUnit?: number;
  wholesalePricePerPiece?: number;
  retailPrice?: number;
  wholesaleRetailPrice?: number;
  bulkPrice?: number;
  retailLoyaltyPoints?: number;
  subWholesaleLoyaltyPoints?: number;
  wholesaleLoyaltyPoints?: number;
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

export type BulkProgress = { completed: number; total: number; batch: number; batches: number };
export const PRODUCT_BULK_CHUNK_SIZE = 500;

export type ProductCategory = { id: string; name: string };

export type ShopContext = { userId: string; shopId: string; role: "manager" | "admin" | "supervisor" | "seller" };

/** Membership is read from the authoritative database; the short-lived cache is memory-only. */
let shopContextPromise: Promise<ShopContext> | undefined;
let shopContextExpiresAt = 0;
let shopContextUserId: string | undefined;

export function resetActiveShopContextCache() {
  shopContextPromise = undefined;
  shopContextExpiresAt = 0;
  shopContextUserId = undefined;
}

export async function getActiveShopContext(forceRefresh = false): Promise<ShopContext> {
  const supabase = getSupabaseClient();
  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
  const userId = sessionResult.session?.user.id;
  if (sessionError || !userId) {
    resetActiveShopContextCache();
    throw new Error("انتهت الجلسة السحابية. سجّل الدخول مجددًا.");
  }
  if (!forceRefresh && shopContextUserId === userId && shopContextPromise && Date.now() < shopContextExpiresAt) return shopContextPromise;
  shopContextUserId = userId;
  shopContextPromise = (async () => {
    const { data, error } = await supabase
      .from("shop_memberships")
      .select("shop_id, role, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(2);
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("لا يوجد للمستخدم عضوية نشطة في المحل. اطلب من المدير تفعيل الحساب.");
    if (data.length > 1) throw new Error("للمستخدم أكثر من محل. يجب اختيار المحل النشط قبل متابعة العمل.");
    setCachedActiveShopId(data[0].shop_id);
    return { userId, shopId: data[0].shop_id, role: data[0].role };
  })();
  shopContextExpiresAt = Date.now() + 15_000;
  try {
    return await shopContextPromise;
  } catch (error) {
    if (shopContextUserId === userId) resetActiveShopContextCache();
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
    bulkUnitName: typeof row.bulk_unit_name === "string" ? row.bulk_unit_name : null,
    unitsPerBulk: numberOr(row.units_per_bulk, 1),
    bulkUnitPrice: row.bulk_unit_price == null ? null : numberOr(row.bulk_unit_price),
    retailPrice: numberOr(row.retail_price), wholesaleRetailPrice: numberOr(row.wholesale_retail_price), bulkPrice: numberOr(row.bulk_price),
    retailLoyaltyPoints: numberOr(row.retail_loyalty_points, numberOr(row.loyalty_points)), subWholesaleLoyaltyPoints: numberOr(row.sub_wholesale_loyalty_points, numberOr(row.loyalty_points)), wholesaleLoyaltyPoints: numberOr(row.wholesale_loyalty_points, numberOr(row.loyalty_points)),
    bulkProfitPercent: row.bulk_profit_percent == null ? undefined : numberOr(row.bulk_profit_percent), retailProfitPercent: row.retail_profit_percent == null ? undefined : numberOr(row.retail_profit_percent),
    wholesalePricePerUnit: row.wholesale_price_per_unit == null ? undefined : numberOr(row.wholesale_price_per_unit),
    wholesalePricePerPiece: row.wholesale_price_per_piece == null ? undefined : numberOr(row.wholesale_price_per_piece),
    costPerUnit: row.cost_per_unit == null ? undefined : numberOr(row.cost_per_unit),
    costPerPiece: row.cost_per_piece == null ? undefined : numberOr(row.cost_per_piece),
    categoryId: typeof row.category_id === "string" ? row.category_id : null,
    category: String(row.category_name ?? "بدون فئة"), quantity: numberOr(row.quantity), minQuantity: numberOr(row.min_quantity),
    imageId: typeof row.image_id === "string" ? row.image_id : null,
    imageStoragePath: typeof row.catalog_image_path === "string" ? row.catalog_image_path : null,
    loyaltyPoints: numberOr(row.loyalty_points),
    catalogVisible: row.catalog_visible === true,
    catalogPrice: row.catalog_price == null ? null : numberOr(row.catalog_price),
    catalogOldPrice: row.catalog_old_price == null ? null : numberOr(row.catalog_old_price),
    catalogDescription: String(row.catalog_description ?? ""),
    catalogDetailsUrl: String(row.catalog_details_url ?? ""),
    catalogCategory: String(row.catalog_category ?? ""),
    catalogCompany: String(row.catalog_company ?? ""),
    catalogLoyaltyPoints: numberOr(row.catalog_loyalty_points),
    version: numberOr(row.version, 1), createdAt: String(row.created_at ?? ""), updatedAt: String(row.updated_at ?? ""),
  };
}

export function toProductPayload(product: ProductInput): Json {
  return {
    name: product.name.trim(), code: product.code ?? null, barcode: product.barcode ?? null,
    barcodes: product.barcodes ?? [], plu: product.plu ?? null, sale_mode: product.saleMode ?? "unit",
    unit_name: product.unit ?? "عبوة", content_unit: product.contentUnit ?? "قطعة", units_per_package: product.unitsPerPackage ?? 1,
    bulk_unit_name: product.bulkUnitName?.trim() || null, units_per_bulk: product.unitsPerBulk ?? 1, bulk_unit_price: product.bulkUnitPrice ?? null,
    wholesale_price_per_unit: product.wholesalePricePerUnit ?? 0, wholesale_price_per_piece: product.wholesalePricePerPiece ?? 0,
    retail_price: product.retailPrice ?? 0, wholesale_retail_price: product.wholesaleRetailPrice ?? 0, bulk_price: product.bulkPrice ?? 0,
    cost_per_unit: product.costPerUnit ?? 0, cost_per_piece: product.costPerPiece ?? 0,
    bulk_profit_percent: product.bulkProfitPercent ?? 0, retail_profit_percent: product.retailProfitPercent ?? 0,
    category_id: product.categoryId ?? null, category_name: product.category ?? "بدون فئة",
    quantity: product.quantity ?? 0, min_quantity: product.minQuantity ?? 0, loyalty_points: product.loyaltyPoints ?? 0,
    retail_loyalty_points: product.retailLoyaltyPoints ?? product.loyaltyPoints ?? 0, sub_wholesale_loyalty_points: product.subWholesaleLoyaltyPoints ?? product.loyaltyPoints ?? 0, wholesale_loyalty_points: product.wholesaleLoyaltyPoints ?? product.loyaltyPoints ?? 0,
  } as Json;
}

export async function listProductsPage(input: { cursor?: ProductCursor | null; search?: string; categoryId?: string | null; limit?: number; includeImages?: boolean } = {}): Promise<ProductPage> {
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
  const items = await Promise.all(data.items.map(async item => {
    const product = mapProductRow(item as unknown as Partial<ProductRow> & Record<string, unknown>, shopId);
    if (input.includeImages !== false && product.imageStoragePath) {
      try { product.imageUrl = await getSignedProductImageUrl(product.imageStoragePath); } catch { /* Keep product rows available if a private image URL expires or cannot be signed. */ }
    }
    return product;
  }));
  return { ...data, items };
}

export async function searchProductsByBarcode(barcode: string): Promise<ProductPage> {
  const code = barcode.trim();
  if (!code) return { items: [], total: 0, has_more: false, next_cursor: null };
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const result = await supabase.rpc("search_products_by_barcode", { p_shop_id: shopId, p_barcode: code });
  const rows = requireCloudResult(result);
  if (!Array.isArray(rows)) throw new Error("استجابة بحث الباركود السحابي غير صالحة.");
  const items = await Promise.all(rows.map(async row => {
    const product = mapProductRow(row as Partial<ProductRow> & Record<string, unknown>, shopId);
    if (product.imageStoragePath) {
      try { product.imageUrl = await getSignedProductImageUrl(product.imageStoragePath); } catch { /* A missing signed URL must not hide the product result. */ }
    }
    return product;
  }));
  return { items, total: items.length, has_more: false, next_cursor: null };
}

export async function listProductCategories(): Promise<ProductCategory[]> {
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const result = await supabase.from("product_categories").select("id, name").eq("shop_id", shopId).order("sort_order").order("name");
  return requireCloudResult(result).map(category => ({ id: category.id, name: category.name }));
}

const normalizedCategoryName = (name: string) => name.trim().replace(/\s+/g, " ");
const sameCategoryName = (left: string, right: string) => left.localeCompare(right, "ar", { sensitivity: "base" }) === 0;

async function updateMatchingProductCategories(input: {
  matchCategoryId: string | null;
  matchLegacyName: string;
  nextCategoryId: string | null;
  nextCategoryName: string;
}) {
  assertCloudOnline();
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  let cursor: ProductCursor | null = null;
  let updated = 0;

  do {
    const page = await listProductsPage({ cursor, limit: 100, includeImages: false });
    const matchingProducts = page.items.filter(product =>
      (input.matchCategoryId !== null && product.categoryId === input.matchCategoryId)
      || (!product.categoryId && product.category === input.matchLegacyName),
    );

    for (let index = 0; index < matchingProducts.length; index += 10) {
      const batch = matchingProducts.slice(index, index + 10);
      const outcomes = await Promise.allSettled(batch.map(product => supabase.rpc("update_product", {
        p_shop_id: shopId,
        p_product_id: product.id,
        p_expected_version: product.version,
        p_payload: { category_id: input.nextCategoryId, category_name: input.nextCategoryName } as Json,
      }).then(result => requireCloudResult(result))));
      const failure = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
      updated += outcomes.filter(outcome => outcome.status === "fulfilled").length;
      if (failure) {
        const detail = failure.reason instanceof Error ? failure.reason.message : "رفض الخادم تحديث أحد المنتجات.";
        throw new Error(`تم تحديث ارتباط ${updated} منتجًا، لكن تعذر إكمال تحديث روابط الفئة. أعد المحاولة بعد مراجعة المنتجات. ${detail}`);
      }
    }

    cursor = page.next_cursor;
    if (page.has_more && !cursor) throw new Error("تعذر متابعة صفحات المنتجات؛ لم يؤكد الخادم مؤشر الصفحة التالية.");
  } while (cursor);

  return updated;
}

export async function createProductCategory(name: string): Promise<ProductCategory> {
  assertCloudOnline();
  const normalized = normalizedCategoryName(name);
  if (!normalized || normalized.length > 120) throw new Error("اسم الفئة مطلوب ويجب ألا يتجاوز 120 حرفًا.");
  if (normalized === "بدون فئة") throw new Error("لا يمكن إنشاء سجل للفئة الافتراضية «بدون فئة».");

  const existing = (await listProductCategories()).find(category => sameCategoryName(category.name, normalized));
  if (existing) {
    await updateMatchingProductCategories({ matchCategoryId: null, matchLegacyName: existing.name, nextCategoryId: existing.id, nextCategoryName: existing.name });
    return existing;
  }

  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const result = await supabase.from("product_categories").insert({ shop_id: shopId, name: normalized }).select("id, name").single();
  const record = requireCloudResult(result);
  const category = { id: record.id, name: record.name };

  // Old products may carry category_name without a category_id. Adopt those
  // labels through the version-checked update_product RPC, never direct writes.
  await updateMatchingProductCategories({ matchCategoryId: null, matchLegacyName: category.name, nextCategoryId: category.id, nextCategoryName: category.name });
  return category;
}

export async function ensureProductCategory(name: string): Promise<ProductCategory | null> {
  const normalized = normalizedCategoryName(name);
  if (!normalized || normalized === "بدون فئة") return null;
  const categories = await listProductCategories();
  const existing = categories.find(category => sameCategoryName(category.name, normalized));
  return existing ?? createProductCategory(normalized);
}

export async function updateProductCategory(id: string, name: string): Promise<ProductCategory> {
  assertCloudOnline();
  const normalized = normalizedCategoryName(name);
  if (!normalized || normalized.length > 120 || normalized === "بدون فئة") throw new Error("أدخل اسم فئة صالحًا بطول لا يتجاوز 120 حرفًا.");

  const categories = await listProductCategories();
  const current = categories.find(category => category.id === id);
  if (!current) throw new Error("لم تعد الفئة موجودة في المتجر الحالي؛ حدّث القائمة ثم أعد المحاولة.");
  const duplicate = categories.find(category => category.id !== id && sameCategoryName(category.name, normalized));
  if (duplicate) throw new Error(`توجد فئة أخرى باسم «${duplicate.name}». اختر اسمًا مختلفًا.`);
  if (current.name === normalized) return current;

  await updateMatchingProductCategories({ matchCategoryId: id, matchLegacyName: current.name, nextCategoryId: id, nextCategoryName: normalized });
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const result = await supabase.from("product_categories").update({ name: normalized }).eq("id", id).eq("shop_id", shopId).select("id, name").single();
  const record = requireCloudResult(result);
  return { id: record.id, name: record.name };
}

export async function deleteProductCategory(id: string): Promise<{ deleted: boolean; unassignedProducts: number }> {
  assertCloudOnline();
  const context = await getActiveShopContext();
  if (context.role !== "manager" && context.role !== "admin") throw new Error("حذف الفئات متاح للمدير أو المسؤول فقط.");
  const category = (await listProductCategories()).find(item => item.id === id);
  if (!category) throw new Error("لم تعد الفئة موجودة في المتجر الحالي؛ حدّث القائمة ثم أعد المحاولة.");

  const unassignedProducts = await updateMatchingProductCategories({ matchCategoryId: id, matchLegacyName: category.name, nextCategoryId: null, nextCategoryName: "بدون فئة" });
  const supabase = getSupabaseClient();
  const result = await supabase.from("product_categories").delete().eq("id", id).eq("shop_id", context.shopId).select("id").single();
  requireCloudResult(result);
  return { deleted: true, unassignedProducts };
}

export async function createProduct(input: ProductInput): Promise<CloudProduct> {
  assertCloudOnline();
  const supabase = getSupabaseClient();
  const { shopId: storeId } = await getActiveShopContext();
  if (!storeId) throw new Error("لم يتم تحديد المتجر النشط لإضافة المنتج.");
  // shop_id is the canonical database column for the store_id selected from
  // the authenticated user's active membership; it is passed separately from
  // the product payload so it cannot be omitted by the form.
  const result = await supabase.rpc("create_product", { p_shop_id: storeId, p_payload: toProductPayload(input) });
  return mapProductRow(requireCloudResult(result) as unknown as ProductRow, storeId);
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

export type ProductCatalogSettings = {
  catalogVisible: boolean;
  catalogPrice: number | null;
  catalogOldPrice: number | null;
  catalogDescription: string;
  catalogDetailsUrl: string;
  catalogCategory: string;
  catalogCompany: string;
  catalogLoyaltyPoints: number;
};

export async function updateProductCatalogSettings(input: ProductCatalogSettings & { id: string; expectedVersion: number }): Promise<CloudProduct> {
  assertCloudOnline();
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  if (input.catalogPrice !== null && (!Number.isFinite(input.catalogPrice) || input.catalogPrice < 0)) throw new Error("سعر الكتالوج غير صالح.");
  if (input.catalogOldPrice !== null && (!Number.isFinite(input.catalogOldPrice) || input.catalogOldPrice < 0)) throw new Error("السعر القديم غير صالح.");
  const result = await supabase.rpc("update_product_catalog_settings", {
    p_shop_id: shopId,
    p_product_id: input.id,
    p_expected_version: input.expectedVersion,
    p_payload: {
      catalog_visible: input.catalogVisible,
      catalog_price: input.catalogPrice,
      catalog_old_price: input.catalogOldPrice,
      catalog_description: input.catalogDescription.slice(0, 4000),
      catalog_details_url: input.catalogDetailsUrl.slice(0, 2048),
      catalog_category: input.catalogCategory.slice(0, 120),
      catalog_company: input.catalogCompany.slice(0, 180),
      catalog_loyalty_points: Math.max(0, Math.trunc(input.catalogLoyaltyPoints)),
    },
  });
  const product = mapProductRow(requireCloudResult(result) as unknown as ProductRow, shopId);
  if (product.imageStoragePath) {
    try { product.imageUrl = await getSignedProductImageUrl(product.imageStoragePath); } catch { /* Saved settings remain valid if image signing is temporarily unavailable. */ }
  }
  return product;
}

async function deleteProductsChunk(ids: string[]): Promise<number> {
  assertCloudOnline();
  if (ids.length === 0 || ids.length > PRODUCT_BULK_CHUNK_SIZE) throw new Error(`حجم دفعة الحذف يجب ألا يتجاوز ${PRODUCT_BULK_CHUNK_SIZE} منتج.`);
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const result = await supabase.rpc("soft_delete_products", { p_shop_id: shopId, p_product_ids: ids });
  return requireCloudResult(result);
}

export async function deleteProducts(ids: string[], onProgress?: (progress: BulkProgress) => void): Promise<number> {
  assertCloudOnline();
  if (!ids.length) return 0;
  const batches = Math.ceil(ids.length / PRODUCT_BULK_CHUNK_SIZE);
  let completed = 0;
  let deleted = 0;
  for (let index = 0; index < batches; index += 1) {
    deleted += await deleteProductsChunk(ids.slice(index * PRODUCT_BULK_CHUNK_SIZE, (index + 1) * PRODUCT_BULK_CHUNK_SIZE));
    completed = Math.min(ids.length, (index + 1) * PRODUCT_BULK_CHUNK_SIZE);
    onProgress?.({ completed, total: ids.length, batch: index + 1, batches });
  }
  return deleted;
}

export async function createProductsInChunks(inputs: ProductInput[], onProgress?: (progress: BulkProgress) => void): Promise<{ created: CloudProduct[]; failed: number }> {
  assertCloudOnline();
  const created: CloudProduct[] = [];
  let failed = 0;
  const batches = Math.ceil(inputs.length / PRODUCT_BULK_CHUNK_SIZE);
  let completed = 0;
  for (let index = 0; index < batches; index += 1) {
    const chunk = inputs.slice(index * PRODUCT_BULK_CHUNK_SIZE, (index + 1) * PRODUCT_BULK_CHUNK_SIZE);
    // Keep the logical server batch at 500 while limiting in-flight RPCs for mobile browsers.
    for (let offset = 0; offset < chunk.length; offset += 25) {
      const results = await Promise.allSettled(chunk.slice(offset, offset + 25).map(createProduct));
      for (const result of results) result.status === "fulfilled" ? created.push(result.value) : failed += 1;
      completed += results.length;
      onProgress?.({ completed, total: inputs.length, batch: index + 1, batches });
    }
  }
  return { created, failed };
}

export async function uploadProductImage(input: { productId: string; expectedVersion: number; blob: Blob; mimeType: "image/jpeg" | "image/png" | "image/webp" }): Promise<{ imageId: string; storagePath: string }> {
  assertCloudOnline();
  if (input.blob.size < 1 || input.blob.size > 5 * 1024 * 1024) throw new Error("حجم صورة المنتج يجب ألا يتجاوز 5 ميجابايت بعد التجهيز.");
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const imageId = crypto.randomUUID();
  const extension = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
  const storagePath = `${shopId}/products/${input.productId}/${imageId}.${extension}`;
  const upload = await supabase.storage.from("product-images").upload(storagePath, input.blob, { contentType: input.mimeType, upsert: false });
  if (upload.error) requireCloudResult({ data: null, error: upload.error });
  const registered = await supabase.rpc("register_product_image", {
    p_shop_id: shopId,
    p_product_id: input.productId,
    p_expected_version: input.expectedVersion,
    p_image_id: imageId,
    p_storage_path: storagePath,
    p_content_type: input.mimeType,
    p_size_bytes: input.blob.size,
  });
  requireCloudResult(registered);
  return { imageId, storagePath };
}

export async function getSignedProductImageUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from("product-images").createSignedUrl(storagePath, Math.min(Math.max(expiresInSeconds, 60), 3600));
  if (error) {
    requireCloudResult<string>({ data: null, error });
    throw new Error(error.message);
  }
  if (!data?.signedUrl) throw new Error("تعذر إنشاء رابط صورة المنتج.");
  return data.signedUrl;
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
