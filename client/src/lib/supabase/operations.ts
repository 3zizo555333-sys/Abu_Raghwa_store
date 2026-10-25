import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext, getSignedProductImageUrl, listProductsPage } from "./products";
import type { Database } from "./database.types";
import { getSignedFormulationImageUrls, isFormulationImageStoragePath } from "./formulationImages";

type Tables = Database["public"]["Tables"];
type Row<K extends keyof Tables> = Tables[K]["Row"];
type Insert<K extends keyof Tables> = Tables[K]["Insert"];

async function shopId() {
  return (await getActiveShopContext()).shopId;
}

export async function listStaffEmployees() {
  const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("staff_employees").select("id,shop_id,store_id,name,phone,position,role,salary,join_date,hire_date,is_active,metadata,auth_email,auth_user_id,created_at,updated_at,deleted_at").eq("shop_id", id).is("deleted_at", null).order("name").limit(1000)) as Row<"staff_employees">[];
}
export async function listTaskStaffDirectory() {
  const id = await shopId();
  return requireCloudResult(await getSupabaseClient().rpc("list_task_staff_directory", { p_shop_id: id })) as Array<{ id: string; name: string; role: string }>;
}
export async function saveStaffEmployee(input: Omit<Insert<"staff_employees">, "shop_id" | "store_id"> & { id?: string; store_id?: string }) {
  assertCloudOnline(); const id = await shopId(); const client = getSupabaseClient();
  const payload = { ...input, shop_id: id, store_id: id } as Insert<"staff_employees">;
  const columns = "id,shop_id,store_id,name,phone,position,role,salary,join_date,hire_date,is_active,metadata,auth_email,auth_user_id,created_at,updated_at,deleted_at";
  const result = input.id ? await client.from("staff_employees").update(payload).eq("id", input.id).eq("shop_id", id).select(columns).single() : await client.from("staff_employees").insert(payload).select(columns).single();
  return requireCloudResult(result) as Row<"staff_employees">;
}
export async function softDeleteStaffEmployee(employeeId: string) {
  assertCloudOnline(); const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("staff_employees").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", employeeId).eq("shop_id", id).select().single());
}
export async function deleteStaffEmployee(employeeId: string) {
  assertCloudOnline(); const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("staff_employees").delete().eq("id", employeeId).eq("shop_id", id).select("id").single());
}
export async function listStaffAttendance() {
  const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("staff_attendance").select("*").eq("shop_id", id).order("attendance_date", { ascending: false }).limit(5000)) as Row<"staff_attendance">[];
}
export async function saveStaffAttendance(input: Omit<Insert<"staff_attendance">, "shop_id">) {
  assertCloudOnline(); const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("staff_attendance").upsert({ ...input, shop_id: id }, { onConflict: "shop_id,employee_id,attendance_date" }).select().single()) as Row<"staff_attendance">;
}

export async function listRawMaterials() {
  const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("raw_materials").select("*").eq("shop_id", id).is("deleted_at", null).order("name").limit(2000)) as Row<"raw_materials">[];
}
export async function saveRawMaterial(input: Omit<Insert<"raw_materials">, "shop_id"> & { id?: string }) {
  assertCloudOnline(); const id = await shopId(); const client = getSupabaseClient();
  const payload = { ...input, shop_id: id } as Insert<"raw_materials">;
  const result = input.id ? await client.from("raw_materials").update(payload).eq("id", input.id).eq("shop_id", id).select().single() : await client.from("raw_materials").insert(payload).select().single();
  return requireCloudResult(result) as Row<"raw_materials">;
}
export async function deleteRawMaterial(materialId: string) {
  assertCloudOnline(); const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("raw_materials").update({ deleted_at: new Date().toISOString() }).eq("id", materialId).eq("shop_id", id).select().single());
}

export async function listProductionRuns() {
  const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("production_runs").select("*").eq("shop_id", id).order("produced_at", { ascending: false }).limit(1000)) as Row<"production_runs">[];
}
export async function createProductionRun(input: Omit<Insert<"production_runs">, "shop_id">) {
  assertCloudOnline(); const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("production_runs").insert({ ...input, shop_id: id }).select().single()) as Row<"production_runs">;
}

