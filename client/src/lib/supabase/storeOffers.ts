import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database, Json } from "./database.types";
import { writePersistentCloudCache } from "@/lib/persistentCloudCache";

export type CloudOfferOrder = Database["public"]["Tables"]["offer_orders"]["Row"];
export type CloudStoreOffer = Database["public"]["Tables"]["store_offers"]["Row"];

type OfferRecord = {
  id: string;
  title: string;
  bannerTitle?: string;
  description?: string;
  strategy?: string;
  originalPrice?: number;
  offerPrice?: number;
  startDate?: string;
  pointsReward?: number;
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
  const title = String(offer.title || "").trim();
  if (!title) throw new Error("لا يمكن حفظ عرض بلا عنوان.");
  const originalPrice = typeof offer.originalPrice === "number" && Number.isFinite(offer.originalPrice) ? offer.originalPrice : Number((offer.offerData.originalTotalRetail as number | undefined) || 0);
  const offerPrice = typeof offer.offerPrice === "number" && Number.isFinite(offer.offerPrice) ? offer.offerPrice : Number((offer.offerData.offerPrice as number | undefined) || 0);
  const offerData = JSON.parse(JSON.stringify(offer.offerData || {})) as Json;
  const payload = {
    id: offer.id,
    store_id: shopId,
    title,
    banner_title: offer.bannerTitle || "",
    description: offer.description || "",
    strategy: offer.strategy || String((offer.offerData.strategyName as string | undefined) || ""),
    original_price: Number.isFinite(originalPrice) ? originalPrice : 0,
    offer_price: Number.isFinite(offerPrice) ? offerPrice : 0,
    start_date: offer.startDate || null,
    expires_at: toIso(offer.endAt),
    points_reward: Math.max(0, Math.trunc(Number(offer.pointsReward ?? offer.offerData.loyaltyPoints ?? 0) || 0)),
    public_description: offer.description || "",
    offer_data: offerData,
    starts_at: toIso(offer.startAt),
    ends_at: toIso(offer.endAt),
    status: offer.status || "active",
    created_by: user.data.user?.id || null,
  };
  const result = await getSupabaseClient().from("store_offers").upsert(payload, { onConflict: "id", ignoreDuplicates: false }).select("id,store_id,title,status,updated_at").single();
  requireCloudResult(result);
}

export async function listActiveStoreOffers(): Promise<CloudStoreOffer[]> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const result = await getSupabaseClient().from("store_offers").select("id,store_id,title,banner_title,public_description,offer_data,starts_at,ends_at,status,created_by,created_at,updated_at,deleted_at").eq("store_id", shopId).eq("status", "active").is("deleted_at", null).order("created_at", { ascending: false }).limit(50);
  const offers = (requireCloudResult(result) || []) as CloudStoreOffer[];
  await writePersistentCloudCache("public-store-offers", offers);
  return offers;
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
