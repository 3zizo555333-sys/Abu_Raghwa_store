import { MessageCircle, Share2 } from "lucide-react";

type SalesInvoiceShareItem = {
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type SalesInvoiceShareData = {
  id: string;
  date: string;
  customerName: string;
  customerPhone: string;
  items: SalesInvoiceShareItem[];
  subTotal: number;
  discountAmount: number;
  total: number;
  paymentMethod: string;
};

type SalesInvoiceShareProps = { invoice: SalesInvoiceShareData };

const currency = (value: number) =>
  `${new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(Number(value) || 0)} ج.م`;

const paymentMethodLabel = (method: string) => {
  const labels: Record<string, string> = {
    cash: "نقدًا",
    card: "بطاقة",
    check: "شيك",
    bank_transfer: "تحويل بنكي",
    other: "أخرى",
  };
  return labels[method] || method || "غير محدد";
};

function buildReceiptMessage(invoice: SalesInvoiceShareData) {
  const date = new Date(invoice.date);
  const formattedDate = Number.isNaN(date.getTime())
    ? invoice.date
    : date.toLocaleString("ar-EG");
  const lines = [
    "محلات أبو رغوة للمنظفات والعطور",
    "إيصال بيع",
    `رقم الفاتورة: ${invoice.id}`,
    `التاريخ: ${formattedDate}`,
    ...(invoice.customerName ? [`العميل: ${invoice.customerName}`] : []),
    "",
    "الأصناف:",
    ...invoice.items.map(
      (item, index) =>
        `${index + 1}. ${item.productName} — ${item.quantity} × ${currency(item.unitPrice)} = ${currency(item.total)}`,
    ),
    "",
    `المجموع: ${currency(invoice.subTotal)}`,
    ...(invoice.discountAmount > 0
      ? [`الخصم: ${currency(invoice.discountAmount)}`]
      : []),
    `الإجمالي المستحق: ${currency(invoice.total)}`,
    `طريقة الدفع: ${paymentMethodLabel(invoice.paymentMethod)}`,
    "شكرًا لزيارتكم، ونتمنى لكم تجربة سعيدة!",
  ];
  return lines.join("\n");
}

function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Egyptian local mobile numbers are commonly stored with a leading zero.
  if (digits.startsWith("0") && digits.length === 11) digits = `20${digits.slice(1)}`;
  return digits;
}

export default function SalesInvoiceShare({ invoice }: SalesInvoiceShareProps) {
  const message = buildReceiptMessage(invoice);
  const phone = normalizePhone(invoice.customerPhone || "");

  const shareOnWhatsApp = () => {
    const recipient = phone ? `/${phone}` : "";
    const url = `https://wa.me${recipient}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareReceipt = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `إيصال الفاتورة ${invoice.id}`, text: message });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    shareOnWhatsApp();
  };

  return (
    <section dir="rtl" aria-label="مشاركة إيصال البيع" className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        onClick={shareOnWhatsApp}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
        aria-label={phone ? `إرسال الإيصال إلى ${invoice.customerPhone} عبر واتساب` : "مشاركة الإيصال عبر واتساب"}
      >
        <MessageCircle aria-hidden="true" className="h-4 w-4" />
        {phone ? "إرسال الإيصال للعميل عبر واتساب" : "مشاركة الإيصال عبر واتساب"}
      </button>
      <button
        type="button"
        onClick={() => void shareReceipt()}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
      >
        <Share2 aria-hidden="true" className="h-4 w-4" />
        مشاركة الإيصال
      </button>
    </section>
  );
}
