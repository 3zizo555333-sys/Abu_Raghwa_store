import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database } from "./database.types";
import { prepareCloudProductImage } from "./prepareProductImage";

type InventoryItemRow = Database["public"]["Tables"]["apartment_inventory_items"]["Row"];
type InventoryCategoryRow = Database["public"]["Tables"]["apartment_inventory_categories"]["Row"];
type InventoryWritableColumns = Partial<Pick<InventoryItemRow, "name" | "supplier" | "location" | "unit" | "pieces_per_unit" | "quantity" | "extra_pieces" | "wholesale_price" | "retail_price" | "wholesale_retail_price" | "category_name">>;

export type ApartmentInventoryItem = {
  id: string;
  name: string;
  supplier: string;
  location: string;
  unit: string;
  piecesPerUnit: number;
  quantity: number;
  extraPieces: number;
  wholesalePrice: number;
  retailPrice: number;
  wholesaleRetailPrice: number;
  category: string;
  createdAt: string;
  updatedAt: string;
  imageUrl?: string;
};

export type ApartmentInventoryInput = Omit<ApartmentInventoryItem, "id" | "createdAt" | "updatedAt">;
export type ApartmentInventoryPatch = Partial<ApartmentInventoryInput>;
export type ApartmentInventorySnapshot = {
  items: ApartmentInventoryItem[];
  categories: string[];
  shopId: string;
  role: "manager" | "admin" | "supervisor" | "seller";
};

const PAGE_SIZE = 500;
let pendingBulkRequest: { signature: string; requestId: string } | null = null;
const numericFields = ["piecesPerUnit", "quantity", "extraPieces", "wholesalePrice", "retailPrice", "wholesaleRetailPrice"] as const;
type NumericField = typeof numericFields[number];

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapApartmentInventoryItem(row: InventoryItemRow): ApartmentInventoryItem {
  return {
    id: row.id,
    name: row.name,
    supplier: row.supplier,
    location: row.location,
    unit: row.unit,
    piecesPerUnit: numberValue(row.pieces_per_unit),
    quantity: numberValue(row.quantity),
    extraPieces: numberValue(row.extra_pieces),
    wholesalePrice: numberValue(row.wholesale_price),
    retailPrice: numberValue(row.retail_price),
    wholesaleRetailPrice: numberValue(row.wholesale_retail_price),
    category: row.category_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`حقل ${field} أطول من الحد المسموح.`);
  return normalized;
}

function validateNonNegativeNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`قيمة ${field} يجب أن تكون رقماً غير سالب.`);
  return value;
}

export function toApartmentInventoryPayload(input: ApartmentInventoryInput | ApartmentInventoryPatch): InventoryWritableColumns {
  const payload: Record<string, string | number> = {};
  if (input.name !== undefined) payload.name = normalizeText(input.name, "اسم المنتج", 200);
  if (input.supplier !== undefined) payload.supplier = normalizeText(input.supplier, "المورد", 200);
  if (input.location !== undefined) payload.location = normalizeText(input.location, "مكان التخزين", 300);
  if (input.unit !== undefined) payload.unit = normalizeText(input.unit, "الوحدة", 80);
  if (input.category !== undefined) payload.category_name = normalizeText(input.category, "الفئة", 120);
  const labels: Record<NumericField, string> = {
    piecesPerUnit: "عدد القطع داخل الوحدة",
    quantity: "الكمية",
    extraPieces: "القطع الإضافية",
    wholesalePrice: "تكلفة الشراء",
    retailPrice: "سعر البيع القطاعي",
    wholesaleRetailPrice: "سعر البيع بالجملة",
  };
  for (const field of numericFields) {
    const value = input[field];
    if (value !== undefined) payload[{
      piecesPerUnit: "pieces_per_unit",
      quantity: "quantity",
      extraPieces: "extra_pieces",
      wholesalePrice: "wholesale_price",
      retailPrice: "retail_price",
      wholesaleRetailPrice: "wholesale_retail_price",
    }[field]] = validateNonNegativeNumber(value, labels[field]);
  }
  if ("name" in input && !payload.name) throw new Error("اسم المنتج مطلوب.");
  if ("category" in input && !payload.category_name) throw new Error("الفئة مطلوبة.");
  return payload as InventoryWritableColumns;
}

