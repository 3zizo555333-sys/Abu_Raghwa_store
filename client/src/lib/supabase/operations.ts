import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];
type Row<K extends keyof Tables> = Tables[K]["Row"];
type Insert<K extends keyof Tables> = Tables[K]["Insert"];

async function shopId() {
  return (await getActiveShopContext()).shopId;
}

export async function listStaffEmployees() {
  const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("staff_employees").select("*").eq("shop_id", id).is("deleted_at", null).order("name").limit(1000)) as Row<"staff_employees">[];
}
export async function saveStaffEmployee(input: Omit<Insert<"staff_employees">, "shop_id"> & { id?: string }) {
  assertCloudOnline(); const id = await shopId(); const client = getSupabaseClient();
  const payload = { ...input, shop_id: id } as Insert<"staff_employees">;
  const result = input.id ? await client.from("staff_employees").update(payload).eq("id", input.id).eq("shop_id", id).select().single() : await client.from("staff_employees").insert(payload).select().single();
  return requireCloudResult(result);
}
export async function softDeleteStaffEmployee(employeeId: string) {
  assertCloudOnline(); const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("staff_employees").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", employeeId).eq("shop_id", id).select().single());
}

export async function listRawMaterials() {
  const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("raw_materials").select("*").eq("shop_id", id).is("deleted_at", null).order("name").limit(2000)) as Row<"raw_materials">[];
}
export async function saveRawMaterial(input: Omit<Insert<"raw_materials">, "shop_id"> & { id?: string }) {
  assertCloudOnline(); const id = await shopId(); const client = getSupabaseClient();
  const payload = { ...input, shop_id: id } as Insert<"raw_materials">;
  const result = input.id ? await client.from("raw_materials").update(payload).eq("id", input.id).eq("shop_id", id).select().single() : await client.from("raw_materials").insert(payload).select().single();
  return requireCloudResult(result);
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
  return requireCloudResult(await getSupabaseClient().from("production_runs").insert({ ...input, shop_id: id }).select().single());
}

export async function getCatalogSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const id = await shopId();
  const result = await getSupabaseClient().from("catalog_settings").select("value").eq("shop_id", id).eq("setting_key", key).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return (result.data?.value as T | undefined) ?? fallback;
}
export async function saveCatalogSetting(key: string, value: unknown) {
  assertCloudOnline(); const id = await shopId();
  return requireCloudResult(await getSupabaseClient().from("catalog_settings").upsert({ shop_id: id, setting_key: key, value: value as Database["public"]["Tables"]["catalog_settings"]["Insert"]["value"] }, { onConflict: "shop_id,setting_key" }).select().single());
}
export async function listCatalogTaxonomy() {
  const id = await shopId(); const client = getSupabaseClient();
  const [categories, companies, products] = await Promise.all([
    client.from("catalog_categories").select("*").eq("shop_id", id).is("deleted_at", null).order("sort_order").limit(1000),
    client.from("catalog_companies").select("*").eq("shop_id", id).is("deleted_at", null).order("name").limit(1000),
    client.from("catalog_manual_products").select("*").eq("shop_id", id).is("deleted_at", null).order("name").limit(2000),
  ]);
  return { categories: requireCloudResult(categories), companies: requireCloudResult(companies), products: requireCloudResult(products) };
}
export async function saveCatalogCategory(input: Omit<Insert<"catalog_categories">, "shop_id"> & { id?: string }) {
  assertCloudOnline(); const id = await shopId(); const client = getSupabaseClient(); const payload = { ...input, shop_id: id } as Insert<"catalog_categories">;
  return requireCloudResult(input.id ? await client.from("catalog_categories").update(payload).eq("id", input.id).eq("shop_id", id).select().single() : await client.from("catalog_categories").insert(payload).select().single());
}
export async function saveCatalogCompany(input: Omit<Insert<"catalog_companies">, "shop_id"> & { id?: string }) {
  assertCloudOnline(); const id = await shopId(); const client = getSupabaseClient(); const payload = { ...input, shop_id: id } as Insert<"catalog_companies">;
  return requireCloudResult(input.id ? await client.from("catalog_companies").update(payload).eq("id", input.id).eq("shop_id", id).select().single() : await client.from("catalog_companies").insert(payload).select().single());
}
export async function saveCatalogManualProduct(input: Omit<Insert<"catalog_manual_products">, "shop_id"> & { id?: string }) {
  assertCloudOnline(); const id = await shopId(); const client = getSupabaseClient(); const payload = { ...input, shop_id: id } as Insert<"catalog_manual_products">;
  return requireCloudResult(input.id ? await client.from("catalog_manual_products").update(payload).eq("id", input.id).eq("shop_id", id).select().single() : await client.from("catalog_manual_products").insert(payload).select().single());
}
