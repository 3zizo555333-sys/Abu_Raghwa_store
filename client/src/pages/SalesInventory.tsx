import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Archive, ArrowLeft, BarChart3, CalendarDays, CircleAlert, ReceiptText, RotateCcw, Trash2, TrendingUp, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCloudState } from "@/lib/cloudSync";
import { useSalesCloudState } from "@/lib/useSalesCloudState";
import { trpc } from "@/lib/trpc";
import { buildSalesInventoryEntries, filterSalesInventoryEntries, summarizeSalesInventory, type InventoryPeriod, type InventorySource, type SalesInventoryCatalogOrder, type SalesInventoryProduct, type SalesInventoryRecipe, type SalesInventorySale } from "@/lib/salesInventory";
import { addArchivedSale, getOutstandingSalePoints, getOutstandingSaleQuantity, removeArchivedSale, type ArchivedSale } from "@/lib/salesInventoryCleanup";
import { getPackageStockDeduction } from "@/lib/packageUnits";
import { toast } from "sonner";

const currency = (value: number) => `${Number(value || 0).toFixed(2)} ج.م`;
const sourceLabels: Record<InventorySource, string> = { products: "مبيعات المنتجات", recipes: "مبيعات التركيبات", catalog: "مبيعات الكتالوج" };
const sourceColors: Record<InventorySource, string> = { products: "bg-blue-50 text-blue-800 ring-blue-100", recipes: "bg-violet-50 text-violet-800 ring-violet-100", catalog: "bg-orange-50 text-orange-800 ring-orange-100" };

