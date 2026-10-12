import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Download, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { buildInvoiceImageFilename, captureInvoicePng, downloadImageBlob, shareInvoicePng, withInvoicePrintFallback } from "@/lib/invoiceImage";
import { getCloudInvoice, type CloudInvoice } from "@/lib/supabase/invoices";

const receiptColors = {
  paper: "#ffffff",
  ink: "#111827",
  muted: "#4b5563",
  accent: "#c2410c",
  accentStrong: "#ea580c",
  accentLight: "#f97316",
  accentPale: "#fff7ed",
  accentSoft: "#ffedd5",
  accentBorder: "#fdba74",
  line: "#e5e7eb",
  subtle: "#f9fafb",
  footer: "#64748b",
} as const;

function paymentLabel(method: string) {
  if (method === "cash") return "نقدًا";
  if (method === "card") return "بطاقة";
  if (method === "check") return "شيك";
  if (method === "bank_transfer") return "تحويل بنكي";
  return "أخرى";
}

export default function Invoice() {
  const [, navigate] = useLocation();
  const invoiceRef = useRef<HTMLElement>(null);
  const invoiceId = new URLSearchParams(window.location.search).get("invoiceId");
  const [sale, setSale] = useState<CloudInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [zoomLevel, setZoomLevel] = useState(100);
  const [thermalWidth, setThermalWidth] = useState<"58" | "80">("80");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSale(null);
    setLoadError("");
    if (!invoiceId) {
      setLoadError("رابط الفاتورة لا يحتوي على معرّف سحابي. افتح الفاتورة من سجل المبيعات بعد تأكيدها.");
      setLoading(false);
      return () => { active = false; };
    }
    void getCloudInvoice(invoiceId)
      .then(invoice => { if (active) setSale(invoice); })
      .catch(error => { if (active) setLoadError(error instanceof Error ? error.message : "تعذر تحميل الفاتورة من Supabase."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [invoiceId]);

  const handlePrint = () => window.print();

  const handleDownload = async () => {
    if (!sale || !invoiceRef.current || isExporting) return;
    const invoiceElement = invoiceRef.current;
    setIsExporting(true);
    try {
      const result = await withInvoicePrintFallback(async () => {
        const image = await captureInvoicePng(invoiceElement);
        downloadImageBlob(image, buildInvoiceImageFilename(sale.id));
      });
      if (result.status === "completed") toast.success("تم تنزيل صورة الفاتورة بصيغة PNG.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    if (!sale || !invoiceRef.current || isExporting) return;
    const invoiceElement = invoiceRef.current;
    setIsExporting(true);
    try {
      const outcome = await withInvoicePrintFallback(async () => {
        const image = await captureInvoicePng(invoiceElement);
        return shareInvoicePng(image, buildInvoiceImageFilename(sale.id), `فاتورة ${sale.id}`);
      });
      if (outcome.status === "completed") {
        if (outcome.value === "shared") toast.success("تمت مشاركة صورة الفاتورة.");
        else toast.message("تعذرت المشاركة أو لم يدعمها المتصفح؛ تم تنزيل صورة الفاتورة تلقائيًا.");
      }
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-slate-50 p-4" dir="rtl"><p className="text-slate-600">جاري تحميل الفاتورة المؤكدة من Supabase...</p></main>;
  }
  if (loadError || !sale) {
    return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-4 text-center" dir="rtl"><p className="max-w-xl text-slate-700">{loadError || "لا توجد فاتورة لعرضها."}</p><Button onClick={() => navigate("/sales")} className="bg-orange-600 text-white hover:bg-orange-700"><ArrowLeft className="ml-2 h-4 w-4" />العودة للمبيعات</Button></main>;
  }

  return (
    <main className="invoice-mobile min-h-dvh w-full max-w-full overflow-x-hidden overscroll-x-none bg-gray-100 p-0 print:bg-white print:p-0" dir="rtl">
      <div className="mx-auto flex min-h-dvh w-full min-w-0 max-w-3xl flex-col">
        <div className="sticky top-0 z-20 mb-2 grid w-full min-w-0 grid-cols-2 items-center gap-2 bg-white/95 p-2 shadow-sm backdrop-blur print:hidden sm:static sm:flex sm:flex-wrap sm:justify-between sm:rounded-lg">
          <Button variant="outline" size="sm" onClick={() => navigate("/sales")}><ArrowLeft className="ml-1 h-4 w-4" />المبيعات</Button>
          <div className="flex min-w-0 items-center justify-center gap-2 rounded bg-gray-100 px-2 py-2 text-sm">
            <button type="button" onClick={() => setZoomLevel(value => Math.max(70, value - 10))}>−</button>
            <span>{zoomLevel}%</span>
            <button type="button" onClick={() => setZoomLevel(value => Math.min(130, value + 10))}>+</button>
            <button type="button" onClick={() => setZoomLevel(100)} className="mr-1 text-orange-700">إعادة</button>
          </div>
          <select aria-label="عرض الطابعة الحرارية" value={thermalWidth} onChange={event => setThermalWidth(event.target.value as "58" | "80")} className="min-w-0 rounded border p-2 text-sm">
            <option value="80">حراري 80 مم</option>
            <option value="58">حراري 58 مم</option>
          </select>
          <Button size="sm" variant="outline" disabled={isExporting} onClick={() => void handleDownload()}><Download className="ml-1 h-4 w-4" />{isExporting ? "جاري التجهيز..." : "تنزيل صورة"}</Button>
          <Button size="sm" variant="outline" disabled={isExporting} onClick={() => void handleShare()}><Share2 className="ml-1 h-4 w-4" />مشاركة الصورة</Button>
          <Button size="sm" onClick={handlePrint} className="bg-orange-600 text-white"><Printer className="ml-1 h-4 w-4" />طباعة</Button>
        </div>

        <article
          ref={invoiceRef}
          data-invoice-export-root
          className="thermal-receipt mx-auto w-full min-w-0 max-w-full rounded-none border shadow-lg sm:rounded-lg print:rounded-none print:border-0 print:shadow-none"
          style={{
            "--receipt-width": `${thermalWidth}mm`,
            width: "100%",
            maxWidth: "min(100%, 720px)",
            marginInline: "auto",
            minHeight: "320px",
            overflow: "visible",
            backgroundColor: receiptColors.paper,
            borderColor: receiptColors.accentSoft,
            color: receiptColors.ink,
            boxShadow: "0 4px 12px rgba(17, 24, 39, 0.08)",
          } as CSSProperties}
        >
          <div
            data-invoice-export-content
            className="w-full min-w-0 p-3 sm:p-6"
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: "top center",
              backgroundImage: `linear-gradient(to bottom, ${receiptColors.accentPale}, ${receiptColors.paper})`,
              color: receiptColors.ink,
            }}
          >
            <header className="mb-4 border-b pb-3 text-center" style={{ borderBottomColor: receiptColors.accentBorder }}>
              <h1 className="text-xl font-black" style={{ color: receiptColors.accent }}>محلات أبو رغوة للمنظفات والعطور</h1>
              <p className="mt-1 text-xs" style={{ color: receiptColors.muted }}>أصل الرغوة في مصر — هنسيب علامة في بيتك</p>
              <p className="mt-1 text-xs font-bold" style={{ color: receiptColors.ink }}>للتواصل: 01069035599</p>
            </header>

            <div className="mb-3 flex flex-wrap justify-between gap-2 rounded px-3 py-2 text-xs" style={{ backgroundColor: receiptColors.accentSoft, color: receiptColors.ink }}>
              <span>رقم الفاتورة: <b dir="ltr">{sale.id}</b></span>
              <span>التاريخ: <b>{new Date(sale.date).toLocaleString("ar-EG")}</b></span>
            </div>

            {(sale.customerName || sale.customerPhone) && (
              <div className="mb-3 flex flex-wrap justify-between gap-2 rounded border px-3 py-2 text-xs" style={{ borderColor: receiptColors.accentBorder, backgroundColor: receiptColors.paper, color: receiptColors.ink }}>
                <span>العميل: <b>{sale.customerName || "عميل عام"}</b></span>
                <span>الهاتف: <b>{sale.customerPhone || "غير محدد"}</b></span>
              </div>
            )}

            <div className="w-full min-w-0 overflow-hidden">
              <table className="w-full table-fixed border-collapse text-xs">
                <thead>
                  <tr style={{ backgroundColor: receiptColors.accentStrong, color: receiptColors.paper }}>
                    <th className="break-words border p-1.5 text-right sm:p-2" style={{ borderColor: receiptColors.accent }}>المنتج</th>
                    <th className="break-words border p-1.5 sm:p-2" style={{ borderColor: receiptColors.accent }}>الوحدة</th>
                    <th className="border p-2" style={{ borderColor: receiptColors.accent }}>الكمية</th>
                    <th className="border p-2" style={{ borderColor: receiptColors.accent }}>السعر</th>
                    <th className="border p-2" style={{ borderColor: receiptColors.accent }}>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item, index) => {
                    const rowBackground = index % 2 === 0 ? receiptColors.accentPale : receiptColors.paper;
                    const cellStyle: CSSProperties = { borderColor: receiptColors.accentBorder, color: receiptColors.ink };
                    return (
                      <tr key={`${item.productId}-${index}`} style={{ backgroundColor: rowBackground }}>
                        <td className="break-words border p-1.5 font-semibold sm:p-2" style={cellStyle}>{item.productName}</td>
                        <td className="break-words border p-1.5 sm:p-2" style={cellStyle}>{item.selectedUnitType || "قطعة"}</td>
                        <td className="break-words border p-1.5 text-center sm:p-2" style={cellStyle}>{item.quantity}</td>
                        <td className="border p-2 text-center" style={cellStyle}>{item.unitPrice.toFixed(2)}</td>
                        <td className="break-words border p-1.5 text-center font-bold sm:p-2" style={{ ...cellStyle, color: receiptColors.accent }}>{item.total.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <section className="mt-3 space-y-1 rounded p-3 text-sm" style={{ backgroundImage: `linear-gradient(to right, ${receiptColors.accentStrong}, ${receiptColors.accentLight})`, color: receiptColors.paper }}>
              <div className="flex justify-between"><span>إجمالي المنتجات</span><b>{sale.subTotal.toFixed(2)} ج.م</b></div>
              {sale.discountAmount > 0 && <div className="flex justify-between" style={{ color: receiptColors.accentSoft }}><span>الخصم</span><b>−{sale.discountAmount.toFixed(2)} ج.م</b></div>}
              <div className="flex justify-between border-t pt-1 text-base font-black" style={{ borderTopColor: receiptColors.accentBorder }}><span>الإجمالي النهائي</span><b>{sale.total.toFixed(2)} ج.م</b></div>
            </section>

            <div className="mt-3 flex justify-between rounded border p-2 text-xs" style={{ borderColor: receiptColors.line, backgroundColor: receiptColors.subtle, color: receiptColors.ink }}>
              <span>طريقة الدفع: {paymentLabel(sale.paymentMethod)}</span>
              <b style={{ color: receiptColors.accent }}>النقاط المكتسبة: {sale.loyaltyPointsAwarded}</b>
            </div>
            <p className="mt-3 text-center text-[10px]" style={{ color: receiptColors.footer }}>هذه الفاتورة محمّلة من سجل Supabase بعد تأكيد العملية الذرية.</p>
          </div>
        </article>
      </div>
    </main>
  );
}
