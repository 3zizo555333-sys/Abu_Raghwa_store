import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";

export async function loadUserQuickShortcuts(userId: string): Promise<string[]> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext(true);
  const result = await getSupabaseClient().from("user_quick_shortcuts").select("shortcut_paths").eq("user_id", userId).eq("store_id", shopId).maybeSingle();
  const row = requireCloudResult(result) as { shortcut_paths?: unknown } | null;
  return Array.isArray(row?.shortcut_paths) ? row.shortcut_paths.filter((path): path is string => typeof path === "string") : [];
}

export async function saveUserQuickShortcuts(userId: string, paths: string[]): Promise<void> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext(true);
  const uniquePaths = Array.from(new Set(paths));
  const result = await getSupabaseClient().from("user_quick_shortcuts").upsert({ user_id: userId, store_id: shopId, shortcut_paths: uniquePaths }, { onConflict: "user_id,store_id" });
  requireCloudResult(result);
}
