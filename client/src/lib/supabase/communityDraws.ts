import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";

export type DrawStatus = "active" | "drawing" | "completed";
export type DrawEventType = "purchase" | "trivia";
export type PurchaseRaffle = {
  id: string; shop_id: string; title: string; description: string; banner_image_url: string | null;
  prize_name: string; prize_image_url: string | null; prize_description: string;
  required_products_rules: Record<string, unknown>; min_invoice_total: number | null;
  ends_at: string; status: DrawStatus; created_at: string; updated_at: string;
};
export type TriviaContest = {
  id: string; shop_id: string; title: string; question: string; question_image_url: string | null; options: string[];
  prize_title: string; prize_image_url: string | null; banner_image_url: string | null; ends_at: string; status: DrawStatus; created_at: string; updated_at: string;
};
export type LiveDrawStage = {
  id: string; shop_id: string; event_type: DrawEventType; event_id: string; title: string; prize_title: string;
  ends_at: string; status: DrawStatus; winner_name: string | null; winner_phone_masked: string | null;
  winner_code: string | null; updated_at: string;
};
export type RaffleTicket = { id: string; raffle_id: string; customer_name: string; customer_phone: string; invoice_code: string; ticket_number: string; created_at: string };
export type TriviaEntry = { id: string; contest_id: string; customer_name: string; customer_phone: string; selected_option: number; is_correct: boolean; entry_code: string; created_at: string };
const client = () => getSupabaseClient() as any;

export async function listPublicCommunityEvents(): Promise<{ raffles: PurchaseRaffle[]; contests: TriviaContest[]; stages: LiveDrawStage[] }> {
  assertCloudOnline();
  const db = client();
  const [raffles, contests, stages] = await Promise.all([
    db.from("public_purchase_raffles").select("*").order("created_at", { ascending: false }).limit(20),
    db.from("public_trivia_contests").select("*").order("created_at", { ascending: false }).limit(20),
    db.from("community_draw_live_stage").select("*").order("updated_at", { ascending: false }).limit(20),
  ]);
  return {
    raffles: (requireCloudResult(raffles) || []) as PurchaseRaffle[],
    contests: (requireCloudResult(contests) || []) as TriviaContest[],
    stages: (requireCloudResult(stages) || []) as LiveDrawStage[],
  };
}

export async function registerPurchaseRaffle(input: { raffleId: string; customerName: string; customerPhone: string; invoiceCode: string }): Promise<{ ticket_id: string; ticket_number: string }> {
  assertCloudOnline();
  const result = await client().rpc("register_purchase_raffle_ticket", { p_raffle_id: input.raffleId, p_customer_name: input.customerName.trim(), p_customer_phone: input.customerPhone, p_invoice_code: input.invoiceCode.trim() });
  const row = (requireCloudResult(result) as any[])?.[0];
  if (!row) throw new Error("لم يؤكد النظام إصدار التذكرة؛ حاول مرة أخرى.");
  return row;
}
export async function submitTriviaEntry(input: { contestId: string; customerName: string; customerPhone: string; selectedOption: number }): Promise<{ entry_id: string; entry_code: string; is_correct: boolean }> {
  assertCloudOnline();
  const result = await client().rpc("submit_trivia_entry", { p_contest_id: input.contestId, p_customer_name: input.customerName.trim(), p_customer_phone: input.customerPhone, p_selected_option: input.selectedOption });
  const row = (requireCloudResult(result) as any[])?.[0];
  if (!row) throw new Error("لم يؤكد النظام تسجيل المشاركة؛ حاول مرة أخرى.");
  return row;
}

function assertDrawManager(role: string) {
  if (!["manager", "admin", "supervisor"].includes(role)) throw new Error("هذه العملية متاحة للمدير أو المشرف فقط.");
}
export async function listManagedCommunityEvents() {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext(true);
  assertDrawManager(role);
  const db = client();
  const [raffles, tickets, contests, entries, stages] = await Promise.all([
    db.from("purchase_raffles").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(100),
    db.from("raffle_tickets").select("id,raffle_id,customer_name,customer_phone,invoice_code,ticket_number,created_at").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(1000),
    db.from("trivia_contests").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(100),
    db.from("trivia_entries").select("id,contest_id,customer_name,customer_phone,selected_option,is_correct,entry_code,created_at").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(1000),
    db.from("community_draw_live_stage").select("*").eq("shop_id", shopId).order("updated_at", { ascending: false }).limit(100),
  ]);
  return {
    shopId,
    raffles: (requireCloudResult(raffles) || []) as PurchaseRaffle[],
    tickets: (requireCloudResult(tickets) || []) as RaffleTicket[],
    contests: (requireCloudResult(contests) || []) as Array<TriviaContest & { correct_option_index: number }>,
    entries: (requireCloudResult(entries) || []) as TriviaEntry[],
    stages: (requireCloudResult(stages) || []) as LiveDrawStage[],
  };
}
export async function savePurchaseRaffle(input: Partial<PurchaseRaffle> & { title: string; prize_name: string; ends_at: string }) {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext(true); assertDrawManager(role);
  const title = String(input.title || "").trim();
  const prizeName = String(input.prize_name || "").trim();
  if (!title || !prizeName) throw new Error("اسم السحب واسم الجائزة مطلوبان.");
  const legacyInput = input as Partial<PurchaseRaffle> & { rules?: Record<string, unknown>; min_purchase_amount?: number | string };
  const sourceRules = input.required_products_rules || legacyInput.rules || {};
  const minimumRaw = input.min_invoice_total ?? legacyInput.min_purchase_amount ?? sourceRules.min_invoice_total ?? sourceRules.minAmount;
  const minimumNumber = minimumRaw == null || minimumRaw === "" ? null : Number(minimumRaw);
  const minimum = minimumNumber == null || !Number.isFinite(minimumNumber) ? null : minimumNumber;
  const extraRaw = sourceRules.extra_ticket_price ?? sourceRules.ticketPerAmount;
  const targetRaw = sourceRules.target_participants ?? sourceRules.minParticipants;
  const extraTicketPrice = Number.isFinite(Number(extraRaw)) ? Number(extraRaw) : 50;
  const targetParticipants = Number.isFinite(Number(targetRaw)) ? Number(targetRaw) : 10;
  const rules = {
    ...sourceRules,
    minAmount: minimum,
    min_invoice_total: minimum,
    ticketPerAmount: extraTicketPrice,
    extra_ticket_price: extraTicketPrice,
    minParticipants: targetParticipants,
    target_participants: targetParticipants,
  };
  const payload = { shop_id: shopId, title, description: input.description || "", banner_image_url: input.banner_image_url || null, prize_name: prizeName, prize_image_url: input.prize_image_url || null, prize_description: input.prize_description || "", required_products_rules: rules, min_invoice_total: minimum, ends_at: input.ends_at, status: input.status || "active" };
  const query = input.id ? client().from("purchase_raffles").update(payload).eq("id", input.id).eq("shop_id", shopId) : client().from("purchase_raffles").insert(payload);
  return requireCloudResult(await query.select("*").single()) as PurchaseRaffle;
}