export async function getCatalogSetting<T = unknown>(key: string, fallback: T, shopIdOverride?: string): Promise<T> {
  const id = shopIdOverride || await shopId();
  const result = await getSupabaseClient().from("catalog_settings").select("value").eq("shop_id", id).eq("setting_key", key).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return (result.data?.value as T | undefined) ?? fallback;
}
export async function saveCatalogSetting(key: string, value: unknown) {
  assertCloudOnline(); const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("catalog_settings").upsert({ shop_id: id, setting_key: key, value: value as Database["public"]["Tables"]["catalog_settings"]["Insert"]["value"] }, { onConflict: "shop_id,setting_key" }).select().single()) as Row<"catalog_settings">;
}
export async function listCatalogTaxonomy(options: { publicOnly?: boolean; shopId?: string } = {}) {
  const id = options.shopId || await shopId(); const client = getSupabaseClient();
  if (options.publicOnly) {
    const [categories, companies, products] = await Promise.all([
      client.from("catalog_categories").select("id,shop_id,name,sort_order,deleted_at").eq("shop_id", id).is("deleted_at", null).order("sort_order").limit(1000),
      client.from("catalog_companies").select("id,shop_id,name,deleted_at").eq("shop_id", id).is("deleted_at", null).order("name").limit(1000),
      client.from("catalog_manual_products").select("id,shop_id,name,unit,price,description,details_url,loyalty_points,is_visible,catalog_image_url,catalog_image_storage_path,deleted_at").eq("shop_id", id).eq("is_visible", true).is("deleted_at", null).order("name").limit(2000),
    ]);
    return {
      categories: requireCloudResult(categories) as Row<"catalog_categories">[],
      companies: requireCloudResult(companies) as Row<"catalog_companies">[],
      products: requireCloudResult(products) as Row<"catalog_manual_products">[],
    };
  }
  const [categories, companies, products] = await Promise.all([
    client.from("catalog_categories").select("*").eq("shop_id", id).is("deleted_at", null).order("sort_order").limit(1000),
    client.from("catalog_companies").select("*").eq("shop_id", id).is("deleted_at", null).order("name").limit(1000),
    client.from("catalog_manual_products").select("*").eq("shop_id", id).is("deleted_at", null).order("name").limit(2000),
  ]);
  return { categories: requireCloudResult(categories), companies: requireCloudResult(companies), products: requireCloudResult(products) };
}
export async function saveCatalogCategory(input: Omit<Insert<"catalog_categories">, "shop_id"> & { id?: string }) {
  assertCloudOnline(); const id = await shopId(); const client = getSupabaseClient(); const payload = { ...input, shop_id: id } as Insert<"catalog_categories">;
  return requireCloudResult(input.id ? await client.from("catalog_categories").update(payload).eq("id", input.id).eq("shop_id", id).select().single() : await client.from("catalog_categories").insert(payload).select().single()) as Row<"catalog_categories">;
}
export async function saveCatalogCompany(input: Omit<Insert<"catalog_companies">, "shop_id"> & { id?: string }) {
  assertCloudOnline(); const id = await shopId(); const client = getSupabaseClient(); const payload = { ...input, shop_id: id } as Insert<"catalog_companies">;
  return requireCloudResult(input.id ? await client.from("catalog_companies").update(payload).eq("id", input.id).eq("shop_id", id).select().single() : await client.from("catalog_companies").insert(payload).select().single()) as Row<"catalog_companies">;
}
export async function saveCatalogManualProduct(input: Omit<Insert<"catalog_manual_products">, "shop_id"> & { id?: string }) {
  assertCloudOnline(); const id = await shopId(); const client = getSupabaseClient(); const payload = { ...input, shop_id: id } as Insert<"catalog_manual_products">;
  return requireCloudResult(input.id ? await client.from("catalog_manual_products").update(payload).eq("id", input.id).eq("shop_id", id).select().single() : await client.from("catalog_manual_products").insert(payload).select().single()) as Row<"catalog_manual_products">;
}
export async function deleteCatalogManualProduct(productId: string) {
  assertCloudOnline(); const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("catalog_manual_products").delete().eq("id", productId).eq("shop_id", id).select("id").single()) as Pick<Row<"catalog_manual_products">, "id">;
}

export async function saveCatalogFormulation(input: {
  id: string; version: number; catalog_visible: boolean; catalog_price?: number | null;
  catalog_old_price?: number | null; catalog_description: string; catalog_details_url: string;
  catalog_category: string; catalog_company: string; loyalty_points: number;
}) {
  assertCloudOnline(); const id = await shopId();
  const result = await getSupabaseClient().from("recipes").update({
    catalog_visible: input.catalog_visible,
    catalog_price: input.catalog_price ?? null,
    catalog_old_price: input.catalog_old_price ?? null,
    catalog_description: input.catalog_description,
    catalog_details_url: input.catalog_details_url,
    catalog_category: input.catalog_category,
    catalog_company: input.catalog_company,
    loyalty_points: input.loyalty_points,
    version: input.version + 1,
  }).eq("id", input.id).eq("shop_id", id).eq("version", input.version).is("deleted_at", null).select("*").single();
  const row = requireCloudResult(result) as Row<"recipes">;
  return row;
}

export async function listCatalogDisplayData(options: { includeProductImages?: boolean } = {}) {
  const [productsPage, taxonomy, pricing, recipes] = await Promise.all([
    listProductsPage({ limit: 50, includeImages: options.includeProductImages }),
    listCatalogTaxonomy(),
    getCatalogSetting("pricing", { deliveryMarkupPercent: 0 }),
    (async () => { const id = await shopId(); return requireCloudResult(await getSupabaseClient().from("recipes").select("*").eq("shop_id", id).is("deleted_at", null).limit(1000)); })(),
  ]);
  let signedImages = new Map<string, string>();
  const imagePaths = recipes.map(row => row.image_url).filter(isFormulationImageStoragePath);
  try { signedImages = await getSignedFormulationImageUrls(imagePaths); } catch { /* Keep catalog rows usable while private Storage is temporarily unavailable. */ }
  const catalogRecipes = recipes.map(row => ({
    ...row,
    image_storage_path: isFormulationImageStoragePath(row.image_url) ? row.image_url : null,
    image_signed_url: row.image_url ? (signedImages.get(row.image_url) || (isFormulationImageStoragePath(row.image_url) ? null : row.image_url)) : null,
  }));
  return { registeredProducts: productsPage.items, manualProducts: taxonomy.products, categories: taxonomy.categories, companies: taxonomy.companies, pricing, recipes: catalogRecipes };
}

