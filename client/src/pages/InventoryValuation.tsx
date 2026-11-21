import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, BarChart3, Beaker, Boxes, CircleDollarSign, Package, Printer, RefreshCw, Warehouse, Wallet, TrendingUp, FlaskConical, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { getActiveShopContext } from "@/lib/supabase/products";
import {
  INVENTORY_SECTIONS,
  loadInventoryValuation,
  subscribeInventoryValuationChanges,
  summarizeInventory,
  type InventorySectionKey,
  type InventoryTotals,
  type InventoryValuationItem,
  type InventoryValuationSnapshot,
} from "@/lib/supabase/inventoryValuation";

const currency = new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantityFormat = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 3 });
const printCurrency = (value: number) => `${currency.format(value)} ج.م`;
const money = (value: number) => `${currency.format(value)} ج.م`;
const formatQuantity = (value: number) => quantityFormat.format(value);

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "تعذر تحميل التقييم المالي للمخزون.";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

function printInventoryReport(title: string, items: InventoryValuationItem[]) {
  const popup = window.open("", "_blank", "width=1100,height=820");
  if (!popup) {
    toast.error("اسمح بفتح نافذة الطباعة ثم أعد المحاولة.");
    return;
  }
  const totals: InventoryTotals = summarizeInventory(items);
  const rows = items.map(item => `<tr><td>${escapeHtml(item.name)}${item.details ? `<small>${escapeHtml(item.details)}</small>` : ""}</td><td>${formatQuantity(item.quantity)} ${escapeHtml(item.unit)}</td><td>${printCurrency(item.unitCost)}</td><td>${printCurrency(item.capital)}</td><td>${printCurrency(item.unitSalePrice)}</td><td>${printCurrency(item.expectedSales)}</td><td>${printCurrency(item.expectedProfit)}</td><td>${currency.format(item.marginPercent)}%</td></tr>`).join("");
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,"Noto Naskh Arabic",sans-serif;color:#172033;margin:0;font-size:11px}header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0f766e;padding:0 0 12px;margin-bottom:14px}h1{font-size:22px;margin:0 0 5px;color:#0f172a}p{margin:0;color:#64748b}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0 16px}.metric{border:1px solid #dbe4e8;border-radius:10px;padding:9px;background:#f8fafc}.metric b{display:block;margin-top:5px;font-size:14px;color:#0f766e}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dbe4e8;padding:7px 6px;text-align:right;vertical-align:top}th{background:#eaf6f4;color:#0f4c45;white-space:nowrap}tbody tr:nth-child(even){background:#f8fafc}td:first-child{font-weight:bold}small{display:block;margin-top:4px;font-weight:normal;color:#64748b}.note{margin-top:10px;color:#64748b;font-size:10px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><header><div><h1>${escapeHtml(title)}</h1><p>متجر أبو رغوة — جرد سحابي قراءة فقط</p></div><p>تاريخ التقرير: ${escapeHtml(new Date().toLocaleString("ar-EG"))}</p></header>
    <div class="summary"><div class="metric">رأس المال<b>${printCurrency(totals.capital)}</b></div><div class="metric">القيمة البيعية المتوقعة<b>${printCurrency(totals.expectedSales)}</b></div><div class="metric">الربح المتوقع للأصناف القابلة للبيع<b>${printCurrency(totals.expectedProfit)}</b></div><div class="metric">متوسط هامش الربح<b>${currency.format(totals.marginPercent)}%</b></div></div>
    <table><thead><tr><th>الصنف</th><th>الكمية</th><th>تكلفة الوحدة</th><th>رأس المال</th><th>سعر البيع</th><th>القيمة البيعية</th><th>الربح المتوقع</th><th>الهامش</th></tr></thead><tbody>${rows || `<tr><td colspan="8">لا توجد أصناف في هذا التقرير.</td></tr>`}</tbody></table><p class="note">الخامات محتسبة ضمن رأس المال المحبوس ولا يُفترض لها سعر بيع قطاعي. مخزون التركيبات تقديري من سجلات الإنتاج والمبيعات والمرتجعات المسجلة سحابياً.</p></body></html>`);
  popup.document.close();
  window.setTimeout(() => { popup.focus(); popup.print(); }, 300);
}

function MetricCard({ title, value, hint, color, icon: Icon }: { title: string; value: string; hint: string; color: string; icon: LucideIcon }) {
  return <Card className={`border-0 shadow-sm ring-1 ${color}`}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-600">{title}</p><p className="mt-2 text-2xl font-black text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div><span className="rounded-2xl bg-white/80 p-3 text-teal-700 shadow-sm"><Icon className="h-5 w-5" /></span></div></CardContent></Card>;
}

const sectionIcon: Record<InventorySectionKey, LucideIcon> = {
  formulations: Beaker,
  products: Package,
  apartment: Warehouse,
  materials: FlaskConical,
};
const sectionColor: Record<InventorySectionKey, string> = {
  formulations: "border-cyan-100 bg-cyan-50/50",
  products: "border-blue-100 bg-blue-50/50",
  apartment: "border-indigo-100 bg-indigo-50/50",
  materials: "border-amber-100 bg-amber-50/50",
};

function TotalsStrip({ totals }: { totals: InventoryTotals }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">رأس المال</p><p className="mt-1 font-bold text-slate-900">{money(totals.capital)}</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-slate-500">القيمة البيعية المتوقعة</p><p className="mt-1 font-bold text-emerald-800">{money(totals.expectedSales)}</p></div><div className="rounded-xl bg-sky-50 p-3"><p className="text-xs text-slate-500">صافي الربح المتوقع</p><p className="mt-1 font-bold text-sky-800">{money(totals.expectedProfit)}</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-slate-500">متوسط هامش الربح</p><p className="mt-1 font-bold text-amber-800">{currency.format(totals.marginPercent)}%</p></div></div>;
}

function ItemTable({ items }: { items: InventoryValuationItem[] }) {
  if (!items.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">لا توجد أصناف مسجلة في هذا النطاق حالياً.</div>;
  return <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[940px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="px-4 py-3">الصنف</th><th className="px-4 py-3">الكمية</th><th className="px-4 py-3">تكلفة الوحدة</th><th className="px-4 py-3">رأس المال</th><th className="px-4 py-3">سعر البيع</th><th className="px-4 py-3">القيمة البيعية</th><th className="px-4 py-3">الربح المتوقع</th><th className="px-4 py-3">الهامش</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map(item => <tr key={item.id} className="align-top hover:bg-slate-50/70"><td className="px-4 py-3"><p className="font-bold text-slate-900">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.category}{item.details ? ` · ${item.details}` : ""}</p></td><td className="whitespace-nowrap px-4 py-3">{formatQuantity(item.quantity)} {item.unit}</td><td className="whitespace-nowrap px-4 py-3">{money(item.unitCost)}</td><td className="whitespace-nowrap px-4 py-3 font-semibold">{money(item.capital)}</td><td className="whitespace-nowrap px-4 py-3">{item.unitSalePrice > 0 ? money(item.unitSalePrice) : "—"}</td><td className="whitespace-nowrap px-4 py-3">{item.expectedSales > 0 ? money(item.expectedSales) : "—"}</td><td className={`whitespace-nowrap px-4 py-3 font-semibold ${item.expectedProfit > 0 ? "text-emerald-700" : item.expectedProfit < 0 ? "text-rose-700" : "text-slate-500"}`}>{item.expectedSales > 0 ? money(item.expectedProfit) : "—"}</td><td className="whitespace-nowrap px-4 py-3">{item.expectedSales > 0 ? `${currency.format(item.marginPercent)}%` : "—"}</td></tr>)}</tbody></table></div>;
}

export default function InventoryValuation() {
  const [, navigate] = useLocation();
  const [snapshot, setSnapshot] = useState<InventoryValuationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<InventorySectionKey | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setSnapshot(await loadInventoryValuation());
    } catch (loadError) {
      const message = errorText(loadError);
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => Promise<unknown>) | (() => void) | undefined;
    void refresh();
    void getActiveShopContext().then(context => {
      if (active) unsubscribe = subscribeInventoryValuationChanges(context.shopId, () => { if (document.visibilityState === "visible") void refresh(true); });
    }).catch(() => undefined);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(true); }, 30_000);
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(true); };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      void unsubscribe?.();
    };
  }, [refresh]);

  const currentItems = useMemo(() => {
    if (!snapshot) return [];
    if (selectedSection) return snapshot.items.filter(item => item.section === selectedSection);
    if (selectedCategory) return snapshot.items.filter(item => item.category === selectedCategory);
    return [];
  }, [snapshot, selectedSection, selectedCategory]);
  const currentTotals = useMemo(() => summarizeInventory(currentItems), [currentItems]);
  const clearSelection = () => { setSelectedSection(null); setSelectedCategory(null); };
  const selectedTitle = selectedSection ? INVENTORY_SECTIONS.find(section => section.key === selectedSection)?.title : selectedCategory;
  const printFull = () => snapshot && printInventoryReport("الجرد الكامل المجمّع للمحل والمخزن", snapshot.items);
  const printSelected = () => { if (selectedTitle) printInventoryReport(`جرد ${selectedTitle}`, currentItems); };

  return <div dir="rtl" className="min-h-screen bg-[#f4f7f6] text-slate-900">
    <header className="border-b border-emerald-100 bg-white shadow-sm"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between md:px-7"><div className="flex items-start gap-3"><span className="rounded-2xl bg-emerald-50 p-3 text-emerald-800"><BarChart3 className="h-6 w-6" /></span><div><p className="text-xs font-bold tracking-wide text-emerald-700">تحليل المخزون ورأس المال</p><h1 className="mt-1 text-2xl font-black md:text-3xl">الجرد الذكي والتقييم المالي للمخزون</h1><p className="mt-1 text-sm text-slate-500">قراءة آلية من Supabase، مع تحديث حي وتقارير مستقلة.</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void refresh(true)} disabled={refreshing} className="gap-2"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />تحديث الآن</Button><Button onClick={printFull} disabled={!snapshot} className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800"><Printer className="h-4 w-4" />طباعة الجرد الكامل / PDF</Button><Button variant="ghost" onClick={() => navigate("/dashboard")} className="gap-2"><ArrowRight className="h-4 w-4" />لوحة التحكم</Button></div></div></header>

    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 md:px-7 md:py-8">
      {error && <Card className="border-rose-200 bg-rose-50"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-rose-800">تعذر تحميل التقييم الحي</p><p className="mt-1 text-sm text-rose-700">{error}</p></div><Button variant="outline" onClick={() => void refresh()} className="border-rose-300">إعادة المحاولة</Button></CardContent></Card>}
      {loading && !snapshot ? <Card className="border-0 shadow-sm"><CardContent className="p-10 text-center text-slate-500"><RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-emerald-700" />جارٍ جمع بيانات المخزون وتقييمها من Supabase…</CardContent></Card> : snapshot && <>
        {!selectedSection && !selectedCategory ? <>
          <section aria-labelledby="inventory-overview-heading" className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="inventory-overview-heading" className="text-xl font-black">الجرد الكامل المجمّع للمحل والمخزن</h2><p className="mt-1 text-sm text-slate-500">آخر احتساب: {new Date(snapshot.calculatedAt).toLocaleTimeString("ar-EG")}</p></div><p className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm">{snapshot.totals.itemCount} صنفاً · تحديث كل 30 ثانية</p></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard title="رأس المال الكلي" value={money(snapshot.totals.capital)} hint="يشمل المتجر والشقة والخامات والتركيبات" color="ring-slate-200 bg-white" icon={Wallet} /><MetricCard title="القيمة البيعية المتوقعة" value={money(snapshot.totals.expectedSales)} hint="للأرصدة ذات سعر بيع قطاعي مسجل" color="ring-emerald-200 bg-emerald-50/60" icon={TrendingUp} /><MetricCard title="صافي الربح المتوقع" value={money(snapshot.totals.expectedProfit)} hint="للأصناف القابلة للبيع؛ الخامات ضمن رأس المال" color="ring-sky-200 bg-sky-50/70" icon={CircleDollarSign} /><MetricCard title="متوسط هامش الربح" value={`${currency.format(snapshot.totals.marginPercent)}%`} hint="الربح المتوقع ÷ القيمة البيعية" color="ring-amber-200 bg-amber-50/70" icon={BarChart3} /></div>
            <p className="rounded-xl border border-slate-200 bg-white/75 px-4 py-3 text-xs leading-6 text-slate-600">الخامات تظهر ضمن رأس المال المحبوس ولا يُفترض لها سعر بيع قطاعي. رصيد التركيبات تقديري من الإنتاج المكتمل ناقص المبيعات المسجلة مضافاً إليه المرتجعات؛ ولا تُخلط بيانات المتصفح المحلية مع الرصيد السحابي.</p>
          </section>

          <section className="space-y-4"><div><h2 className="text-xl font-black">الأقسام الأربعة</h2><p className="mt-1 text-sm text-slate-500">افتح قسماً لمراجعة تفاصيله أو اطبع تقريره منفرداً.</p></div><div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{INVENTORY_SECTIONS.map(section => { const totals = snapshot.sections[section.key]; const Icon = sectionIcon[section.key]; return <Card key={section.key} className={`border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${sectionColor[section.key]}`}><CardHeader className="pb-2"><div className="flex items-start justify-between gap-3"><button type="button" onClick={() => { setSelectedSection(section.key); setSelectedCategory(null); }} className="flex min-w-0 flex-1 items-start gap-3 text-right"><span className="rounded-xl bg-white p-2.5 text-emerald-800 shadow-sm"><Icon className="h-5 w-5" /></span><span><CardTitle className="text-base">{section.title}</CardTitle><CardDescription className="mt-1 leading-5">{section.description}</CardDescription></span></button><Button type="button" variant="outline" size="icon" aria-label={`طباعة ${section.title}`} title="طباعة التقرير" onClick={() => printInventoryReport(`جرد ${section.title}`, snapshot.items.filter(item => item.section === section.key))}><Printer className="h-4 w-4" /></Button></div></CardHeader><CardContent><div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-slate-500">رأس المال</p><p className="mt-1 font-black">{money(totals.capital)}</p></div><div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-slate-500">القيمة البيعية</p><p className="mt-1 font-black text-emerald-800">{money(totals.expectedSales)}</p></div><div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-slate-500">الربح المتوقع</p><p className="mt-1 font-bold">{money(totals.expectedProfit)}</p></div><div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-slate-500">عدد الأصناف · الهامش</p><p className="mt-1 font-bold">{totals.itemCount} · {currency.format(totals.marginPercent)}%</p></div></div><button type="button" onClick={() => { setSelectedSection(section.key); setSelectedCategory(null); }} className="mt-4 flex w-full items-center justify-between rounded-xl bg-white/80 px-4 py-3 text-sm font-bold text-emerald-800 hover:bg-white">فتح جرد القسم<ArrowRight className="h-4 w-4" /></button></CardContent></Card>; })}</div></section>

          <section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-black">جرد الفئات الديناميكي</h2><p className="mt-1 text-sm text-slate-500">الفئات تُقرأ من Supabase وتُضم إليها الفئات الموجودة فعلياً في أصناف المخزون.</p></div><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm">{snapshot.categories.length} فئة</span></div>{snapshot.categories.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{snapshot.categories.map(category => { const items = snapshot.items.filter(item => item.category === category); const totals = summarizeInventory(items); return <Card key={category} className="border-0 bg-white shadow-sm transition hover:shadow-md"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><button type="button" onClick={() => { setSelectedCategory(category); setSelectedSection(null); }} className="flex min-w-0 flex-1 items-center gap-3 text-right"><span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-800"><Boxes className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate font-black">{category}</span><span className="mt-1 block text-xs text-slate-500">{items.length} صنف · رأس المال {money(totals.capital)}</span></span></button><Button type="button" variant="ghost" size="icon" aria-label={`طباعة جرد فئة ${category}`} title="طباعة الفئة" onClick={() => printInventoryReport(`جرد فئة ${category}`, items)}><Printer className="h-4 w-4" /></Button></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs"><span className="text-emerald-800">بيع: {money(totals.expectedSales)}</span><span className="text-sky-800">ربح: {money(totals.expectedProfit)}</span><span className="text-amber-800">هامش: {currency.format(totals.marginPercent)}%</span></div></CardContent></Card>; })}</div> : <Card className="border-dashed"><CardContent className="p-8 text-center text-sm text-slate-500">لا توجد فئات مرتبطة بأصناف مخزون.</CardContent></Card>}</section>
        </> : <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><Button variant="ghost" onClick={clearSelection} className="mb-2 gap-2 px-0 text-emerald-800"><ArrowRight className="h-4 w-4" />العودة إلى الجرد الكامل</Button><h2 className="text-2xl font-black">{selectedSection ? `جرد قسم ${selectedTitle}` : `جرد فئة ${selectedTitle}`}</h2><p className="mt-1 text-sm text-slate-500">عرض معزول لهذا النطاق فقط.</p></div><Button onClick={printSelected} className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800"><Printer className="h-4 w-4" />طباعة / حفظ PDF</Button></div><TotalsStrip totals={currentTotals} /><ItemTable items={currentItems} /></section>}
      </>}
      {!loading && !snapshot && !error && <Card><CardContent className="p-8 text-center text-slate-500">لا توجد بيانات متاحة حالياً.</CardContent></Card>}
    </main>
  </div>;
}
