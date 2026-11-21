import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type PurchaseRaffleTicketInput = {
  raffleId: string;
  customerName: string;
  customerPhone: string;
  invoiceCode: string;
};

type PurchaseRaffleTicket = { ticket_id: string; ticket_number: string };

let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceKey) {
    throw new Error("إعدادات تسجيل السحب غير مكتملة؛ يلزم SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY");
  }
  serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return serviceClient;
}

const errorMessages: Record<string, string> = {
  INVALID_CUSTOMER_OR_INVOICE: "أكمل الاسم والهاتف وكود فاتورة أو طلب صالح.",
  INVOICE_NOT_FOUND: "لم نعثر على فاتورة أو طلب بهذا الكود.",
  INVOICE_CODE_AMBIGUOUS: "الكود يطابق أكثر من فاتورة أو طلب؛ استخدم الكود الكامل.",
  INVOICE_ALREADY_USED: "تم استخدام هذه الفاتورة أو الطلب في هذا السحب من قبل.",
  INVOICE_TOTAL_BELOW_MINIMUM: "قيمة الفاتورة أقل من الحد الأدنى لهذا السحب.",
  INVOICE_TOTAL_BELOW_RULE: "قيمة الفاتورة لا تحقق الحد الأدنى المحدد في شروط السحب.",
  RAFFLE_NOT_ACTIVE: "انتهى التسجيل في هذا السحب.",
  REQUIRED_PRODUCT_NOT_IN_INVOICE: "الفاتورة لا تحتوي المنتجات المطلوبة لهذا السحب.",
  REQUIRED_CATEGORY_NOT_IN_INVOICE: "الفاتورة لا تحتوي المنتجات المطلوبة من الأقسام المحددة.",
};

export async function registerPurchaseRaffleTicket(input: PurchaseRaffleTicketInput): Promise<PurchaseRaffleTicket> {
  const { data, error } = await getServiceClient().rpc("register_purchase_raffle_ticket", {
    p_raffle_id: input.raffleId,
    p_customer_name: input.customerName.trim(),
    p_customer_phone: input.customerPhone.trim(),
    p_invoice_code: input.invoiceCode.trim(),
  });
  if (error) {
    const message = error.message || "";
    const known = Object.entries(errorMessages).find(([code]) => message.includes(code));
    if (known) throw new Error(known[1]);
    console.error("[CommunityDraws] Raffle registration failed", { code: error.code, message });
    throw new Error("تعذر التحقق من الفاتورة أو الطلب الآن؛ حاول مرة أخرى.");
  }
  const row = (data as PurchaseRaffleTicket[] | null)?.[0];
  if (!row?.ticket_id || !row.ticket_number) throw new Error("لم يؤكد النظام إصدار التذكرة؛ حاول مرة أخرى.");
  return row;
}
