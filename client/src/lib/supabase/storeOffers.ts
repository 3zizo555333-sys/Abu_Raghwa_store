import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database } from "./database.types";

export type CloudOfferOrder = Database["public"]["Tables"]["offer_orders"]["Row"];

type OfferRecord = {
  id: string;
  title: string;
  description?: string;
  offerData: Record<string, unknown>;
  startAt?: number;
  endAt?: number;
  status?: "draft" | "active" | "paused" | "expired";
};

function toIso(value?: number) {
  return Number.isFinite(value) && Number(value) > 0 ? new Date(Number(value)).toISOString() : null;
}

export async function saveStoreOffer(offer: OfferRecord): Promise<void> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext(true);
  const user = await getSupabaseClient().auth.getUser();
  const result = await getSupabaseClient().from("store_offers").upsert({
    id: offer.id,
    store_id: shopId,
    title: offer.title,
    public_description: offer.description || "",
    offer_data: JSON.parse(JSON.stringify(offer.offerData)),
    starts_at: toIso(offer.startAt),
    ends_at: toIso(offer.endAt),
    status: offer.status || "active",
    created_by: user.data.user?.id || null,
  }, { onConflict: "id" });
  requireCloudResult(result);
}

export async function mirrorPublicOfferOrder(input: { id: string; offerId: string; customerName: string; customerCode: string; customerPhone?: string | null; pointsCost?: number }): Promise<void> {
  assertCloudOnline();
  const supabase = getSupabaseClient();
  const offerResult = await supabase.from("store_offers").select("id,store_id,title").eq("id", input.offerId).maybeSingle();
  const offer = requireCloudResult(offerResult) as { id: string; store_id: string; title: string } | null;
  if (!offer) throw new Error("العرض غير متوفر سحابياً");
  const result = await supabase.from("offer_orders").upsert({
    id: input.id,
    store_id: offer.store_id,
    offer_id: offer.id,
    offer_title: offer.title,
    customer_name: input.customerName,
    customer_code: input.customerCode,
    customer_phone: input.customerPhone || null,
    points_cost: Math.max(0, Math.trunc(Number(input.pointsCost) || 0)),
    status: "pending",
  }, { onConflict: "id" });
  requireCloudResult(result);
}

export async function listStoreOfferOrders(): Promise<CloudOfferOrder[]> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext(true);
  const result = await getSupabaseClient().from("offer_orders").select("id,store_id,offer_id,offer_title,customer_name,customer_code,customer_phone,points_cost,status,created_at,updated_at").eq("store_id", shopId).order("created_at", { ascending: false }).limit(200);
  return (requireCloudResult(result) || []) as CloudOfferOrder[];
}

export async function deleteStoreOffer(id: string): Promise<void> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext(true);
  const result = await getSupabaseClient().from("store_offers").delete().eq("id", id).eq("store_id", shopId);
  requireCloudResult(result);
}

export async function updateStoreOfferOrderStatus(id: string, status: "approved" | "cancelled"): Promise<void> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext(true);
  const result = await getSupabaseClient().from("offer_orders").update({ status }).eq("id", id).eq("store_id", shopId);
  requireCloudResult(result);
}
