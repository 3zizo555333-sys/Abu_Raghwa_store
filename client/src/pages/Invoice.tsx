import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Download, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getCloudInvoice, type CloudInvoice } from "@/lib/supabase/invoices";

function paymentLabel(method: string) {
  if (method === "cash") return "نقدًا";
  if (method === "card") return "بطاقة";
  if (method === "check") return "شيك";
  if (method === "bank_transfer") return "تحويل بنكي";
  return "أخرى";
}

export default function Invoice() {
  const [, navigate] = useLocation();
  const invoiceRef = useRef<HTMLDivElement>(null);
  const invoiceId = new URLSearchParams(window.location.search).get("invoiceId");
  const [sale, setSale] = useState<CloudInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [zoomLevel, setZoomLevel] = useState(100);
  const [thermalWidth, setThermalWidth] = useState<"58" | "80">("80");

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
    void getCloudInvoice(invoiceId).then(invoice => {
      if (active) setSale(invoice);
    }).catch(error => {
      if (active) setLoadError(error instanceof Error ? error.message : "تعذر تحميل الفاتورة من Supabase.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [invoiceId]);

  const handlePrint = () => window.print();
  const invoiceText = () => {
    if (!sale) return "";
    const lines = sale.items.map(item => `${item.productName} | ${item.selectedUnitType} | ${item.quantity} × ${item.unitPrice.toFixed(2)} = ${item.total.toFixed(2)} ج.م`).join("\n");
    return `محلات أبو رغوة للمنظفات\nفاتورة: ${sale.id}\nالتاريخ: ${new Date(sale.date).toLocaleString("ar-EG")}\nالعميل: ${sale.customerName || "عميل عام"}\nالهاتف: ${sale.customerPhone || "غير محدد"}\n\n${lines}\n\nالإجمالي قبل الخصم: ${sale.subTotal.toFixed(2)} ج.م\nالخصم: ${sale.discountAmount.toFixed(2)} ج.م\nالإجمالي النهائي: ${sale.total.toFixed(2)} ج.م\nطريقة الدفع: ${paymentLabel(sale.paymentMethod)}`;
  };
  const handleDownload = () => {
    if (!sale) return;
    const blob = new Blob([invoiceText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `فاتورة-${sale.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("تم تنزيل نسخة نصية من الفاتورة السحابية.");
  };
  const handleShare = async () => {
    if (!sale) return;
    const text = invoiceText();
    const supportsNativeShare = typeof navigator.share === "function";
    try {
      if (supportsNativeShare) await navigator.share({ title: `فاتورة ${sale.id}`, text });
      else await navigator.clipboard.writeText(text);
      toast.success(supportsNativeShare ? "تم فتح خيارات مشاركة الفاتورة." : "نُسخت تفاصيل الفاتورة إلى الحافظة.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("تعذرت مشاركة الفاتورة.");
    }
  };

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 p-4" dir="rtl"><p className="text-slate-600">جاري تحميل الفاتورة المؤكدة من Supabase...</p></main>;
  if (loadError || !sale) return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-4 text-center" dir="rtl"><p className="max-w-xl text-slate-700">{loadError || "لا توجد فاتورة لعرضها."}</p><Button onClick={() => navigate("/sales")} className="bg-orange-600 text-white hover:bg-orange-700"><ArrowLeft className="ml-2 h-4 w-4" />العودة للمبيعات</Button></main>;

  return <main className="min-h-screen bg-gray-100 p-3 print:bg-white print:p-0" dir="rtl"><div className="mx-auto max-w-lg"><div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2 shadow-sm print:hidden"><Button variant="outline" size="sm" onClick={() => navigate("/sales")}><ArrowLeft className="ml-1 h-4 w-4" />المبيعات</Button><div className="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs"><button onClick={() => setZoomLevel(value => Math.max(70, value - 10))}>−</button><span>{zoomLevel}%</span><button onClick={() => setZoomLevel(value => Math.min(130, value + 10))}>+</button><button onClick={() => setZoomLevel(100)} className="mr-1 text-orange-700">إعادة</button></div><select value={thermalWidth} onChange={event => setThermalWidth(event.target.value as "58" | "80")} className="rounded border p-1 text-xs"><option value="80">حراري 80 مم</option><option value="58">حراري 58 مم</option></select><Button size="sm" variant="outline" onClick={handleDownload}><Download className="ml-1 h-4 w-4" />تنزيل</Button><Button size="sm" variant="outline" onClick={() => void handleShare()}><Share2 className="ml-1 h-4 w-4" />مشاركة</Button><Button size="sm" onClick={handlePrint} className="bg-orange-600 text-white"><Printer className="ml-1 h-4 w-4" />طباعة</Button></div><article ref={invoiceRef} className="thermal-receipt overflow-hidden rounded-lg border border-orange-100 bg-white shadow-lg print:rounded-none print:border-0 print:shadow-none" style={{ "--receipt-width": `${thermalWidth}mm` } as CSSProperties}><div className="bg-gradient-to-b from-orange-50 to-white p-5" style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "top center" }}><header className="mb-4 border-b border-orange-300 pb-3 text-center"><h1 className="text-xl font-black text-orange-700">محلات أبو رغوة للمنظفات والعطور</h1><p className="mt-1 text-xs text-gray-600">أصل الرغوة في مصر — هنسيب علامة في بيتك</p><p className="mt-1 text-xs font-bold text-gray-700">للتواصل: 01069035599</p></header><div className="mb-3 flex justify-between rounded bg-orange-100/60 px-3 py-2 text-xs"><span>رقم الفاتورة: <b dir="ltr">{sale.id}</b></span><span>التاريخ: <b>{new Date(sale.date).toLocaleString("ar-EG")}</b></span></div>{(sale.customerName || sale.customerPhone) && <div className="mb-3 flex justify-between rounded border border-orange-200 bg-white/80 px-3 py-2 text-xs"><span>العميل: <b>{sale.customerName || "عميل عام"}</b></span><span>الهاتف: <b>{sale.customerPhone || "غير محدد"}</b></span></div>}<div className="overflow-x-auto"><table className="w-full border-collapse text-xs"><thead><tr className="bg-orange-600 text-white"><th className="border border-orange-700 p-2 text-right">المنتج</th><th className="border border-orange-700 p-2">الوحدة</th><th className="border border-orange-700 p-2">الكمية</th><th className="border border-orange-700 p-2">السعر</th><th className="border border-orange-700 p-2">الإجمالي</th></tr></thead><tbody>{sale.items.map((item, index) => <tr key={`${item.productId}-${index}`} className={index % 2 === 0 ? "bg-orange-50/50" : "bg-white"}><td className="border p-2 font-semibold">{item.productName}</td><td className="border p-2">{item.selectedUnitType || "قطعة"}</td><td className="border p-2 text-center">{item.quantity}</td><td className="border p-2 text-center">{item.unitPrice.toFixed(2)}</td><td className="border p-2 text-center font-bold text-orange-700">{item.total.toFixed(2)}</td></tr>)}</tbody></table></div><section className="mt-3 space-y-1 rounded bg-gradient-to-r from-orange-600 to-orange-500 p-3 text-sm text-white"><div className="flex justify-between"><span>إجمالي المنتجات</span><b>{sale.subTotal.toFixed(2)} ج.م</b></div>{sale.discountAmount > 0 && <div className="flex justify-between text-orange-100"><span>الخصم</span><b>−{sale.discountAmount.toFixed(2)} ج.م</b></div>}<div className="flex justify-between border-t border-orange-300 pt-1 text-base font-black"><span>الإجمالي النهائي</span><b>{sale.total.toFixed(2)} ج.م</b></div></section><div className="mt-3 flex justify-between rounded border border-gray-200 bg-gray-50 p-2 text-xs"><span>طريقة الدفع: {paymentLabel(sale.paymentMethod)}</span><b className="text-orange-700">شكراً لتعاملكم معنا</b></div><p className="mt-3 text-center text-[10px] text-slate-500">هذه الفاتورة محمّلة من سجل Supabase بعد تأكيد العملية الذرية.</p></div></article><div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 print:hidden">المرتجعات ونقاط الولاء غير معروضة لأنهما غير مدعومتين بعملية Supabase ذرية معتمدة لهذا المسار.</div></div></main>;
}
