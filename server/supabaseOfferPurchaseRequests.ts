import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applySupabaseLoyaltyEvent, ensureSupabaseLoyaltyProfile, getSupabaseLoyaltyProfile } from "./supabaseLoyalty";

type RequestStatus = "pending" | "approved" | "cancelled";
type OfferPurchaseRequest = {
  id: string;
  offerId: string;
  offerTitle: string;
  offerSnapshot: string;
  offerPoints: number;
  customerName: string;
  customerPhone: string | null;
  deliveryAddress: string | null;
  customerNote: string | null;
  customerCode: string;
  status: RequestStatus;
  loyaltyPointsAwarded: number;
  loyaltyPointsBalanceAfterApproval: number;
  createdAt: Date;
  created: boolean;
};

let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("إعدادات تسجيل طلب العرض غير مكتملة؛ يلزم SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY على الخادم.");
  serviceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return serviceClient;
}

function fail(action: string, error: { message: string } | null): never | void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

function mapRequest(row: Record<string, any>, created = false, currentPoints = 0): OfferPurchaseRequest {
  const rawStatus = String(row.status || "pending");
  const status: RequestStatus = rawStatus === "confirmed" || rawStatus === "delivered" || rawStatus === "approved"
    ? "approved"
    : rawStatus === "cancelled" ? "cancelled" : "pending";
  const snapshot = row.offer_snapshot ?? {};
  return {
    id: String(row.id),
    offerId: String(row.offer_id || ""),
    offerTitle: String(row.offer_title || "عرض أبو رغوة"),
    offerSnapshot: typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot),
    offerPoints: Math.max(0, Math.trunc(Number(row.loyalty_points) || 0)),
    customerName: String(row.customer_name || ""),
    customerPhone: row.customer_phone == null ? null : String(row.customer_phone),
    deliveryAddress: row.delivery_address == null ? (row.address == null ? null : String(row.address)) : String(row.delivery_address),
    customerNote: row.note == null ? null : String(row.note),
    customerCode: String(row.customer_code || ""),
    status,
    loyaltyPointsAwarded: Math.max(0, Math.trunc(Number(row.loyalty_points_awarded) || 0)),
    loyaltyPointsBalanceAfterApproval: Math.max(0, Math.trunc(Number(currentPoints) || 0)) + Math.max(0, Math.trunc(Number(row.loyalty_points) || 0)),
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    created,
  };
}

function isWithinOfferWindow(value: unknown, now: number): boolean {
  if (!value) return true;
  const timestamp = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(timestamp) && timestamp <= now;
}

