type OrderLine = {
  name?: unknown;
  quantity?: unknown;
  price?: unknown;
  offerPrice?: unknown;
};

type TelegramPayload = {
  text: string;
  url: string;
};

type CatalogNotification = {
  id: string;
  customerName: string;
  customerPhone: string;
  address?: string;
  note?: string;
  itemsJson: string;
  totalAmount: number;
  couponCode?: string;
  fulfillmentMethod?: "pickup" | "delivery";
};

type OfferNotification = {
  id: string;
  offerTitle: string;
  offerSnapshot: string;
  customerName: string;
  customerPhone?: string | null;
  customerNote?: string | null;
  createdAt?: Date | string;
};

const esc = (value: unknown) =>
  String(value ?? "—").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);

const money = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2).replace(/\.00$/, "") : "0";
};

function getAppUrl() {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return "https://aburaghwastore.vercel.app";
}

function makeKeyboard(url: string) {
  return {
    inline_keyboard: [[{ text: "فتح الطلب في لوحة التحكم", url }]],
  };
}

function parseItems(raw: string): OrderLine[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as OrderLine[] : [];
  } catch {
    return [];
  }
}

function catalogMessage(order: CatalogNotification, appUrl: string): TelegramPayload {
  const items = parseItems(order.itemsJson);
  const subtotal = items.reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    const price = Math.max(0, Number(item.price) || 0);
    return sum + quantity * price;
  }, 0);
  const total = Math.max(0, Number(order.totalAmount) || 0);
  const discount = Math.max(0, subtotal - total);
  const lines = items.length
    ? items.map(item => `• ${esc(item.name || "صنف")} × ${Math.max(1, Number(item.quantity) || 1)} | ${money(item.price)} ج.م`).join("\n")
    : "• تفاصيل الأصناف غير متاحة";
  const address = [order.address, order.note].filter(Boolean).join(" — ") || "لم يُسجل عنوان أو ملاحظات";
  const url = `${appUrl}/catalog-manager?orderId=${encodeURIComponent(order.id)}`;
  const text = [
    "🛒 <b>إشعار طلب جديد - تطبيق أبو رغوة</b>",
    "━━━━━━━━━━━━━━━━━━",
    "🔹 <b>نوع الطلب:</b> طلب كتالوج",
    `🔹 <b>رقم الطلب:</b> #${esc(order.id)}`,
    `🔹 <b>التوقيت:</b> ${esc(new Date().toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }))}`,
    "",
    "👤 <b>بيانات العميل:</b>",
    `- الاسم: ${esc(order.customerName)}`,
    `- الهاتف: ${esc(order.customerPhone)}`,
    `- العنوان / ملاحظات التوصيل: ${esc(address)}`,
    "",
    "📦 <b>تفاصيل المنتجات:</b>",
    lines,
    "",
    "💰 <b>الحساب الإجمالي:</b>",
    `- الإجمالي الفرعي: ${money(subtotal)} ج.م`,
    `- الخصم${order.couponCode ? ` (${esc(order.couponCode)})` : ""}: ${money(discount)} ج.م`,
    `- الإجمالي النهائي المستحق: <b>${money(total)} ج.م</b>`,
    `- طريقة الدفع: تُحدد عند التواصل مع العميل`,
    `- طريقة الاستلام: ${order.fulfillmentMethod === "delivery" ? "توصيل" : "استلام من المحل"}`,
    "━━━━━━━━━━━━━━━━━━",
    "🔔 يرجى من مسؤول التجهيز مراجعة الطلب والبدء في التحضير.",
  ].join("\n");
  return { text, url };
}

function offerMessage(order: OfferNotification, appUrl: string): TelegramPayload {
  let snapshot: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(order.offerSnapshot);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) snapshot = parsed as Record<string, unknown>;
  } catch { /* malformed historical snapshot */ }
  const items = Array.isArray(snapshot.items) ? snapshot.items as OrderLine[] : [];
  const total = Math.max(0, Number(snapshot.offerPrice) || 0);
  const subtotal = Math.max(total, Number(snapshot.originalTotalRetail) || total);
  const discount = Math.max(0, subtotal - total);
  const lines = items.length
    ? items.map(item => `• ${esc(item.name || order.offerTitle)} × ${Math.max(1, Number(item.quantity) || 1)} | ${money(item.offerPrice ?? item.price)} ج.م`).join("\n")
    : `• ${esc(order.offerTitle)} × 1 | ${money(total)} ج.م`;
  const when = order.createdAt ? new Date(order.createdAt) : new Date();
  const safeWhen = Number.isFinite(when.getTime()) ? when.toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }) : "غير متاح";
  const url = `${appUrl}/smart-offers?purchaseId=${encodeURIComponent(order.id)}`;
  const text = [
    "🛒 <b>إشعار طلب جديد - تطبيق أبو رغوة</b>",
    "━━━━━━━━━━━━━━━━━━",
    "🔹 <b>نوع الطلب:</b> شراء عرض ترويجي",
    `🔹 <b>رقم الطلب:</b> #${esc(order.id)}`,
    `🔹 <b>التوقيت:</b> ${esc(safeWhen)}`,
    "",
    "👤 <b>بيانات العميل:</b>",
    `- الاسم: ${esc(order.customerName)}`,
    `- الهاتف: ${esc(order.customerPhone || "غير مسجل")}`,
    `- العنوان / ملاحظات التوصيل: ${esc(order.customerNote || "لم تُسجل ملاحظات")}`,
    "",
    "📦 <b>تفاصيل العرض:</b>",
    `<b>${esc(order.offerTitle)}</b>`,
    lines,
    "",
    "💰 <b>الحساب الإجمالي:</b>",
    `- الإجمالي الفرعي: ${money(subtotal)} ج.م`,
    `- الخصم: ${money(discount)} ج.م`,
    `- الإجمالي النهائي المستحق: <b>${money(total)} ج.م</b>`,
    "- طريقة الدفع: تُحدد عند التواصل مع العميل",
    "━━━━━━━━━━━━━━━━━━",
    "🔔 يرجى من مسؤول التجهيز مراجعة الطلب والبدء في التحضير.",
  ].join("\n");
  return { text, url };
}

async function sendTelegram(payload: TelegramPayload): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: payload.text,
        parse_mode: "HTML",
        reply_markup: makeKeyboard(payload.url),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn("[Telegram] Order notification rejected", { status: response.status });
      return false;
    }
    const result = await response.json() as { ok?: boolean };
    return result.ok === true;
  } catch (error) {
    console.warn("[Telegram] Order notification failed", { reason: error instanceof Error ? error.name : "unknown" });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifyCatalogOrder(order: CatalogNotification): Promise<boolean> {
  return sendTelegram(catalogMessage(order, getAppUrl()));
}

export async function notifyOfferPurchase(order: OfferNotification): Promise<boolean> {
  return sendTelegram(offerMessage(order, getAppUrl()));
}
