import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import { prepareCloudProductImage } from "./prepareProductImage";
import type { Database } from "./database.types";

export type LoyaltyMilestoneRow = Database["public"]["Tables"]["loyalty_milestones"]["Row"];
export type ReferralCampaignSettingsRow = Database["public"]["Tables"]["referral_campaign_settings"]["Row"];
export type PublicLoyaltyMilestone = { id: string; pointsRequired: number; rewardName: string; rewardImageUrl: string | null; isMystery: boolean; description: string | null };
export type PublicReferralCampaign = { title: string; messageTemplate: string; pointsPerFriend: number; isActive: boolean; updatedAt?: string };

async function managerContext() {
  const context = await getActiveShopContext(true);
  if (context.role !== "manager" && context.role !== "admin") throw new Error("إدارة محطات الولاء والإحالات متاحة للمدير أو المدير الإداري فقط.");
  return context;
}

export async function listLoyaltyExperienceSettings() {
  const { shopId } = await managerContext();
  const client = getSupabaseClient();
  const [milestones, referral] = await Promise.all([
    client.from("loyalty_milestones").select("*").eq("store_id", shopId).order("points_required").order("created_at").limit(500),
    client.from("referral_campaign_settings").select("*").eq("store_id", shopId).maybeSingle(),
  ]);
  return {
    milestones: requireCloudResult(milestones) as LoyaltyMilestoneRow[],
    referral: requireCloudResult(referral) as ReferralCampaignSettingsRow | null,
  };
}

export async function createLoyaltyMilestone(input: { pointsRequired: number; rewardName: string; description?: string; isMystery?: boolean; rewardImageUrl?: string | null }) {
  assertCloudOnline();
  const { shopId } = await managerContext();
  const points = Math.trunc(Number(input.pointsRequired));
  const name = input.rewardName.trim();
  if (!name || points <= 0) throw new Error("اكتب اسم الهدية وعدد نقاط صحيح.");
  return requireCloudResult(await getSupabaseClient().from("loyalty_milestones").insert({ store_id: shopId, points_required: points, reward_name: name, description: input.description?.trim() || null, is_mystery: Boolean(input.isMystery), reward_image_url: input.rewardImageUrl || null }).select("*").single()) as LoyaltyMilestoneRow;
}

export async function updateLoyaltyMilestone(id: string, input: { pointsRequired: number; rewardName: string; description?: string; isMystery?: boolean; rewardImageUrl?: string | null }) {
  assertCloudOnline();
  const { shopId } = await managerContext();
  return requireCloudResult(await getSupabaseClient().from("loyalty_milestones").update({ points_required: Math.trunc(input.pointsRequired), reward_name: input.rewardName.trim(), description: input.description?.trim() || null, is_mystery: Boolean(input.isMystery), reward_image_url: input.rewardImageUrl || null }).eq("id", id).eq("store_id", shopId).select("*").single()) as LoyaltyMilestoneRow;
}

export async function deleteLoyaltyMilestone(id: string) {
  assertCloudOnline();
  const { shopId } = await managerContext();
  return requireCloudResult(await getSupabaseClient().from("loyalty_milestones").delete().eq("id", id).eq("store_id", shopId).select("id").single());
}

export async function saveReferralCampaign(input: { title: string; messageTemplate: string; pointsPerFriend: number; isActive: boolean }) {
  assertCloudOnline();
  const { shopId } = await managerContext();
  const payload = { store_id: shopId, title: input.title.trim(), message_template: input.messageTemplate.trim(), points_per_friend: Math.max(0, Math.trunc(input.pointsPerFriend)), is_active: input.isActive, updated_at: new Date().toISOString() };
  return requireCloudResult(await getSupabaseClient().from("referral_campaign_settings").upsert(payload, { onConflict: "store_id" }).select("*").single()) as ReferralCampaignSettingsRow;
}

export async function uploadLoyaltyMilestoneImage(file: File, ownerId: string) {
  assertCloudOnline();
  const { shopId } = await managerContext();
  const image = await prepareCloudProductImage(file, { allowJpegFallback: true });
  if (image.size <= 0 || image.size > 300_000) throw new Error("يجب أن يقل حجم الصورة بعد الضغط عن 300KB.");
  const extension = image.type === "image/webp" ? "webp" : "jpg";
  const path = `${shopId}/milestones/${ownerId || crypto.randomUUID()}/${crypto.randomUUID()}.${extension}`;
  const bucket = getSupabaseClient().storage.from("loyalty-images");
  const uploaded = await bucket.upload(path, image, { contentType: image.type, cacheControl: "3600", upsert: false });
  if (uploaded.error) throw new Error(uploaded.error.message);
  return bucket.getPublicUrl(path).data.publicUrl;
}

export async function getPublicLoyaltyExperience(identifier: { customerCode?: string; phone?: string }) {
  const result = await getSupabaseClient().rpc("get_public_loyalty_experience", { p_customer_code: identifier.customerCode?.trim() || null, p_phone: identifier.phone?.trim() || null });
  const data = requireCloudResult(result) as { milestones?: PublicLoyaltyMilestone[]; referral?: { title?: string; message_template?: string; points_per_friend?: number; is_active?: boolean; updated_at?: string } | null };
  return {
    milestones: Array.isArray(data.milestones) ? data.milestones : [],
    referral: data.referral ? { title: data.referral.title || "شارك التوفير مع حبايبك واكسب نقاط مجانية!", messageTemplate: data.referral.message_template || "ادعُ أصدقاءك للتسجيل واكسب نقاطًا مجانية!", pointsPerFriend: Number(data.referral.points_per_friend) || 0, isActive: data.referral.is_active !== false, updatedAt: data.referral.updated_at } : null,
  };
}

export function subscribeToLoyaltyExperience(shopId: string, onChange: () => void) {
  const channel = getSupabaseClient().channel(`loyalty-experience:${shopId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "loyalty_milestones", filter: `store_id=eq.${shopId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "referral_campaign_settings", filter: `store_id=eq.${shopId}` }, onChange);
  void channel.subscribe();
  return () => { void getSupabaseClient().removeChannel(channel); };
}
