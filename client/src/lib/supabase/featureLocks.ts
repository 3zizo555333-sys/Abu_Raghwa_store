import { getActiveShopContext } from "./products";
import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import type { Database, Json } from "./database.types";

export { SCREEN_PIN_LOCKS, screenPinKeyForPath } from "./screenPinRegistry";
export type FeatureLockKey = string;
export type FeatureLockRow = Database["public"]["Tables"]["shop_feature_locks"]["Row"];

export interface BulkFeatureLockResult {
  enabledCount: number;
  missingKeys: string[];
}

export function isFeatureLockKey(value: string): value is FeatureLockKey {
  return /^screen__[a-z0-9_]{1,112}$/.test(value);
}

export function isValidFeaturePin(value: string): boolean {
  return /^(?:[0-9]{4}|[0-9]{6})$/.test(value);
}

export async function listShopFeatureLocks(shopId: string): Promise<FeatureLockRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("shop_feature_locks")
    .select("shop_id, feature_key, enabled, pin_configured, updated_by, created_at, updated_at")
    .eq("shop_id", shopId)
    .order("feature_key");
  return requireCloudResult({ data, error });
}

export function subscribeShopFeatureLocks(shopId: string, onChange: () => void): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`shop-feature-locks:${shopId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "shop_feature_locks",
      filter: `shop_id=eq.${shopId}`,
    }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

async function assertManagerForShop(shopId: string): Promise<void> {
  const context = await getActiveShopContext(true);
  if (context.shopId !== shopId || context.role !== "manager") {
    throw new Error("إدارة أقفال الميزات متاحة لمدير المتجر فقط.");
  }
}

export async function setShopFeatureLock(
  shopId: string,
  featureKey: FeatureLockKey,
  enabled: boolean,
): Promise<FeatureLockRow> {
  if (!isFeatureLockKey(featureKey)) throw new Error("معرّف شاشة PIN غير صالح.");
  assertCloudOnline();
  await assertManagerForShop(shopId);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("set_shop_feature_lock", {
    p_shop_id: shopId,
    p_feature_key: featureKey,
    p_enabled: enabled,
  });
  return requireCloudResult({ data, error });
}

export async function setShopFeatureLockPin(
  shopId: string,
  featureKey: FeatureLockKey,
  pin: string,
): Promise<void> {
  if (!isFeatureLockKey(featureKey)) throw new Error("معرّف شاشة PIN غير صالح.");
  if (!isValidFeaturePin(pin)) throw new Error("رمز القفل يجب أن يتكون من 4 أو 6 أرقام.");
  assertCloudOnline();
  await assertManagerForShop(shopId);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("set_shop_feature_lock_pin", {
    p_shop_id: shopId,
    p_feature_key: featureKey,
    p_pin: pin,
  });
  if (error?.message.includes("FEATURE_LOCK_PIN_MUST_BE_UNIQUE")) {
    throw new Error("يجب أن يكون PIN هذه الشاشة مختلفاً عن رموز بقية الشاشات.");
  }
  requireCloudResult({ data, error });
}

export async function setAllShopFeatureLocks(
  shopId: string,
  enabled: boolean,
): Promise<BulkFeatureLockResult> {
  assertCloudOnline();
  await assertManagerForShop(shopId);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("set_all_shop_feature_locks", {
    p_shop_id: shopId,
    p_enabled: enabled,
  });
  const result = requireCloudResult({ data, error }) as Json;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("استجابة قفل الشاشات الجماعي غير صالحة.");
  }
  const record = result as Record<string, Json | undefined>;
  return {
    enabledCount: Number(record.enabled_count ?? 0),
    missingKeys: Array.isArray(record.missing_keys) ? record.missing_keys.filter((key): key is string => typeof key === "string") : [],
  };
}

export async function verifyShopFeatureLockPin(
  shopId: string,
  featureKey: FeatureLockKey,
  pin: string,
): Promise<boolean> {
  if (!isFeatureLockKey(featureKey) || !isValidFeaturePin(pin)) return false;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("verify_shop_feature_lock_pin", {
    p_shop_id: shopId,
    p_feature_key: featureKey,
    p_pin: pin,
  });
  return requireCloudResult({ data, error });
}