function mapCategory(row: InventoryCategoryRow): string {
  return row.name;
}

async function fetchAllItems(shopId: string): Promise<ApartmentInventoryItem[]> {
  const supabase = getSupabaseClient();
  const items: ApartmentInventoryItem[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await supabase
      .from("apartment_inventory_items")
      .select("id, shop_id, name, supplier, location, unit, pieces_per_unit, quantity, extra_pieces, wholesale_price, retail_price, wholesale_retail_price, category_name, created_at, updated_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    const rows = requireCloudResult(result) as InventoryItemRow[];
    items.push(...rows.map(mapApartmentInventoryItem));
    if (rows.length < PAGE_SIZE) return items;
  }
}

async function fetchAllCategories(shopId: string): Promise<string[]> {
  const supabase = getSupabaseClient();
  const categories: string[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await supabase
      .from("apartment_inventory_categories")
      .select("id, shop_id, name, created_at, updated_at")
      .eq("shop_id", shopId)
      .order("name", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    const rows = requireCloudResult(result) as InventoryCategoryRow[];
    categories.push(...rows.map(mapCategory));
    if (rows.length < PAGE_SIZE) return categories;
  }
}

export async function listCloudApartmentInventory(): Promise<ApartmentInventorySnapshot> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  const [items, categories, imagesResult] = await Promise.all([
    fetchAllItems(shopId), fetchAllCategories(shopId),
    getSupabaseClient().from("apartment_inventory_images").select("id,shop_id,item_id,storage_path,content_type,size_bytes,created_by,created_at").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(5000),
  ]);
  const images = requireCloudResult(imagesResult) as Array<{ item_id: string; storage_path: string }>;
  const latest = new Map<string, string>();
  for (const image of images) if (!latest.has(image.item_id)) latest.set(image.item_id, image.storage_path);
  const withImages = await Promise.all(items.map(async item => {
    const path = latest.get(item.id);
    if (!path) return item;
    const { data, error } = await getSupabaseClient().storage.from("product-images").createSignedUrl(path, 900);
    if (error || !data?.signedUrl) return item;
    return { ...item, imageUrl: data.signedUrl };
  }));
  return { items: withImages, categories: Array.from(new Set(categories)), shopId, role };
}

export async function createCloudApartmentCategory(name: string): Promise<string> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const normalized = normalizeText(name, "الفئة", 120);
  if (!normalized) throw new Error("اسم الفئة مطلوب.");
  const supabase = getSupabaseClient();
  const result = await supabase
    .from("apartment_inventory_categories")
    .insert({ shop_id: shopId, name: normalized })
    .select("id, shop_id, name, created_at, updated_at")
    .single();
  if (result.error?.code === "23505") {
    const existing = await supabase
      .from("apartment_inventory_categories")
      .select("id, shop_id, name, created_at, updated_at")
      .eq("shop_id", shopId)
      .eq("name", normalized)
      .single();
    return mapCategory(requireCloudResult(existing) as InventoryCategoryRow);
  }
  return mapCategory(requireCloudResult(result) as InventoryCategoryRow);
}

export async function createCloudApartmentItems(inputs: ApartmentInventoryInput[]): Promise<ApartmentInventoryItem[]> {
  if (inputs.length === 0) return [];
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const rows = inputs.map(input => toApartmentInventoryPayload(input));
  const signature = JSON.stringify(rows);
  if (!pendingBulkRequest || pendingBulkRequest.signature !== signature) pendingBulkRequest = { signature, requestId: globalThis.crypto.randomUUID() };
  const result = await getSupabaseClient().rpc("create_apartment_inventory_items_bulk", {
    p_shop_id: shopId, p_request_id: pendingBulkRequest.requestId, p_items: rows as unknown as Database["public"]["Functions"]["create_apartment_inventory_items_bulk"]["Args"]["p_items"],
  });
  const saved = (requireCloudResult(result) as unknown as InventoryItemRow[]).map(mapApartmentInventoryItem);
  pendingBulkRequest = null;
  return saved;
}

