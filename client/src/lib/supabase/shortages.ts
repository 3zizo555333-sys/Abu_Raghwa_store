import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext, listProductsPage, type CloudProduct, type ProductCursor } from "./products";
import type { Database } from "./database.types";

type ShortageRow = Database["public"]["Tables"]["shortage_items"]["Row"];
type CategoryRow = Database["public"]["Tables"]["shortage_categories"]["Row"];
type ManualProductRow = Database["public"]["Tables"]["shortage_manual_products"]["Row"];

export type ShortageStatus = "pending" | "ordered" | "received";
export type CloudShortage = {
  id: string;
  version: number;
  productId: string;
  productName: string;
  currentQuantity: number;
  minQuantity: number;
  unit: string;
  shortage: number;
  reportedDate: string;
  status: ShortageStatus;
  notes: string;
  category: string;
};
export type CloudManualProduct = { id: string; name: string; category: string; unit: string };
export type CloudShortageCategory = { id: string; name: string };
export type ShortageInput = Omit<CloudShortage, "id" | "version" | "shortage" | "reportedDate"> & { reportedAt?: string };

function requireSupervisor(role: string) {
  if (!["manager", "admin", "supervisor"].includes(role)) throw new Error("هذه البيانات متاحة للمدير أو المشرف فقط.");
}

export function mapShortageRow(row: ShortageRow): CloudShortage {
  return {
    id: row.id,
    version: Number(row.version),
    productId: row.product_id ?? "",
    productName: row.product_name_snapshot,
    currentQuantity: Number(row.current_quantity),
    minQuantity: Number(row.min_quantity),
    unit: row.unit,
    shortage: Number(row.shortage),
    reportedDate: new Date(row.reported_at).toLocaleDateString("ar-EG"),
    status: row.status as ShortageStatus,
    notes: row.notes,
    category: row.category,
  };
}

export function toShortagePayload(input: ShortageInput) {
  const productName = input.productName.trim();
  const category = input.category.trim();
  const unit = input.unit.trim();
  const notes = input.notes.trim();
  const currentQuantity = Number(input.currentQuantity);
  const minQuantity = Number(input.minQuantity);
  if (!productName || productName.length > 160) throw new Error("اسم المنتج مطلوب ويجب ألا يتجاوز 160 حرفًا.");
  if (!category || category.length > 80) throw new Error("الفئة مطلوبة ويجب ألا تتجاوز 80 حرفًا.");
  if (!Number.isFinite(currentQuantity) || currentQuantity < 0 || !Number.isFinite(minQuantity) || minQuantity < 0) throw new Error("الكميات يجب أن تكون أرقامًا موجبة أو صفرًا.");
  if (unit.length > 40 || notes.length > 500) throw new Error("تجاوزت الوحدة أو الملاحظات الحد المسموح.");
  if (!["pending", "ordered", "received"].includes(input.status)) throw new Error("حالة النقص غير صالحة.");
  return {
    product_id: input.productId || null,
    product_name_snapshot: productName,
    current_quantity: currentQuantity,
    min_quantity: minQuantity,
    unit,
    status: input.status,
    notes,
    category,
    ...(input.reportedAt ? { reported_at: input.reportedAt } : {}),
  };
}

export function normalizeManualProductNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map(name => name.trim()).filter(name => {
    if (!name || name.length > 120) return false;
    const key = name.toLocaleLowerCase("ar");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 500);
}

export async function listShortageProducts(): Promise<CloudProduct[]> {
  const products: CloudProduct[] = [];
  let cursor: ProductCursor | null = null;
  do {
    const page = await listProductsPage({ cursor, limit: 100 });
    products.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return products;
}

export async function listCloudShortages(): Promise<CloudShortage[]> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  requireSupervisor(role);
  const result = await getSupabaseClient().from("shortage_items").select("*").eq("shop_id", shopId).is("deleted_at", null).order("reported_at", { ascending: false }).order("id", { ascending: false });
  return (requireCloudResult(result) as ShortageRow[]).map(mapShortageRow);
}