export async function createSupabaseOfferPurchaseRequest(input: { offerId: string; customerCode: string; customerNote?: string; deliveryAddress?: string }) {
  const client = getServiceClient();
  const offerResult = await client.from("store_offers").select("*").eq("id", input.offerId).eq("status", "active").is("deleted_at", null).maybeSingle();
  fail("تعذر التحقق من العرض في Supabase", offerResult.error);
  const offerRow = offerResult.data as Record<string, any> | null;
  if (!offerRow) throw new Error("هذا العرض غير موجود أو لم يُنشر بعد.");
  const now = Date.now();
  if (!isWithinOfferWindow(offerRow.starts_at, now)) throw new Error("لم يبدأ هذا العرض بعد.");
  if (offerRow.ends_at && Date.parse(String(offerRow.ends_at)) <= now) throw new Error("انتهت صلاحية هذا العرض.");

  const offerData = offerRow.offer_data && typeof offerRow.offer_data === "object" && !Array.isArray(offerRow.offer_data)
    ? offerRow.offer_data as Record<string, unknown>
    : {};
  const offerTitle = String(offerRow.title || offerData.title || "").trim();
  const offerPrice = Number(offerData.offerPrice ?? offerRow.offer_price ?? 0);
  const offerPoints = Math.max(0, Math.trunc(Number(offerData.loyaltyPoints ?? offerRow.points_reward ?? 0) || 0));
  if (!offerTitle || !Number.isFinite(offerPrice) || offerPrice < 0) throw new Error("بيانات اسم أو سعر العرض في Supabase غير صالحة.");

  const customerCode = input.customerCode.trim().toUpperCase();
  const profile = await getSupabaseLoyaltyProfile({ customerCode });
  if (!profile) throw new Error("كود الولاء غير مسجل؛ سجّل بطاقة نقاطك أولًا.");
  if (!profile.phone) throw new Error("بطاقة الولاء لا تحتوي على رقم هاتف صالح لربط طلب العرض.");

  const duplicateResult = await client.from("catalog_orders").select("*")
    .eq("order_type", "offer").eq("offer_id", input.offerId).eq("customer_code", profile.customerCode)
    .in("status", ["pending", "contacted"]).order("created_at", { ascending: false }).limit(1);
  fail("تعذر التحقق من طلب عرض سابق", duplicateResult.error);
  const duplicate = duplicateResult.data?.[0] as Record<string, any> | undefined;
  if (duplicate) return mapRequest(duplicate, false, Number(profile.points) || 0);

  const offerItems = Array.isArray(offerData.items) ? offerData.items.map((value: unknown) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      name: String(item.name || "").trim(),
      quantity: Math.max(1, Math.trunc(Number(item.quantity) || 1)),
      offerPrice: Math.max(0, Number(item.offerPrice) || 0),
    };
  }).filter((item: { name: string }) => item.name) : [];
  const offerSnapshot = {
    id: input.offerId,
    title: offerTitle,
    offerPrice,
    loyaltyPoints: offerPoints,
    items: offerItems,
    startsAt: offerRow.starts_at || null,
    endsAt: offerRow.ends_at || null,
  };
  const id = randomUUID();
  const deliveryAddress = input.deliveryAddress?.trim().slice(0, 1000) || null;
  const insertResult = await client.from("catalog_orders").insert({
    id,
    shop_id: offerRow.store_id,
    customer_name: profile.name,
    customer_phone: profile.phone,
    items: [{ productId: `offer:${input.offerId}`, name: `عرض: ${offerTitle}`, unit: "عرض", price: offerPrice, quantity: 1, loyaltyPoints: offerPoints }],
    total_amount: offerPrice,
    status: "pending",
    address: deliveryAddress,
    delivery_address: deliveryAddress,
    note: input.customerNote?.trim().slice(0, 1000) || null,
    order_type: "offer",
    offer_id: input.offerId,
    offer_title: offerTitle,
    customer_code: profile.customerCode,
    loyalty_points: offerPoints,
    loyalty_points_awarded: 0,
    offer_snapshot: offerSnapshot,
  }).select("*").single();
  if (insertResult.error?.code === "23505") {
    const concurrentDuplicate = await client.from("catalog_orders").select("*")
      .eq("order_type", "offer").eq("offer_id", input.offerId).eq("customer_code", profile.customerCode)
      .in("status", ["pending", "contacted"]).order("created_at", { ascending: false }).limit(1);
    fail("تعذر التحقق من طلب عرض متزامن", concurrentDuplicate.error);
    const existing = concurrentDuplicate.data?.[0] as Record<string, any> | undefined;
    if (existing) return mapRequest(existing, false, Number(profile.points) || 0);
  }
  fail("تعذر حفظ طلب العرض في جدول catalog_orders", insertResult.error);
  if (!insertResult.data) throw new Error("لم يُرجع Supabase رقم طلب العرض بعد الحفظ.");
  return mapRequest(insertResult.data as Record<string, any>, true, Number(profile.points) || 0);
}

export async function listSupabaseOfferPurchaseRequests(shopId: string) {
  const result = await getServiceClient().from("catalog_orders").select("*")
    .eq("shop_id", shopId).eq("order_type", "offer").order("created_at", { ascending: false }).limit(200);
  fail("تعذر تحميل طلبات العروض من Supabase", result.error);
  return (result.data || []).map((row: Record<string, any>) => mapRequest(row));
}

