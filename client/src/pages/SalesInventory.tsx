import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Ban, BarChart3, CalendarDays, CircleAlert, LoaderCircle, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listCloudInvoices, voidCloudInvoice, type CloudInvoice } from "@/lib/supabase/invoices";
import { getActiveShopContext } from "@/lib/supabase/products";
import { toast } from "sonner";

type InventoryPeriod = "all" | "daily" | "weekly" | "monthly";
type InvoiceTotals = { revenue: number; cost: number; profit: number; profitPercent: number; unknownCostRevenue: number };

const currency = (value: number) => `${Number(value || 0).toFixed(2)} ج.م`;
const PAGE_SIZE = 50;

function cairoDateKey(date: Date): string {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function weekKey(dayKey: string): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((weekday + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function invoiceMatchesPeriod(invoice: CloudInvoice, period: InventoryPeriod, referenceDate: string): boolean {
  if (period === "all") return true;
  const day = cairoDateKey(new Date(invoice.date));
  if (period === "daily") return day === referenceDate;
  if (period === "monthly") return day.slice(0, 7) === referenceDate.slice(0, 7);
  return weekKey(day) === weekKey(referenceDate);
}

function invoiceCost(invoice: CloudInvoice): { known: boolean; cost: number } {
  const known = invoice.items.length > 0 && invoice.items.every(item => typeof item.unitCost === "number" && Number.isFinite(item.unitCost));
  const cost = known ? invoice.items.reduce((sum, item) => sum + (item.unitCost ?? 0) * item.quantity, 0) : 0;
  return { known, cost };
}

function summarize(invoices: CloudInvoice[], canViewCosts: boolean): InvoiceTotals {
  const completed = invoices.filter(invoice => invoice.status === "completed");
  const revenue = completed.reduce((sum, invoice) => sum + invoice.total, 0);
  if (!canViewCosts) return { revenue, cost: 0, profit: 0, profitPercent: 0, unknownCostRevenue: 0 };
  let cost = 0;
  let unknownCostRevenue = 0;
  for (const invoice of completed) {
    const result = invoiceCost(invoice);
    if (result.known) cost += result.cost;
    else unknownCostRevenue += invoice.total;
  }
  const profit = revenue - cost;
  return { revenue, cost, profit, profitPercent: revenue > 0 ? profit / revenue * 100 : 0, unknownCostRevenue };
}

function statusLabel(status: string): string {
  if (status === "completed") return "مكتملة";
  if (status === "voided") return "ملغاة";
  if (status === "partially_returned") return "مرتجع جزئي";
  if (status === "returned") return "مرتجعة";
  return status;
}

function Metric({ icon: Icon, title, value, className }: { icon: typeof BarChart3; title: string; value: string; className: string }) {
  return <Card className="border-0 shadow-sm"><CardContent className="p-5"><Icon className={`h-6 w-6 ${className}`} /><p className="mt-4 text-xs font-bold text-slate-500">{title}</p><p className={`mt-1 text-xl font-black ${className}`}>{value}</p></CardContent></Card>;
}

export default function SalesInventory() {
  const [, navigate] = useLocation();
  const [invoices, setInvoices] = useState<CloudInvoice[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<InventoryPeriod>("all");
  const [referenceDate, setReferenceDate] = useState(() => cairoDateKey(new Date()));

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      if (offset === 0) {
        const context = await getActiveShopContext();
        setRole(context.role);
      }
      const page = await listCloudInvoices(offset, PAGE_SIZE);
      setInvoices(current => {
        if (!append) return page.items;
        const merged = new Map(current.map(invoice => [invoice.invoiceId, invoice]));
        for (const invoice of page.items) merged.set(invoice.invoiceId, invoice);
        return Array.from(merged.values());
      });
      setNextOffset(page.nextOffset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الفواتير من Supabase.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { void loadPage(0, false); }, [loadPage]);

  const canViewCosts = role === "manager" || role === "admin" || role === "supervisor";
  const filteredInvoices = useMemo(
    () => invoices.filter(invoice => invoiceMatchesPeriod(invoice, period, referenceDate)),
    [invoices, period, referenceDate],
  );
  const totals = useMemo(() => summarize(filteredInvoices, canViewCosts), [filteredInvoices, canViewCosts]);

  const handleVoid = async (invoice: CloudInvoice) => {
    if (!canViewCosts || invoice.status !== "completed") return;
    const confirmed = window.confirm(`إبطال الفاتورة ${invoice.id}؟ ستُعاد كميات المخزون مرة واحدة ويُحفظ سجل الفاتورة وحركاته دون حذف.`);
    if (!confirmed) return;
    setVoidingId(invoice.invoiceId);
    try {
      await voidCloudInvoice(invoice.invoiceId);
      setInvoices(current => current.map(row => row.invoiceId === invoice.invoiceId ? { ...row, status: "voided" } : row));
      toast.success(`تم إبطال الفاتورة ${invoice.id} وتسجيل إعادة المخزون.`);
      await loadPage(0, false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "تعذر إبطال الفاتورة؛ لم يتغير السجل.");
    } finally {
      setVoidingId(null);
    }
  };

  const setPeriodDate = (value: string) => {
    if (!value) return;
    setReferenceDate(period === "monthly" ? `${value}-01` : value);
  };

  return <main className="min-h-screen bg-slate-50 p-4 pb-20" dir="rtl"><div className="mx-auto max-w-7xl space-y-6">
    <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-slate-800 to-emerald-800 p-6 text-white shadow-xl"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-black"><BarChart3 className="ml-1 h-3.5 w-3.5" />سجل سحابي</span><h1 className="mt-3 text-3xl font-black">جرد المبيعات والأرباح</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">يعرض الفواتير المؤكدة في Supabase فقط. طلبات الكتالوج والتركيبات لا تدخل في الإجماليات حتى اكتمال ترحيل مخططها إلى السحابة.</p></div><Button variant="outline" onClick={() => navigate("/dashboard")} className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="ml-2 h-4 w-4" />العودة للرئيسية</Button></div></header>

    <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="text-emerald-600" />فترة الجرد</CardTitle><CardDescription>الإجماليات أدناه تخص الفواتير المحمّلة والمعروضة فقط؛ حمّل صفحات أقدم لتوسيع النطاق.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">{(["all", "daily", "weekly", "monthly"] as InventoryPeriod[]).map(option => <button key={option} onClick={() => setPeriod(option)} className={`rounded-xl px-3 py-3 text-sm font-black transition ${period === option ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-emerald-50"}`}>{({ all: "إجمالي", daily: "يومي", weekly: "أسبوعي", monthly: "شهري" } as Record<InventoryPeriod, string>)[option]}</button>)}</div>{period !== "all" && <input aria-label="تاريخ الفترة" type={period === "monthly" ? "month" : "date"} value={period === "monthly" ? referenceDate.slice(0, 7) : referenceDate} onChange={event => setPeriodDate(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" />}</CardContent></Card>

    {error && <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button type="button" variant="outline" onClick={() => void loadPage(0, false)}>إعادة المحاولة</Button></div>}
    <section className={`grid gap-4 ${canViewCosts ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2"}`}><Metric icon={WalletCards} title="إجمالي المبيعات المكتملة" value={currency(totals.revenue)} className="text-blue-700" />{canViewCosts && <><Metric icon={TrendingUp} title="تكلفة معروفة" value={currency(totals.cost)} className="text-orange-700" /><Metric icon={BarChart3} title="صافي الربح المعروف" value={currency(totals.profit)} className={totals.profit >= 0 ? "text-emerald-700" : "text-red-700"} /><Metric icon={ReceiptText} title="نسبة الربح المعروفة" value={`${totals.profitPercent.toFixed(2)}%`} className="text-violet-700" /></>}</section>
    {canViewCosts && totals.unknownCostRevenue > 0 && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><p><strong>تنبيه دقة:</strong> توجد فواتير بقيمة {currency(totals.unknownCostRevenue)} لا تتوفر لها تكلفة بند موثقة؛ لم تدخل في تكلفة أو ربح الإجمالي.</p></div>}
    <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" /><p>المرتجعات الجزئية أو الكاملة مستبعدة من إجمالي المبيعات حتى ترحيل دفتر مرتجعات مستقل؛ تُعرض حالتها في الجدول للتدقيق.</p></div>

    <Card className="border-0 shadow-sm"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><ReceiptText className="text-slate-700" />الفواتير في الفترة</CardTitle><CardDescription>{filteredInvoices.length} فاتورة محمّلة؛ الإبطال إداري ويضيف حركة إعادة للمخزون دون حذف الفاتورة أو دفتر الحركات.</CardDescription></div><Button type="button" variant="outline" onClick={() => void loadPage(0, false)} disabled={loading}><LoaderCircle className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button></div></CardHeader><CardContent>
      {loading && invoices.length === 0 ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 p-10 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />جارٍ تحميل الفواتير من Supabase…</div> : filteredInvoices.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">{invoices.length === 0 ? "لا توجد فواتير في السجل السحابي." : "لا توجد فواتير في الفترة المختارة."}</div> : <div className="overflow-x-auto"><table className="min-w-full text-right text-sm"><thead className="border-b text-xs text-slate-500"><tr><th className="p-3">الفاتورة</th><th className="p-3">التاريخ</th><th className="p-3">العميل</th><th className="p-3">الإجمالي</th>{canViewCosts && <><th className="p-3">التكلفة</th><th className="p-3">الربح</th></>}<th className="p-3">الحالة</th>{canViewCosts && <th className="p-3">إجراء</th>}</tr></thead><tbody>{filteredInvoices.map(invoice => {
        const cost = invoiceCost(invoice);
        return <tr key={invoice.invoiceId} className="border-b border-slate-100"><td className="p-3 font-black text-slate-900">{invoice.id}</td><td className="p-3 text-slate-600">{new Date(invoice.date).toLocaleString("ar-EG")}</td><td className="p-3 text-slate-700">{invoice.customerName || "—"}</td><td className="p-3 font-bold">{currency(invoice.total)}</td>{canViewCosts && <><td className="p-3 font-bold">{cost.known ? currency(cost.cost) : "تكلفة غير مكتملة"}</td><td className="p-3 font-black text-emerald-700">{cost.known ? currency(invoice.total - cost.cost) : "—"}</td></>}<td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${invoice.status === "completed" ? "bg-emerald-50 text-emerald-800" : invoice.status === "voided" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-800"}`}>{statusLabel(invoice.status)}</span></td>{canViewCosts && <td className="p-3">{invoice.status === "completed" ? <Button size="sm" variant="destructive" onClick={() => void handleVoid(invoice)} disabled={voidingId === invoice.invoiceId}><Ban className="ml-1 h-3.5 w-3.5" />{voidingId === invoice.invoiceId ? "جارٍ الإبطال…" : "إبطال"}</Button> : "—"}</td>}</tr>;
      })}</tbody></table></div>}
      {nextOffset !== null && invoices.length > 0 && <div className="mt-4 flex justify-center"><Button type="button" variant="outline" onClick={() => void loadPage(nextOffset, true)} disabled={loadingMore}>{loadingMore && <LoaderCircle className="ml-2 h-4 w-4 animate-spin" />}تحميل فواتير أقدم</Button></div>}
    </CardContent></Card>
  </div></main>;
}