export async function deletePurchaseRaffle(id: string): Promise<void> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext(true); assertDrawManager(role);
  const raffleId = String(id || "").trim();
  if (!raffleId) throw new Error("معرف السحب غير صالح.");
  const deleted = requireCloudResult(await client().from("purchase_raffles").delete().eq("id", raffleId).eq("shop_id", shopId).select("id")) as Array<{ id: string }>;
  if (!deleted?.length) throw new Error("لم يتم العثور على السحب المطلوب حذفه.");
}

export async function saveTriviaContest(input: Partial<TriviaContest> & { title: string; question: string; options: string[]; correct_option_index: number; prize_title: string; ends_at: string }) {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext(true); assertDrawManager(role);
  const options = (Array.isArray(input.options) ? input.options : []).map(value => String(value || "").trim()).filter(Boolean);
  if (options.length < 2 || input.correct_option_index < 0 || input.correct_option_index >= options.length) throw new Error("أدخل خيارين صحيحين على الأقل وحدد الإجابة الصحيحة.");
  const title = String(input.title || "").trim();
  const question = String(input.question || "").trim();
  const prizeTitle = String(input.prize_title || "").trim();
  if (!title || !question || !prizeTitle) throw new Error("عنوان المسابقة والسؤال واسم الجائزة مطلوبة.");
  const payload = { shop_id: shopId, title, question, question_image_url: input.question_image_url || null, options, correct_option_index: input.correct_option_index, prize_title: prizeTitle, prize_image_url: input.prize_image_url || null, banner_image_url: input.banner_image_url || null, ends_at: input.ends_at, status: input.status || "active" };
  const query = input.id ? client().from("trivia_contests").update(payload).eq("id", input.id).eq("shop_id", shopId) : client().from("trivia_contests").insert(payload);
  return requireCloudResult(await query.select("*").single()) as TriviaContest;
}

export async function deleteTriviaContest(id: string): Promise<void> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext(true); assertDrawManager(role);
  const contestId = String(id || "").trim();
  if (!contestId) throw new Error("معرف المسابقة غير صالح.");
  const deleted = requireCloudResult(await client().from("trivia_contests").delete().eq("id", contestId).eq("shop_id", shopId).select("id")) as Array<{ id: string }>;
  if (!deleted?.length) throw new Error("لم يتم العثور على المسابقة المطلوبة لحذفها.");
}
export async function startCommunityDraw(eventType: DrawEventType, eventId: string): Promise<LiveDrawStage> {
  assertCloudOnline();
  const { role } = await getActiveShopContext(true); assertDrawManager(role);
  return requireCloudResult(await client().rpc("start_community_draw", { p_event_type: eventType, p_event_id: eventId })) as LiveDrawStage;
}
export async function completeCommunityDraw(eventType: DrawEventType, eventId: string): Promise<LiveDrawStage> {
  assertCloudOnline();
  const { role } = await getActiveShopContext(true); assertDrawManager(role);
  return requireCloudResult(await client().rpc("complete_community_draw", { p_event_type: eventType, p_event_id: eventId })) as LiveDrawStage;
}
export function subscribeCommunityDraws(onChange: () => void) {
  const channel = client().channel("community-draw-live-stage").on("postgres_changes", { event: "*", schema: "public", table: "community_draw_live_stage" }, onChange).subscribe();
  return () => { void client().removeChannel(channel); };
}
export function subscribeManagedCommunityChanges(shopId: string, onChange: () => void) {
  const channel = client().channel(`community-admin-${shopId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "purchase_raffles", filter: `shop_id=eq.${shopId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "raffle_tickets", filter: `shop_id=eq.${shopId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "trivia_contests", filter: `shop_id=eq.${shopId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "trivia_entries", filter: `shop_id=eq.${shopId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "community_draw_live_stage", filter: `shop_id=eq.${shopId}` }, onChange).subscribe();
  return () => { void client().removeChannel(channel); };
}