export default function SalesInventory() {
  const [, navigate] = useLocation();
  const [sales, setSales] = useSalesCloudState<SalesInventorySale>();
  const [archivedSales, setArchivedSales] = useCloudState<ArchivedSale[]>("abu_raghwa_archived_sales", []);
  const [deletedSalesIds, setDeletedSalesIds] = useCloudState<string[]>("abu_raghwa_permanently_deleted_sales", []);
  const [products, setProducts] = useCloudState<SalesInventoryProduct[]>("abu_raghwa_products", []);
  const [recipes] = useCloudState<SalesInventoryRecipe[]>("abu_raghwa_recipes", []);
  const [period, setPeriod] = useState<InventoryPeriod>("all");
  const [referenceDate, setReferenceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showArchived, setShowArchived] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const catalogLogin = trpc.catalog.loginWithStaffSession.useMutation({ onSuccess: result => { try { sessionStorage.setItem("abu_catalog_admin_token", result.token); } catch {} setCatalogReady(true); }, onError: () => setCatalogReady(false) });
  const catalogOrders = trpc.catalog.listOrders.useQuery({ includeArchived: true }, { enabled: catalogReady, refetchInterval: catalogReady ? 12_000 : false, retry: false });
  const archiveCatalogOrder = trpc.catalog.archiveOrder.useMutation();
  const restoreCatalogOrder = trpc.catalog.restoreOrder.useMutation();
  const deleteCatalogOrder = trpc.catalog.deleteOrder.useMutation();
  const reverseDirectSaleLoyalty = trpc.catalog.reverseDirectSaleLoyalty.useMutation();
  const restoreDirectSaleLoyalty = trpc.catalog.restoreDirectSaleLoyalty.useMutation();

  useEffect(() => {
    if (!sessionStorage.getItem("abu_catalog_admin_token")) catalogLogin.mutate();
  }, []);

  const entries = useMemo(() => buildSalesInventoryEntries({ sales: Array.isArray(sales) ? sales : [], catalogOrders: Array.isArray(catalogOrders.data) ? catalogOrders.data as SalesInventoryCatalogOrder[] : [], products: Array.isArray(products) ? products : [], recipes: Array.isArray(recipes) ? recipes : [] }), [sales, catalogOrders.data, products, recipes]);
  const filteredEntries = useMemo(() => filterSalesInventoryEntries(entries, period, referenceDate), [entries, period, referenceDate]);
  const total = useMemo(() => summarizeSalesInventory(filteredEntries), [filteredEntries]);
  const sourceSummaries = useMemo(() => (Object.keys(sourceLabels) as InventorySource[]).map(source => ({ source, summary: summarizeSalesInventory(filteredEntries.filter(entry => entry.source === source)) })), [filteredEntries]);
  const invoices = useMemo(() => Object.values(filteredEntries.reduce<Record<string, { id: string; date: string; source: InventorySource; revenue: number; cost: number; profit: number; known: boolean }>>((result, entry) => {
    const current = result[entry.invoiceId] || { id: entry.invoiceId, date: entry.date, source: entry.source, revenue: 0, cost: 0, profit: 0, known: true };
    current.revenue += entry.revenue;
    current.cost += entry.cost;
    current.profit += entry.costKnown ? entry.profit : 0;
    current.known = current.known && entry.costKnown;
    result[entry.invoiceId] = current;
    return result;
  }, {})).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [filteredEntries]);
  const permanentSaleTombstones = new Set(Array.isArray(deletedSalesIds) ? deletedSalesIds : []);
  const safeArchivedSales = (Array.isArray(archivedSales) ? archivedSales : []).filter(item => !permanentSaleTombstones.has(item.sale.id));
  const activeSales = Array.isArray(sales) ? sales : [];
  const activeProducts = Array.isArray(products) ? products : [];
  const allCatalogOrders = Array.isArray(catalogOrders.data) ? catalogOrders.data as SalesInventoryCatalogOrder[] : [];
  const archivedCatalogOrders = allCatalogOrders.filter(order => Boolean(order.archivedAt));

  const archiveDirectSale = async (saleId: string) => {
    const sale = activeSales.find(item => item.id === saleId);
    if (!sale) return toast.error("لم أجد الفاتورة في سجل المبيعات الحالي");
    if (!confirm(`استبعاد الفاتورة ${sale.id} من المبيعات والأرباح والمخزون؟ ستُعاد الكميات غير المرتجعة ويُعكس رصيد النقاط المتبقي إن أمكن. يمكنك استعادة الفاتورة من الأرشيف.`)) return;
    const archiveId = `${sale.id}-${Date.now()}`;
    const points = getOutstandingSalePoints(sale);
    let pointsReversed = 0;
    if (points > 0 && sale.customerName?.trim() && (sale.customerCode?.trim() || sale.customerPhone?.trim())) {
      try {
        if (!sessionStorage.getItem("abu_catalog_admin_token")) await catalogLogin.mutateAsync();
        const result = await reverseDirectSaleLoyalty.mutateAsync({ returnId: `ARCH-${archiveId}`, saleId: sale.id, customerName: sale.customerName, phone: sale.customerPhone || undefined, customerCode: sale.customerCode || undefined, points });
        if (!result.profile) throw new Error("لم يتم العثور على ملف الولاء المرتبط بالفاتورة؛ لم تتم الأرشفة");
        pointsReversed = result.pointsReversed;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "تعذر عكس نقاط الولاء؛ لم تُؤرشف الفاتورة");
        return;
      }
    }
    const stockRestored: Record<string, number> = {};
    (sale.items || []).forEach((item, index) => {
      if (!item.productId) return;
      const product = activeProducts.find(candidate => candidate.id === item.productId);
      if (!product) return;
      const quantity = getOutstandingSaleQuantity(sale, index);
      const amount = getPackageStockDeduction(product, item.selectedUnitType || item.unit || "", quantity);
      if (amount > 0) stockRestored[item.productId] = (stockRestored[item.productId] || 0) + amount;
    });
    setProducts(current => (Array.isArray(current) ? current : []).map(product => {
      const amount = stockRestored[product.id] || 0;
      if (!amount) return product;
      const next = Number(product.availableQuantity ?? product.quantity ?? 0) + amount;
      return { ...product, availableQuantity: next, quantity: next };
    }));
    setSales(current => (Array.isArray(current) ? current : []).filter(item => item.id !== sale.id));
    setArchivedSales(current => addArchivedSale(Array.isArray(current) ? current : [], { archiveId, archivedAt: new Date().toISOString(), pointsReversed, stockRestored, sale }));
    toast.success(`تم استبعاد الفاتورة ${sale.id}. يمكنك استعادتها من الأرشيف.`);
  };

  const restoreDirectSale = async (archived: ArchivedSale) => {
    const sale = archived.sale;
    if (!confirm(`استعادة الفاتورة ${sale.id} إلى المبيعات والأرباح؟ ستُخصم من المخزون الكميات التي أُعيدت عند الأرشفة، وتُستعاد نقاط الولاء المعكوسة.`)) return;
    if (archived.pointsReversed > 0 && sale.customerName?.trim() && (sale.customerCode?.trim() || sale.customerPhone?.trim())) {
      try {
        if (!sessionStorage.getItem("abu_catalog_admin_token")) await catalogLogin.mutateAsync();
        const result = await restoreDirectSaleLoyalty.mutateAsync({ restoreId: archived.archiveId, saleId: sale.id, customerName: sale.customerName, phone: sale.customerPhone || undefined, customerCode: sale.customerCode || undefined, points: archived.pointsReversed });
        if (!result.profile) throw new Error("لم يتم العثور على ملف الولاء لاستعادة النقاط؛ بقيت الفاتورة في الأرشيف");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "تعذرت استعادة نقاط الولاء؛ لم تُستعد الفاتورة");
        return;
      }
    }
    setProducts(current => (Array.isArray(current) ? current : []).map(product => {
      const amount = archived.stockRestored[product.id] || 0;
      if (!amount) return product;
      const next = Math.max(0, Number(product.availableQuantity ?? product.quantity ?? 0) - amount);
      return { ...product, availableQuantity: next, quantity: next };
    }));
    setSales(current => [...(Array.isArray(current) ? current : []).filter(item => item.id !== sale.id), sale]);
    setArchivedSales(current => removeArchivedSale(Array.isArray(current) ? current : [], sale.id));
    toast.success(`تمت استعادة الفاتورة ${sale.id}`);
  };

  const permanentlyDeleteDirectSale = (archived: ArchivedSale) => {
    if (!confirm(`حذف الفاتورة ${archived.sale.id} نهائيًا من الأرشيف؟ لن يمكن استعادتها، وستبقى تسوية المخزون والنقاط التي تمت عند الأرشفة كما هي.`)) return;
    setDeletedSalesIds(current => Array.from(new Set([...(Array.isArray(current) ? current : []), archived.sale.id])));
    setArchivedSales(current => removeArchivedSale(Array.isArray(current) ? current : [], archived.sale.id));
    toast.success(`تم حذف الفاتورة ${archived.sale.id} نهائيًا من الأرشيف`);
  };

  const archiveCatalog = async (order: SalesInventoryCatalogOrder) => {
    if (!confirm(`استبعاد طلب الكتالوج ${order.id} من المبيعات والأرباح؟ ستُعكس نقاط الولاء المتبقية إن وجدت، ويمكنك استعادته من الأرشيف.`)) return;
    try {
      const result = await archiveCatalogOrder.mutateAsync({ id: order.id });
      await catalogOrders.refetch();
      toast.success(`تم استبعاد الطلب ${order.id}${result.pointsReversed ? ` وعكس ${result.pointsReversed} نقطة` : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذرت أرشفة الطلب");
    }
  };

  const restoreCatalog = async (order: SalesInventoryCatalogOrder) => {
    if (!confirm(`استعادة طلب الكتالوج ${order.id} إلى المبيعات والأرباح؟`)) return;
    try {
      const result = await restoreCatalogOrder.mutateAsync({ id: order.id });
      await catalogOrders.refetch();
      toast.success(`تمت استعادة الطلب ${order.id}${result.pointsRestored ? ` واستعادة ${result.pointsRestored} نقطة` : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذرت استعادة الطلب");
    }
  };

  const permanentlyDeleteCatalog = async (order: SalesInventoryCatalogOrder) => {
    if (!confirm(`حذف طلب الكتالوج ${order.id} نهائيًا؟ لن يظهر في سجل الطلبات ولن يمكن استعادته.`)) return;
    try {
      await deleteCatalogOrder.mutateAsync({ id: order.id });
      await catalogOrders.refetch();
      toast.success(`تم حذف الطلب ${order.id} نهائيًا`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الحذف النهائي؛ يمكن حذف الطلب بعد أرشفته فقط");
    }
  };

  return <main className="min-h-screen bg-slate-50 p-4 pb-20" dir="rtl"><div className="mx-auto max-w-7xl space-y-6">
    <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-slate-800 to-emerald-800 p-6 text-white shadow-xl"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-black"><BarChart3 className="ml-1 h-3.5 w-3.5" />جرد ذكي شامل</span><h1 className="mt-3 text-3xl font-black">جرد المبيعات والأرباح</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">يجمع المبيعات المباشرة وفواتير الكتالوج المسلّمة، ويفصل أرباح المنتجات والتركيبات والكتالوج بالجنيه والنسبة.</p></div><Button variant="outline" onClick={() => navigate("/dashboard")} className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="ml-2 h-4 w-4" />العودة للرئيسية</Button></div></header>
    <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="text-emerald-600" />فترة الجرد</CardTitle><CardDescription>اختر الفترة المطلوبة؛ الإجمالي يعرض كل ما هو مسجل حتى الآن.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">{(["all", "daily", "weekly", "monthly"] as InventoryPeriod[]).map(option => <button key={option} onClick={() => setPeriod(option)} className={`rounded-xl px-3 py-3 text-sm font-black transition ${period === option ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-emerald-50"}`}>{({ all: "إجمالي", daily: "يومي", weekly: "أسبوعي", monthly: "شهري" } as Record<InventoryPeriod, string>)[option]}</button>)}</div>{period !== "all" && <input type={period === "monthly" ? "month" : "date"} value={period === "monthly" ? referenceDate.slice(0, 7) : referenceDate} onChange={event => setReferenceDate(period === "monthly" ? `${event.target.value}-01` : event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" />}</CardContent></Card>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={WalletCards} title="إجمالي المبيعات" value={currency(total.revenue)} className="text-blue-700" /><Metric icon={TrendingUp} title="تكلفة مؤكدة" value={currency(total.cost)} className="text-orange-700" /><Metric icon={BarChart3} title="صافي ربح مؤكد" value={currency(total.profit)} className={total.profit >= 0 ? "text-emerald-700" : "text-red-700"} /><Metric icon={ReceiptText} title="نسبة الربح" value={`${total.profitPercent.toFixed(2)}%`} className="text-violet-700" /></section>
    {total.unknownCostRevenue > 0 && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><p><strong>تنبيه دقة:</strong> توجد مبيعات بقيمة {currency(total.unknownCostRevenue)} ليس لها تكلفة مسجلة للصنف، لذلك لا تدخل في الربح المؤكد. سجّل تكلفة المنتج أو التركيبة لتظهر أرباحها بدقة.</p></div>}
    <section className="grid gap-4 lg:grid-cols-3">{sourceSummaries.map(({ source, summary }) => <Card key={source} className="border-0 shadow-sm"><CardHeader className="pb-3"><CardTitle className={`inline-flex w-fit rounded-full px-3 py-1 text-sm ring-1 ${sourceColors[source]}`}>{sourceLabels[source]}</CardTitle><CardDescription>{summary.invoiceCount} فاتورة أو عملية بيع في الفترة المختارة</CardDescription></CardHeader><CardContent><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">المبيعات</dt><dd className="mt-1 font-black text-slate-900">{currency(summary.revenue)}</dd></div><div><dt className="text-slate-500">التكلفة</dt><dd className="mt-1 font-black text-slate-900">{currency(summary.cost)}</dd></div><div><dt className="text-slate-500">الربح</dt><dd className="mt-1 font-black text-emerald-700">{currency(summary.profit)}</dd></div><div><dt className="text-slate-500">النسبة</dt><dd className="mt-1 font-black text-violet-700">{summary.profitPercent.toFixed(2)}%</dd></div></dl></CardContent></Card>)}</section>
    <Card className="border-0 shadow-sm"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><ReceiptText className="text-slate-700" />الفواتير وعمليات البيع في الفترة</CardTitle><CardDescription>أرشف الفاتورة التجريبية لاستبعادها من التقارير مع إمكانية استعادتها لاحقًا. الأرشفة تعيد المخزون غير المرتجع وتعكس نقاط الولاء المتبقية إن أمكن.</CardDescription></div><Button type="button" variant={showArchived ? "default" : "outline"} onClick={() => setShowArchived(value => !value)}><Archive className="ml-2 h-4 w-4" />{showArchived ? "إخفاء الأرشيف" : `الأرشيف (${safeArchivedSales.length + archivedCatalogOrders.length})`}</Button></div></CardHeader><CardContent>{invoices.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">لا توجد عمليات بيع مسجلة في هذه الفترة.</div> : <div className="overflow-x-auto"><table className="min-w-full text-right text-sm"><thead className="border-b text-xs text-slate-500"><tr><th className="p-3">الفاتورة</th><th className="p-3">المصدر</th><th className="p-3">التاريخ</th><th className="p-3">المبيعات</th><th className="p-3">التكلفة</th><th className="p-3">الربح</th><th className="p-3">إجراء</th></tr></thead><tbody>{invoices.map(invoice => <tr key={invoice.id} className="border-b border-slate-100"><td className="p-3 font-black text-slate-900">{invoice.id}</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${sourceColors[invoice.source]}`}>{sourceLabels[invoice.source]}</span></td><td className="p-3 text-slate-600">{new Date(invoice.date).toLocaleDateString("ar-EG")}</td><td className="p-3 font-bold">{currency(invoice.revenue)}</td><td className="p-3 font-bold">{invoice.known ? currency(invoice.cost) : "تكلفة ناقصة"}</td><td className="p-3 font-black text-emerald-700">{invoice.known ? currency(invoice.profit) : "—"}</td><td className="p-3">{invoice.id.startsWith("CAT-") ? (() => { const order = allCatalogOrders.find(item => item.id === invoice.id.slice(4)); return order ? <Button size="sm" variant="outline" disabled={archiveCatalogOrder.isPending} onClick={() => archiveCatalog(order)}><Archive className="ml-1 h-3.5 w-3.5" />أرشفة</Button> : null; })() : <Button size="sm" variant="outline" disabled={reverseDirectSaleLoyalty.isPending} onClick={() => archiveDirectSale(invoice.id)}><Archive className="ml-1 h-3.5 w-3.5" />أرشفة</Button>}</td></tr>)}</tbody></table></div>}</CardContent></Card>
    {showArchived && <Card className="border-0 border-amber-200 bg-amber-50/40 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Archive className="text-amber-700" />العناصر المؤرشفة</CardTitle><CardDescription>استعد كل عنصر وحده، أو احذفه نهائيًا. الحذف النهائي غير قابل للاستعادة.</CardDescription></CardHeader><CardContent className="space-y-3">{safeArchivedSales.map(item => <article key={item.archiveId} className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-900">فاتورة {item.sale.id} <span className="text-xs font-medium text-slate-500">· مبيعات مباشرة</span></p><p className="mt-1 text-xs text-slate-600">{new Date(item.sale.date).toLocaleString("ar-EG")} · {currency(Number(item.sale.total || 0))} · أُرشفت {new Date(item.archivedAt).toLocaleDateString("ar-EG")}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => restoreDirectSale(item)} disabled={restoreDirectSaleLoyalty.isPending}><RotateCcw className="ml-1 h-3.5 w-3.5" />استعادة</Button><Button size="sm" variant="destructive" onClick={() => permanentlyDeleteDirectSale(item)}><Trash2 className="ml-1 h-3.5 w-3.5" />حذف نهائي</Button></div></article>)}{archivedCatalogOrders.map(order => <article key={order.id} className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-900">طلب كتالوج {order.id} <span className="text-xs font-medium text-slate-500">· {order.customerName}</span></p><p className="mt-1 text-xs text-slate-600">{new Date(order.createdAt).toLocaleString("ar-EG")} · {currency(Number(order.totalAmount || 0))} · أُرشف {order.archivedAt ? new Date(order.archivedAt).toLocaleDateString("ar-EG") : ""}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => restoreCatalog(order)} disabled={restoreCatalogOrder.isPending}><RotateCcw className="ml-1 h-3.5 w-3.5" />استعادة</Button><Button size="sm" variant="destructive" onClick={() => permanentlyDeleteCatalog(order)} disabled={deleteCatalogOrder.isPending}><Trash2 className="ml-1 h-3.5 w-3.5" />حذف نهائي</Button></div></article>)}{safeArchivedSales.length + archivedCatalogOrders.length === 0 && <div className="rounded-xl border border-dashed border-amber-300 p-8 text-center text-sm text-amber-900">لا توجد عناصر مؤرشفة. عند أرشفة فاتورة ستظهر هنا لتختار استعادتها أو حذفها نهائيًا.</div>}</CardContent></Card>}
  </div></main>;
}

function Metric({ icon: Icon, title, value, className }: { icon: typeof BarChart3; title: string; value: string; className: string }) {
  return <Card className="border-0 shadow-sm"><CardContent className="p-5"><Icon className={`h-6 w-6 ${className}`} /><p className="mt-4 text-xs font-bold text-slate-500">{title}</p><p className={`mt-1 text-xl font-black ${className}`}>{value}</p></CardContent></Card>;
}