export async function saveCloudShortage(input: ShortageInput, current?: Pick<CloudShortage, "id" | "version">): Promise<CloudShortage> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  requireSupervisor(role);
  const payload = toShortagePayload(input);
  const supabase = getSupabaseClient();
  if (!current) {
    const result = await supabase.from("shortage_items").insert({ shop_id: shopId, ...payload }).select("*").single();
    return mapShortageRow(requireCloudResult(result) as ShortageRow);
  }
  const result = await supabase.from("shortage_items").update({ ...payload, version: current.version + 1 }).eq("shop_id", shopId).eq("id", current.id).eq("version", current.version).is("deleted_at", null).select("*").maybeSingle();
  const row = requireCloudResult(result) as ShortageRow | null;
  if (!row) throw new Error("تغير هذا النقص على جهاز آخر؛ حدّث القائمة ثم أعد المحاولة.");
  return mapShortageRow(row);
}

export async function deleteCloudShortage(item: Pick<CloudShortage, "id" | "version">): Promise<void> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  requireSupervisor(role);
  const result = await getSupabaseClient().from("shortage_items").update({ deleted_at: new Date().toISOString(), version: item.version + 1 }).eq("shop_id", shopId).eq("id", item.id).eq("version", item.version).is("deleted_at", null).select("id").maybeSingle();
  const row = requireCloudResult(result);
  if (!row) throw new Error("تغير هذا النقص على جهاز آخر؛ حدّث القائمة ثم أعد المحاولة.");
}

export async function listCloudShortageCategories(): Promise<CloudShortageCategory[]> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  requireSupervisor(role);
  const result = await getSupabaseClient().from("shortage_categories").select("id, name").eq("shop_id", shopId).is("deleted_at", null).order("name");
  return (requireCloudResult(result) as Pick<CategoryRow, "id" | "name">[]).map(row => ({ id: row.id, name: row.name }));
}

export async function createCloudShortageCategory(name: string): Promise<CloudShortageCategory> {
  assertCloudOnline();
  const normalized = name.trim();
  if (!normalized || normalized.length > 80) throw new Error("اسم الفئة مطلوب ويجب ألا يتجاوز 80 حرفًا.");
  const { shopId, role } = await getActiveShopContext();
  requireSupervisor(role);
  const result = await getSupabaseClient().from("shortage_categories").insert({ shop_id: shopId, name: normalized }).select("id, name").single();
  return requireCloudResult(result) as CloudShortageCategory;
}

export async function listCloudManualProducts(): Promise<CloudManualProduct[]> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  requireSupervisor(role);
  const result = await getSupabaseClient().from("shortage_manual_products").select("id, name, category_name, unit").eq("shop_id", shopId).is("deleted_at", null).order("name");
  return (requireCloudResult(result) as Pick<ManualProductRow, "id" | "name" | "category_name" | "unit">[]).map(row => ({ id: row.id, name: row.name, category: row.category_name, unit: row.unit }));
}

export async function replaceCloudManualProducts(category: string, names: string[]): Promise<CloudManualProduct[]> {
  assertCloudOnline();
  const normalizedCategory = category.trim();
  if (!normalizedCategory || normalizedCategory.length > 80) throw new Error("الفئة مطلوبة ويجب ألا تتجاوز 80 حرفًا.");
  const normalizedNames = normalizeManualProductNames(names);
  const { shopId, role } = await getActiveShopContext();
  requireSupervisor(role);
  const result = await getSupabaseClient().rpc("replace_shortage_manual_products", { p_shop_id: shopId, p_category: normalizedCategory, p_names: normalizedNames });
  const rows = requireCloudResult(result) as ManualProductRow[];
  return rows.map(row => ({ id: row.id, name: row.name, category: row.category_name, unit: row.unit }));
}
