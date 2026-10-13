import { getActiveShopContext } from "./products";
import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import type { Database } from "./database.types";

export const FEATURE_LOCKS = [
  { key: "expenses", title: "إدارة المصاريف", description: "المصروفات والإيصالات." },
  { key: "settings", title: "الإعدادات", description: "إعدادات المتجر الحساسة." },
  { key: "employees", title: "إدارة الموظفين", description: "بيانات الموظفين وأدوارهم." },
  { key: "materials", title: "الخامات وتكاليف التركيبات", description: "الخامات وتكلفة الوصفات والإنتاج." },
  { key: "suppliers", title: "الآجل والموردين", description: "حسابات الموردين والعملاء وحركات الآجل." },
  { key: "backup", title: "النسخ الاحتياطي وتصدير البيانات", description: "تصدير نسخ بيانات المتجر." },
  { key: "financial_reports", title: "التقارير المالية والأرباح", description: "تقارير الإيرادات والتكاليف والأرباح." },
] as const;

export type FeatureLockKey = (typeof FEATURE_LOCKS)[number]["key"];
export type FeaturePinScope = "shared" | FeatureLockKey;
export type FeatureLockRow = Database["public"]["Tables"]["shop_feature_locks"]["Row"];

const featureLockKeySet = new Set<string>(FEATURE_LOCKS.map(feature => feature.key));

export function isFeatureLockKey(value: string): value is FeatureLockKey {
  return featureLockKeySet.has(value);
}

export function isValidFeaturePin(value: string): boolean {
  return /^(?:[0-9]{4}|[0-9]{6})$/.test(value);
}

export async function listShopFeatureLocks(shopId: string): Promise<FeatureLockRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("shop_feature_locks")
    .select("shop_id, feature_key, enabled, pin_scope, pin_configured, shared_pin_configured, updated_by, created_at, updated_at")
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
  pinScope: "shared" | "custom",
): Promise<FeatureLockRow> {
  assertCloudOnline();
  await assertManagerForShop(shopId);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("set_shop_feature_lock", {
    p_shop_id: shopId,
    p_feature_key: featureKey,
    p_enabled: enabled,
    p_pin_scope: pinScope,
  });
  return requireCloudResult({ data, error });
}

export async function setShopFeatureLockPin(
  shopId: string,
  pinScope: FeaturePinScope,
  pin: string,
): Promise<void> {
  if (!isValidFeaturePin(pin)) throw new Error("رمز القفل يجب أن يتكون من 4 أو 6 أرقام.");
  assertCloudOnline();
  await assertManagerForShop(shopId);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("set_shop_feature_lock_pin", {
    p_shop_id: shopId,
    p_pin_scope: pinScope,
    p_pin: pin,
  });
  requireCloudResult({ data, error });
}

export async function verifyShopFeatureLockPin(
  shopId: string,
  featureKey: FeatureLockKey,
  pin: string,
): Promise<boolean> {
  if (!isValidFeaturePin(pin)) return false;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("verify_shop_feature_lock_pin", {
    p_shop_id: shopId,
    p_feature_key: featureKey,
    p_pin: pin,
  });
  return requireCloudResult({ data, error });
}