export async function updateCloudApartmentItem(id: string, patch: ApartmentInventoryPatch, expectedUpdatedAt: string): Promise<ApartmentInventoryItem> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const payload = toApartmentInventoryPayload(patch);
  if (Object.keys(payload).length === 0) throw new Error("لا توجد تغييرات لحفظها.");
  const result = await getSupabaseClient()
    .from("apartment_inventory_items")
    .update(payload)
    .eq("id", id)
    .eq("shop_id", shopId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id, shop_id, name, supplier, location, unit, pieces_per_unit, quantity, extra_pieces, wholesale_price, retail_price, wholesale_retail_price, category_name, created_at, updated_at")
    .single();
  if (result.error?.code === "PGRST116") {
    throw new Error("تغيّر هذا الصنف بعد تحميله على جهاز آخر. حدّث القائمة ثم أعد المحاولة.");
  }
  return mapApartmentInventoryItem(requireCloudResult(result) as InventoryItemRow);
}

export async function updateCloudApartmentItemsCategory(expectedItems: Array<Pick<ApartmentInventoryItem, "id" | "updatedAt">>, category: string): Promise<ApartmentInventoryItem[]> {
  if (expectedItems.length === 0) return [];
  const ids = expectedItems.map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("قائمة الأصناف تحتوي على معرفات مكررة.");
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const normalized = normalizeText(category, "الفئة", 120);
  if (!normalized) throw new Error("اسم الفئة مطلوب.");
  const result = await getSupabaseClient().rpc("move_apartment_inventory_items_category", {
    p_shop_id: shopId,
    p_expected_items: expectedItems.map(item => ({ id: item.id, updated_at: item.updatedAt })) as unknown as Database["public"]["Functions"]["move_apartment_inventory_items_category"]["Args"]["p_expected_items"],
    p_category: normalized,
  });
  return (requireCloudResult(result) as unknown as InventoryItemRow[]).map(mapApartmentInventoryItem);
}

export async function uploadCloudApartmentInventoryImage(itemId: string, file: File): Promise<{ imageUrl: string; storagePath: string }> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (!( ["manager", "admin", "supervisor"] as string[]).includes(role)) throw new Error("رفع صور المخزن متاح للإدارة فقط.");
  const image = await prepareCloudProductImage(file);
  const imageId = globalThis.crypto.randomUUID();
  const storagePath = `${shopId}/apartment-inventory/${itemId}/${imageId}.webp`;
  const bucket = getSupabaseClient().storage.from("product-images");
  const upload = await bucket.upload(storagePath, image, { contentType: "image/webp", cacheControl: "3600", upsert: false });
  if (upload.error) throw new Error(upload.error.message);
  const registered = await getSupabaseClient().rpc("register_apartment_inventory_image", {
    p_shop_id: shopId, p_item_id: itemId, p_image_id: imageId, p_storage_path: storagePath, p_content_type: "image/webp", p_size_bytes: image.size,
  });
  if (registered.error || !registered.data) {
    const cleanup = await bucket.remove([storagePath]);
    if (cleanup.error) console.error("Apartment inventory image cleanup failed", cleanup.error.message);
    throw new Error(registered.error?.message ?? "لم يؤكد الخادم ربط الصورة بالصنف.");
  }
  const { data, error } = await bucket.createSignedUrl(storagePath, 900);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "تعذر إنشاء رابط مؤقت للصورة.");
  return { imageUrl: data.signedUrl, storagePath };
}

export async function deleteCloudApartmentItems(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const result = await getSupabaseClient()
    .from("apartment_inventory_items")
    .delete()
    .eq("shop_id", shopId)
    .in("id", ids)
    .select("id");
  const rows = requireCloudResult(result) as Array<{ id: string }>;
  return rows.map(row => row.id);
}
