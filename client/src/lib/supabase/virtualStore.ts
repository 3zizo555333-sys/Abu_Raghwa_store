import { getSupabaseClient, assertCloudOnline, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";

export type VirtualStoreNode = {
  id: string;
  kind: "shelf" | "barrel" | "sack";
  x: number;
  z: number;
  rotation: number;
  color?: string;
  productIds: string[];
  copies?: number;
};

export type VirtualStoreLayout = { version: 1; nodes: VirtualStoreNode[] };
export type VirtualStoreStock = Record<string, number>;

export async function loadVirtualStoreLayout(shopId: string): Promise<VirtualStoreLayout | null> {
  const client = getSupabaseClient() as any;
  const { data, error } = await client.from("virtual_store_layouts").select("layout").eq("shop_id", shopId).maybeSingle();
  if (error) throw new Error(error.message || "تعذر تحميل ترتيب المحل");
  const layout = data?.layout;
  if (!layout || layout.version !== 1 || !Array.isArray(layout.nodes)) return null;
  const nodes = layout.nodes.filter((node: any) => node && ["shelf", "barrel", "sack"].includes(node.kind) && typeof node.id === "string")
    .map((node: any) => ({ id: node.id.slice(0, 80), kind: node.kind, x: Math.max(-4.4, Math.min(4.4, Number(node.x) || 0)), z: Math.max(-9, Math.min(2, Number(node.z) || 0)), rotation: Number(node.rotation) || 0, color: typeof node.color === "string" ? node.color.slice(0, 20) : undefined, productIds: Array.isArray(node.productIds) ? node.productIds.filter((id: unknown) => typeof id === "string").slice(0, 30) : [], copies: Math.max(1, Math.min(20, Number(node.copies) || 6)) }));
  return { version: 1, nodes };
}

export async function saveVirtualStoreLayout(shopId: string, layout: VirtualStoreLayout): Promise<void> {
  assertCloudOnline();
  const context = await getActiveShopContext();
  if (context.shopId !== shopId || !["manager", "admin", "supervisor"].includes(context.role)) throw new Error("الحفظ متاح لمدير أو مشرف المحل فقط.");
  if (layout.nodes.length > 80) throw new Error("لا يمكن حفظ أكثر من 80 قطعة في تخطيط المحل.");
  const client = getSupabaseClient() as any;
  const result = await client.from("virtual_store_layouts").upsert({ shop_id: shopId, layout, updated_by: context.userId, updated_at: new Date().toISOString() }, { onConflict: "shop_id" }).select("shop_id").single();
  requireCloudResult(result);
}

export async function loadVirtualStoreStock(shopId: string): Promise<VirtualStoreStock> {
  const client = getSupabaseClient() as any;
  const result = await client.rpc("get_public_catalog_stock", { p_shop_id: shopId });
  if (result.error) throw new Error(result.error.message || "تعذر تحديث أرصدة العرض");
  const rows = Array.isArray(result.data) ? result.data : [];
  return Object.fromEntries(rows.filter((row: any) => typeof row?.product_id === "string").map((row: any) => [row.product_id, Math.max(0, Number(row.quantity) || 0)]));
}

export async function canManageVirtualStore(shopId: string): Promise<boolean> {
  try {
    const context = await getActiveShopContext();
    return context.shopId === shopId && ["manager", "admin", "supervisor"].includes(context.role);
  } catch {
    return false;
  }
}