const SHOP_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolvePublicCatalogShopId(requestedShopId?: string): Promise<string> {
  if (requestedShopId) {
    if (!SHOP_ID_PATTERN.test(requestedShopId)) throw new Error("رابط الكتالوج يحتوي على معرف متجر غير صالح.");
    return requestedShopId;
  }
  const client = getSupabaseClient();
  const [products, manualProducts, recipes] = await Promise.all([
    client.from("products").select("shop_id").eq("catalog_visible", true).is("deleted_at", null).limit(5000),
    client.from("catalog_manual_products").select("shop_id").eq("is_visible", true).is("deleted_at", null).limit(5000),
    client.from("recipes").select("shop_id").eq("catalog_visible", true).is("deleted_at", null).limit(5000),
  ]);
  const rows = [
    ...requireCloudResult(products),
    ...requireCloudResult(manualProducts),
    ...requireCloudResult(recipes),
  ];
  const shopIds = Array.from(new Set(rows.map(row => row.shop_id).filter(Boolean)));
  if (shopIds.length === 1) return shopIds[0];
  if (shopIds.length > 1) throw new Error("يوجد أكثر من متجر في الكتالوج؛ افتح الرابط الخاص بالمتجر المطلوب.");
  throw new Error("لا توجد منتجات منشورة في الكتالوج حالياً.");
}

/** Public customer catalog read. It accepts a public shop ID and never requires a staff session. */
export async function listPublicCatalogDisplayData(options: { includeProductImages?: boolean; shopId?: string } = {}) {
  const id = await resolvePublicCatalogShopId(options.shopId);
  const client = getSupabaseClient();
  const [productResult, taxonomy, pricing, recipes] = await Promise.all([
    client.from("products").select("id, name, unit_name, retail_price, category_name, loyalty_points, catalog_image_path, catalog_visible, catalog_price, catalog_old_price, catalog_description, catalog_details_url, catalog_category, catalog_company, catalog_loyalty_points").eq("shop_id", id).eq("catalog_visible", true).is("deleted_at", null).order("name").limit(200),
    listCatalogTaxonomy({ publicOnly: true, shopId: id }),
    getCatalogSetting("pricing", { deliveryMarkupPercent: 0 }, id),
    client.from("recipes").select("id, shop_id, name, retail_price, production_unit, loyalty_points, image_url, catalog_visible, catalog_price, catalog_old_price, catalog_description, catalog_details_url, catalog_category, catalog_company, version").eq("shop_id", id).eq("catalog_visible", true).is("deleted_at", null).limit(1000),
  ]);
  const products = await Promise.all(requireCloudResult(productResult).map(async row => ({
    id: row.id,
    name: row.name,
    unit: row.unit_name,
    retailPrice: row.retail_price,
    wholesaleRetailPrice: row.retail_price,
    category: row.catalog_category || row.category_name,
    company: row.catalog_company || "أبو رغوة",
    catalogVisible: row.catalog_visible,
    catalogPrice: row.catalog_price,
    catalogOldPrice: row.catalog_old_price,
    catalogDescription: row.catalog_description,
    catalogDetailsUrl: row.catalog_details_url,
    loyaltyPoints: row.catalog_loyalty_points,
    imageUrl: options.includeProductImages === false || !row.catalog_image_path
      ? undefined
      : await getSignedProductImageUrl(row.catalog_image_path).catch(() => undefined),
  })));
  const recipeRows = requireCloudResult(recipes);
  let signedImages = new Map<string, string>();
  const imagePaths = recipeRows.map(row => row.image_url).filter(isFormulationImageStoragePath);
  try { signedImages = await getSignedFormulationImageUrls(imagePaths); } catch { /* Keep catalog rows usable while private Storage is temporarily unavailable. */ }
  const catalogRecipes = recipeRows.map(row => ({
    ...row,
    image_storage_path: isFormulationImageStoragePath(row.image_url) ? row.image_url : null,
    image_signed_url: row.image_url ? (signedImages.get(row.image_url) || (isFormulationImageStoragePath(row.image_url) ? null : row.image_url)) : null,
  }));
  return { shopId: id, registeredProducts: products, manualProducts: taxonomy.products, categories: taxonomy.categories, companies: taxonomy.companies, pricing, recipes: catalogRecipes };
}

export async function listCatalogRewards(shopIdOverride?: string) {
  const id = shopIdOverride || await shopId();
  return requireCloudResult(await getSupabaseClient().from("loyalty_rewards").select("gift_name, points_required, is_active").eq("shop_id", id).eq("is_active", true).order("points_required").limit(100));
}