export async function approveSupabaseOfferPurchaseRequest(id: string, shopId: string) {
  const client = getServiceClient();
  const selectResult = await client.from("catalog_orders").select("*").eq("id", id).eq("shop_id", shopId).eq("order_type", "offer").maybeSingle();
  fail("تعذر قراءة طلب العرض من Supabase", selectResult.error);
  const request = selectResult.data as Record<string, any> | null;
  if (!request) throw new Error("طلب العرض غير موجود.");
  const current = mapRequest(request);
  if (current.status === "approved") return { success: true as const, alreadyApproved: true, awardedPoints: current.loyaltyPointsAwarded, customerCode: current.customerCode };
  if (current.status !== "pending" || (request.status !== "pending" && request.status !== "contacted")) throw new Error("لا يمكن اعتماد طلب عرض مرفوض أو ملغى.");

  const points = Math.max(0, Math.trunc(Number(request.loyalty_points) || 0));
  let awardedPoints = 0;
  if (!current.customerPhone) throw new Error("طلب العرض لا يحتوي على رقم هاتف صالح لربط نقاط الولاء.");
  let profile = await getSupabaseLoyaltyProfile({ customerCode: current.customerCode, phone: current.customerPhone });
  if (!profile) {
    await ensureSupabaseLoyaltyProfile({ phone: current.customerPhone, name: current.customerName, customerCode: current.customerCode || undefined });
    profile = await getSupabaseLoyaltyProfile({ phone: current.customerPhone });
  }
  if (!profile) throw new Error("تعذر إنشاء أو العثور على بطاقة ولاء العميل.");
  if (points > 0) {
    const event = await applySupabaseLoyaltyEvent({
      phone: profile.phone,
      name: profile.name,
      pointsDelta: points,
      source: "offer",
      sourceId: current.id,
      idempotencyKey: `offer-purchase:${current.id}:earned`,
      description: `${points} نقطة بعد اعتماد شراء العرض: ${current.offerTitle}`,
    });
    awardedPoints = Math.max(0, Number(event.points_delta) || 0);
  }
  const updateResult = await client.from("catalog_orders").update({ status: "confirmed", loyalty_points_awarded: awardedPoints, updated_at: new Date().toISOString() })
    .eq("id", id).eq("shop_id", shopId).eq("order_type", "offer").in("status", ["pending", "contacted"]).select("id").maybeSingle();
  fail("تعذر تحديث حالة طلب العرض في Supabase", updateResult.error);
  if (!updateResult.data) {
    const latest = await client.from("catalog_orders").select("status,loyalty_points_awarded").eq("id", id).eq("shop_id", shopId).maybeSingle();
    fail("تعذر التحقق من حالة طلب العرض", latest.error);
    if (latest.data?.status !== "confirmed" && latest.data?.status !== "delivered") throw new Error("تغيرت حالة الطلب قبل إتمام الاعتماد؛ حدّث القائمة وحاول مجددًا.");
    const finalProfile = await getSupabaseLoyaltyProfile({ phone: current.customerPhone });
    return { success: true as const, alreadyApproved: true, awardedPoints: Math.max(0, Number(latest.data.loyalty_points_awarded) || awardedPoints), customerCode: current.customerCode, loyaltyPointsBalance: Number(finalProfile?.points) || 0 };
  }
  const finalProfile = await getSupabaseLoyaltyProfile({ phone: current.customerPhone });
  return { success: true as const, alreadyApproved: false, awardedPoints, customerCode: current.customerCode, loyaltyPointsBalance: Number(finalProfile?.points) || 0 };
}

export async function cancelSupabaseOfferPurchaseRequest(id: string, shopId: string) {
  const client = getServiceClient();
  const result = await client.from("catalog_orders").update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id).eq("shop_id", shopId).eq("order_type", "offer").in("status", ["pending", "contacted"]).select("id").maybeSingle();
  fail("تعذر رفض طلب العرض في Supabase", result.error);
  if (!result.data) {
    const existing = await client.from("catalog_orders").select("status").eq("id", id).eq("shop_id", shopId).eq("order_type", "offer").maybeSingle();
    fail("تعذر التحقق من طلب العرض", existing.error);
    if (!existing.data) throw new Error("طلب العرض غير موجود.");
    if (existing.data.status === "confirmed" || existing.data.status === "delivered") throw new Error("تمت الموافقة على الطلب وإضافة النقاط بالفعل؛ لا يمكن رفضه الآن.");
    if (existing.data.status === "pending" || existing.data.status === "contacted") throw new Error("تغيرت حالة الطلب؛ حدّث القائمة وحاول مرة أخرى.");
  }
  return { success: true as const, status: "cancelled" as const };
}

export async function getSupabaseOfferPurchaseStatus(input: { id: string; customerCode: string }) {
  const result = await getServiceClient().from("catalog_orders")
    .select("id,offer_title,status,loyalty_points,loyalty_points_awarded,customer_phone,created_at")
    .eq("id", input.id).eq("order_type", "offer").eq("customer_code", input.customerCode.trim().toUpperCase()).maybeSingle();
  fail("تعذر قراءة حالة طلب العرض من Supabase", result.error);
  if (!result.data) return null;
  const status = result.data.status === "confirmed" || result.data.status === "delivered"
    ? "approved"
    : result.data.status === "contacted" ? "pending" : result.data.status;
  const profile = status === "approved" && result.data.customer_phone
    ? await getSupabaseLoyaltyProfile({ phone: String(result.data.customer_phone) })
    : null;
  return {
    id: String(result.data.id),
    offerTitle: String(result.data.offer_title || "عرض أبو رغوة"),
    status,
    loyaltyPointsAwarded: Math.max(0, Math.trunc(Number(result.data.loyalty_points_awarded) || 0)),
    earnedPoints: Math.max(0, Math.trunc(Number(result.data.loyalty_points) || 0)),
    loyaltyPointsBalance: Math.max(0, Number(profile?.points) || 0),
    createdAt: result.data.created_at ? new Date(result.data.created_at) : new Date(),
  };
}
