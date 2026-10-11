import { useEffect, useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createInvoiceReturn, getInvoiceReturnableItems, listCloudInvoices, type CloudInvoice, type ReturnableInvoiceItem } from "@/lib/supabase/invoices";

export default function Returns() {
  const [, navigate] = useLocation();
  const [invoices, setInvoices] = useState<CloudInvoice[]>([]);
  const [selected, setSelected] = useState<CloudInvoice | null>(null);
  const [items, setItems] = useState<ReturnableInvoiceItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void listCloudInvoices(0, 50).then(page => setInvoices(page.items.filter(invoice => invoice.status === "completed" || invoice.status === "partially_returned"))).catch(error => setError(error instanceof Error ? error.message : "تعذر تحميل الفواتير.")).finally(() => setLoading(false));
  }, []);
  const selectInvoice = async (invoice: CloudInvoice) => {
    setSelected(invoice); setItems([]); setQuantities({}); setError(""); setLoadingItems(true);
    try { setItems(await getInvoiceReturnableItems(invoice.invoiceId)); } catch (error) { setError(error instanceof Error ? error.message : "تعذر تحميل أصناف المرتجع."); } finally { setLoadingItems(false); }
  };
  const submit = async () => {
    if (!selected) return;
    const selectedItems = items.map(item => ({ invoiceItemId: item.invoice_item_id, quantity: Number(quantities[item.invoice_item_id] || 0) })).filter(item => Number.isFinite(item.quantity) && item.quantity > 0);
    if (!selectedItems.length) return toast.error("أدخل كمية مرتجع واحدة على الأقل.");
    if (selectedItems.some(item => { const source = items.find(row => row.invoice_item_id === item.invoiceItemId); return !source || item.quantity > source.remaining_quantity; })) return toast.error("توجد كمية أكبر من المتاح للإرجاع.");
    setSaving(true);
    try {
      const result = await createInvoiceReturn({ invoiceId: selected.invoiceId, items: selectedItems, reason });
      toast.success(`تم تأكيد المرتجع ورد ${result.refundTotal.toFixed(2)} ج.م وخصم ${result.pointsReversed} نقطة.`);
      setInvoices(current => current.map(invoice => invoice.invoiceId === selected.invoiceId ? { ...invoice, status: result.invoiceStatus } : invoice));
      const refreshed = await getInvoiceReturnableItems(selected.invoiceId); setItems(refreshed); setQuantities({});
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تسجيل المرتجع."); } finally { setSaving(false); }
  };
  const expectedRefund = items.reduce((sum, item) => sum + Number(quantities[item.invoice_item_id] || 0) * item.refund_per_unit, 0);
  const expectedPoints = items.reduce((sum, item) => sum + (Number(quantities[item.invoice_item_id] || 0) / Math.max(item.sold_quantity, 1)) * item.points_earned, 0);
  return <main className="min-h-screen bg-slate-50 p-4" dir="rtl"><div className="mx-auto max-w-6xl"><header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-rose-600">إدارة المرتجعات</p><h1 className="text-3xl font-black text-slate-950">مرتجع فاتورة</h1><p className="mt-1 text-sm text-slate-600">يعيد المخزون ويخصم نقاط المنتج المرتجع داخل عملية Supabase ذرية واحدة.</p></div><Button variant="outline" onClick={() => navigate("/sales")}><ArrowLeft className="ml-1 h-4 w-4" />المبيعات</Button></header>{error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"><section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="mb-3 font-black">اختر الفاتورة</h2>{loading ? <p className="py-8 text-center text-slate-500">جاري تحميل الفواتير...</p> : !invoices.length ? <p className="py-8 text-center text-slate-500">لا توجد فواتير قابلة للإرجاع.</p> : <div className="max-h-[65vh] space-y-2 overflow-y-auto">{invoices.map(invoice => <button key={invoice.invoiceId} onClick={() => void selectInvoice(invoice)} className={`w-full rounded-xl border p-3 text-right transition ${selected?.invoiceId === invoice.invoiceId ? "border-rose-500 bg-rose-50" : "border-slate-200 hover:border-rose-300"}`}><div className="flex justify-between gap-2"><b>{invoice.id}</b><b className="text-emerald-700">{invoice.total.toFixed(2)} ج.م</b></div><p className="mt-1 text-xs text-slate-500">{invoice.customerName || "عميل عام"} · {new Date(invoice.date).toLocaleString("ar-EG")}</p><p className="mt-1 text-xs text-amber-700">النقاط المكتسبة: {invoice.loyaltyPointsAwarded} · الحالة: {invoice.status === "partially_returned" ? "مرتجع جزئي" : "مكتملة"}</p></button>)}</div>}</section><section className="rounded-2xl bg-white p-4 shadow-sm">{!selected ? <div className="grid min-h-[360px] place-items-center text-center text-slate-500"><RotateCcw className="mb-3 h-10 w-10 text-rose-300" /><p>اختر فاتورة لعرض الأصناف والكميات المتاحة للإرجاع.</p></div> : <><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-black">أصناف {selected.id}</h2><p className="text-sm text-slate-500">لا يمكن إرجاع كمية سبق إرجاعها.</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">النقاط الحالية: {selected.loyaltyPointsAwarded}</span></div>{loadingItems ? <p className="py-8 text-center text-slate-500">جاري تحميل البنود...</p> : <div className="space-y-2">{items.map(item => <div key={item.invoice_item_id} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_120px_120px] sm:items-center"><div><p className="font-bold">{item.product_name}</p><p className="text-xs text-slate-500">المباع {item.sold_quantity} · المرتجع {item.returned_quantity} · المتبقي {item.remaining_quantity}</p></div><p className="text-sm text-slate-600">{item.refund_per_unit.toFixed(2)} ج.م/وحدة<br /><span className="text-amber-700">{item.points_earned} نقطة</span></p><input type="number" min="0" max={item.remaining_quantity} step="any" disabled={!item.remaining_quantity || saving} value={quantities[item.invoice_item_id] || ""} onChange={event => setQuantities(current => ({ ...current, [item.invoice_item_id]: event.target.value }))} placeholder="كمية المرتجع" className="rounded-lg border p-2" /></div>)}<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="سبب المرتجع (اختياري)" className="mt-3 min-h-20 w-full rounded-lg border p-2" /><div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm"><p className="flex justify-between"><span>المبلغ المتوقع رده</span><b>{expectedRefund.toFixed(2)} ج.م</b></p><p className="flex justify-between text-amber-800"><span>النقاط المتوقع خصمها</span><b>{expectedPoints.toFixed(2)}</b></p></div><Button onClick={() => void submit()} disabled={saving || !items.some(item => Number(quantities[item.invoice_item_id] || 0) > 0)} className="mt-4 w-full bg-rose-600 hover:bg-rose-700">{saving ? "جاري تأكيد المرتجع ذريًا..." : "تأكيد المرتجع ورد المبلغ"}</Button></div>}</>}</section></div></div></main>;
}
