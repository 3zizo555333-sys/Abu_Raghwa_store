import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database, Json } from "./database.types";
import { getSignedFormulationImageUrls, isFormulationImageStoragePath } from "./formulationImages";

export type CloudFormulationIngredient = { materialId: string; materialName: string; quantity: number; unit: string; cost: number };
export type CloudFormulation = {
  id: string; name: string; ingredients: CloudFormulationIngredient[]; totalCost: number;
  productionQuantity: number; productionUnit: string; costPerUnit: number; salePrice: number;
  profitValue: number; profitPercent: number; notes: string; createdDate: string;
  isPasswordProtected: boolean; password?: string; imageUrl?: string; imageStoragePath?: string; loyaltyPoints: number; version: number;
};
export type CloudFormulationInput = Omit<CloudFormulation, "id" | "version" | "createdDate" | "profitValue" | "profitPercent"> & { id?: string; version?: number };

const n = (value: unknown) => { const x = Number(value); return Number.isFinite(x) ? x : 0; };
const obj = (value: Json): Record<string, Json | undefined> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json | undefined> : {};
const bytesToBase64 = (bytes: Uint8Array) => btoa(bytes.reduce((result, byte) => result + String.fromCharCode(byte), ""));
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));

export async function hashFormulationPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120_000, hash: "SHA-256" }, key, 256);
  return `pbkdf2$120000$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

export async function verifyFormulationPassword(encoded: string | undefined, password: string): Promise<boolean> {
  if (!encoded) return false;
  const [scheme, rounds, saltText, digestText] = encoded.split("$");
  if (scheme !== "pbkdf2" || !Number.isInteger(Number(rounds)) || !saltText || !digestText) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: base64ToBytes(saltText), iterations: Number(rounds), hash: "SHA-256" }, key, 256);
  const actual = new Uint8Array(bits); const expected = base64ToBytes(digestText);
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
}

export async function listCloudFormulations(): Promise<CloudFormulation[]> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (!( ["manager", "admin", "supervisor"] as string[]).includes(role)) return [];
  const client = getSupabaseClient();
  const formulas = requireCloudResult(await client.from("formulations").select("*").eq("shop_id", shopId).is("deleted_at", null).order("created_at", { ascending: false }).limit(2000)) as Database["public"]["Tables"]["recipes"]["Row"][];
  if (!formulas.length) return [];
  const storagePaths = formulas.map(row => row.image_url).filter(isFormulationImageStoragePath);
  let signedImages = new Map<string, string>();
  try { signedImages = await getSignedFormulationImageUrls(storagePaths); } catch { /* Keep recipe records visible when Storage signing is temporarily unavailable. */ }
  const rows = requireCloudResult(await client.from("recipe_ingredients").select("id,recipe_id,shop_id,raw_material_id,material_name_snapshot,unit,quantity,cost,created_at,updated_at").eq("shop_id", shopId).in("recipe_id", formulas.map(row => row.id)).limit(10000)) as Database["public"]["Tables"]["recipe_ingredients"]["Row"][];
  const grouped = new Map<string, CloudFormulationIngredient[]>();
  for (const row of rows) {
    const list = grouped.get(row.recipe_id) ?? [];
    list.push({ materialId: row.raw_material_id ?? "", materialName: row.material_name_snapshot, quantity: n(row.quantity), unit: row.unit, cost: n(row.cost) });
    grouped.set(row.recipe_id, list);
  }
  return formulas.map(row => {
    const ingredients = grouped.get(row.id) ?? [];
    const totalCost = ingredients.reduce((sum, item) => sum + item.cost, 0) || n(row.cost_price);
    const qty = n(row.production_quantity) || 1;
    const salePrice = n(row.retail_price);
    const profitValue = salePrice * qty - totalCost;
    return {
      id: row.id, name: row.name, ingredients, totalCost, productionQuantity: qty, productionUnit: row.production_unit,
      costPerUnit: totalCost / qty, salePrice, profitValue,
      profitPercent: salePrice * qty > 0 ? profitValue / (salePrice * qty) * 100 : 0,
      notes: row.notes || row.description || "", createdDate: row.created_at,
      isPasswordProtected: row.is_password_protected, password: row.password_hash ?? undefined, loyaltyPoints: row.loyalty_points,
      imageUrl: row.image_url ? (signedImages.get(row.image_url) || (isFormulationImageStoragePath(row.image_url) ? undefined : row.image_url)) : undefined,
      imageStoragePath: isFormulationImageStoragePath(row.image_url) ? row.image_url : undefined, version: row.version,
    };
  });
}

export async function saveCloudFormulation(input: CloudFormulationInput): Promise<CloudFormulation> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (!( ["manager", "admin", "supervisor"] as string[]).includes(role)) throw new Error("إدارة التركيبات متاحة للإدارة فقط.");
  const totalCost = input.ingredients.reduce((sum, item) => sum + item.cost, 0);
  const profit = (input.salePrice * input.productionQuantity) - totalCost;
  const passwordHash = input.password && !input.password.startsWith("pbkdf2$") ? await hashFormulationPassword(input.password) : input.password;
  const payload = {
    name: input.name.trim(), description: input.notes, notes: input.notes,
    cost_price: totalCost, retail_price: input.salePrice, category: "عام",
    production_quantity: input.productionQuantity, production_unit: input.productionUnit,
    loyalty_points: input.loyaltyPoints, image_url: input.imageStoragePath || input.imageUrl || null,
    is_password_protected: input.isPasswordProtected,
    password_hash: passwordHash || null,
  } as unknown as Json;
  const ingredients = input.ingredients.map(item => ({ raw_material_id: item.materialId, material_name: item.materialName, product_id: null, unit: item.unit || "كيلو", quantity: item.quantity, cost: item.cost })) as unknown as Json;
  const result = requireCloudResult(await getSupabaseClient().rpc("save_formulation_with_ingredients", {
    p_shop_id: shopId, p_formulation_id: input.id ?? null, p_expected_version: input.version ?? null, p_formulation: payload, p_ingredients: ingredients,
  })) as Json;
  const root = obj(result);
  const row = obj(root.formulation as Json);
  const returnedIngredients = Array.isArray(root.ingredients) ? root.ingredients : [];
  const mappedIngredients = returnedIngredients.map(value => {
    const item = obj(value as Json);
    return { materialId: String(item.raw_material_id ?? ""), materialName: String(item.material_name_snapshot ?? ""), quantity: n(item.quantity), unit: String(item.unit ?? "كيلو"), cost: n(item.cost) };
  });
  const qty = n(row.production_quantity) || 1;
  const total = n(row.cost_price);
  const sale = n(row.retail_price);
  const profitValue = sale * qty - total;
  return {
    id: String(row.id), name: String(row.name), ingredients: mappedIngredients, totalCost: total,
    productionQuantity: qty, productionUnit: String(row.production_unit), costPerUnit: total / qty,
    salePrice: sale, profitValue, profitPercent: sale * qty ? profitValue / (sale * qty) * 100 : 0,
    notes: String(row.notes ?? ""), createdDate: String(row.created_at), isPasswordProtected: Boolean(row.is_password_protected), password: row.password_hash ? String(row.password_hash) : undefined,
    loyaltyPoints: n(row.loyalty_points), imageUrl: row.image_url && !isFormulationImageStoragePath(String(row.image_url)) ? String(row.image_url) : undefined,
    imageStoragePath: isFormulationImageStoragePath(row.image_url) ? String(row.image_url) : undefined, version: n(row.version),
  };
}

export async function deleteCloudFormulation(id: string, version: number) {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (!( ["manager", "admin", "supervisor"] as string[]).includes(role)) throw new Error("إدارة التركيبات متاحة للإدارة فقط.");
  const deleted = requireCloudResult(await getSupabaseClient().from("recipes").update({ deleted_at: new Date().toISOString(), version: version + 1 }).eq("id", id).eq("shop_id", shopId).eq("version", version).is("deleted_at", null).select("id").single());
  return deleted;
}
