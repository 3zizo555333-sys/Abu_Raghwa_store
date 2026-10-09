import { browserState } from "@/lib/browserState";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import { withPasswordProtection } from "@/components/withPasswordProtection";
import { toast } from "sonner";
import { hideReportItem, parseHiddenReportItems, restoreReportItem, type HiddenReportItem } from "@/lib/reportDisplayCleanup";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { buildLoyaltyRanking } from "@/lib/loyaltyReport";
import { buildCustomerProfitabilityReport, type CustomerProfitabilityRow } from "@/lib/customerProfitability";
import { loadCloudReportData, type CloudReportData } from "@/lib/supabase/reports";

interface ReportData {
  totalSales: number;
  totalRevenue: number;
  averageOrderValue: number;
  topProducts: Array<{ name: string; sold: number; revenue: number }>;
  loyaltyProducts: Array<{ name: string; sold: number; points: number }>;
  customerProfitability: CustomerProfitabilityRow[];
  paymentMethods: Record<string, number>;
  dailySales: Record<string, number>;
}

const HIDDEN_REPORT_ITEMS_KEY = "abu_raghwa_hidden_report_items";
const loadHiddenReportItems = () => {
  try {
    return parseHiddenReportItems(browserState.get(HIDDEN_REPORT_ITEMS_KEY));
  } catch {
    return [];
  }
};

const reportDisplayId = (section: string, ...parts: string[]) => `${section}:${parts.map(part => encodeURIComponent(part)).join(":")}`;

function RemoveReportItemButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="h-8 shrink-0 gap-1 px-2 text-xs text-red-700 hover:bg-red-50 hover:text-red-800" aria-label={`مسح ${label} من العرض`} title={`مسح ${label} من العرض`}>
    <Trash2 className="h-3.5 w-3.5" />مسح
  </Button>;
}

function ReportsContent() {
  const [, navigate] = useLocation();
  const [hiddenReportItems, setHiddenReportItems] = useState<HiddenReportItem[]>(loadHiddenReportItems);
  const [selectedCustomerCode, setSelectedCustomerCode] = useState("");
  const [reportLoading, setReportLoading] = useState(true);

  const [reportData, setReportData] = useState<ReportData>({
    totalSales: 0,
    totalRevenue: 0,
    averageOrderValue: 0,
    topProducts: [],
    loyaltyProducts: [],
    customerProfitability: [],
    paymentMethods: {},
    dailySales: {}
  });

  useEffect(() => {
    try {
      browserState.set(HIDDEN_REPORT_ITEMS_KEY, JSON.stringify(hiddenReportItems));
    } catch (error) {
      console.error("Failed to save hidden report display items locally:", error);
      toast.error("تعذر حفظ إعدادات عرض التقارير على هذا الجهاز.");
    }
  }, [hiddenReportItems]);

  useEffect(() => {
    let cancelled = false;
    setReportLoading(true);
    loadCloudReportData().then(data => {
      if (!cancelled) generateReport(data);
    }).catch(error => {
      if (!cancelled) toast.error(error instanceof Error ? error.message : "تعذر تحميل بيانات التقارير السحابية.");
    }).finally(() => {
      if (!cancelled) setReportLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const generateReport = (cloudData: CloudReportData) => {
    const sales = cloudData.sales as any[];
    const products = cloudData.products as any[];
    const recipes = cloudData.recipes as any[];

    // Calculate basic stats
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);
    const averageOrderValue = sales.length > 0 ? totalRevenue / sales.length : 0;

    // Calculate top products
    const productSales: Record<string, { sold: number; revenue: number }> = {};
    sales.forEach(sale => {
      sale.items.forEach((item: any) => {
        if (!productSales[item.productName]) {
          productSales[item.productName] = { sold: 0, revenue: 0 };
        }
        productSales[item.productName].sold += item.quantity;
        productSales[item.productName].revenue += item.total;
      });
    });

    const topProducts = Object.entries(productSales)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const loyaltyProducts = buildLoyaltyRanking(sales, products as any, recipes as any);
    const customerProfitability = buildCustomerProfitabilityReport({ sales: sales as any, catalogOrders: cloudData.catalogOrders as any, products: products as any, recipes: recipes as any, customers: cloudData.customers as any, rewards: cloudData.rewards as any, giftDeliveries: cloudData.giftDeliveries as any });
    if (!selectedCustomerCode && customerProfitability[0]?.customerCode) setSelectedCustomerCode(customerProfitability[0].customerCode);

    // Calculate payment methods
    const paymentMethods: Record<string, number> = {};
    sales.forEach(sale => {
      paymentMethods[sale.paymentMethod] = (paymentMethods[sale.paymentMethod] || 0) + sale.total;
    });

    // Calculate daily sales
    const dailySales: Record<string, number> = {};
    sales.forEach(sale => {
      const date = sale.date.split(" ")[0];
      dailySales[date] = (dailySales[date] || 0) + sale.total;
    });

    setReportData({
      totalSales: sales.length,
      totalRevenue,
      averageOrderValue,
      topProducts,
      loyaltyProducts,
      customerProfitability,
      paymentMethods,
      dailySales
    });
  };

  const handleExportPDF = () => {
    const hiddenIds = new Set(hiddenReportItems.map(item => item.id));
    const isVisible = (id: string) => !hiddenIds.has(id);
    const lines = ["تقرير المبيعات - أبو رغوة", "================================"];
    if (isVisible(reportDisplayId("summary", "sales-count"))) lines.push(`إجمالي المبيعات: ${reportData.totalSales}`);
    if (isVisible(reportDisplayId("summary", "revenue"))) lines.push(`إجمالي الإيرادات: ${reportData.totalRevenue.toFixed(2)} ج.م`);
    if (isVisible(reportDisplayId("summary", "average-order"))) lines.push(`متوسط قيمة الطلب: ${reportData.averageOrderValue.toFixed(2)} ج.م`);
    if (isVisible(reportDisplayId("section", "top-products"))) {
      lines.push("", "أفضل المنتجات:");
      reportData.topProducts.filter(product => isVisible(reportDisplayId("top-product", product.name))).forEach(product => lines.push(`${product.name}: ${product.sold} وحدة - ${product.revenue.toFixed(2)} ج.م`));
    }
    if (isVisible(reportDisplayId("section", "loyalty-products"))) {
      lines.push("", "أكثر الأصناف توليدًا لنقاط الولاء:");
      reportData.loyaltyProducts.filter(product => isVisible(reportDisplayId("loyalty-product", product.name))).forEach(product => lines.push(`${product.name}: ${product.sold} وحدة - ${product.points} نقطة`));
    }
    if (isVisible(reportDisplayId("section", "daily-sales"))) {
      lines.push("", "المبيعات حسب اليوم:");
      Object.entries(reportData.dailySales).filter(([date]) => isVisible(reportDisplayId("daily-sales", date))).sort(([a], [b]) => b.localeCompare(a)).forEach(([date, amount]) => lines.push(`${date}: ${Number(amount).toFixed(2)} ج.م`));
    }
    if (isVisible(reportDisplayId("section", "payment-methods"))) {
      lines.push("", "طرق الدفع:");
      Object.entries(reportData.paymentMethods).filter(([method]) => isVisible(reportDisplayId("payment-method", method))).forEach(([method, amount]) => lines.push(`${method}: ${amount.toFixed(2)} ج.م`));
    }
    if (isVisible(reportDisplayId("section", "customer-profitability"))) {
      lines.push("", "ربحية العملاء:");
      reportData.customerProfitability.filter(customer => isVisible(reportDisplayId("customer", customer.customerCode || customer.name))).forEach(customer => lines.push(`${customer.name} (${customer.customerCode}): إيراد ${customer.revenue.toFixed(2)} - تكلفة ${customer.cost.toFixed(2)} - ربح صافٍ بعد الهدايا ${customer.netProfitAfterGifts.toFixed(2)} ج.م`));
    }
    const content = lines.join("\n");

    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(content));
    element.setAttribute("download", "report.txt");
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success("تم تنزيل التقرير");
  };

  const removeReportItemFromView = (id: string, label: string) => {
    if (!confirm(`مسح «${label}» من صفحة التقارير فقط؟ ستبقى الفواتير والمبيعات الأصلية كما هي، ويمكنك استعادته لاحقًا.`)) return;
    setHiddenReportItems(current => hideReportItem(current, { id, label }));
    toast.success(`تم مسح «${label}» من العرض فقط`);
  };

  const restoreOneReportItem = (id: string) => {
    setHiddenReportItems(current => restoreReportItem(current, id));
    toast.success("تمت استعادة العنصر إلى صفحة التقارير");
  };

  const restoreAllReportItems = () => {
    setHiddenReportItems([]);
    toast.success("تمت استعادة جميع العناصر المخفية");
  };

  const hiddenReportIds = new Set(hiddenReportItems.map(item => item.id));
  const isReportItemVisible = (id: string) => !hiddenReportIds.has(id);
  const removeButton = (id: string, label: string) => <RemoveReportItemButton label={label} onRemove={() => removeReportItemFromView(id, label)} />;
  const visibleTopProducts = reportData.topProducts.filter(product => isReportItemVisible(reportDisplayId("top-product", product.name)));
  const visibleLoyaltyProducts = reportData.loyaltyProducts.filter(product => isReportItemVisible(reportDisplayId("loyalty-product", product.name)));
  const visibleCustomers = reportData.customerProfitability.filter(customer => isReportItemVisible(reportDisplayId("customer", customer.customerCode || customer.name)));
  const visiblePaymentMethods = Object.entries(reportData.paymentMethods).filter(([method]) => isReportItemVisible(reportDisplayId("payment-method", method)));
  const visibleDailySales = Object.entries(reportData.dailySales).filter(([date]) => isReportItemVisible(reportDisplayId("daily-sales", date)));
  const selectedCustomer = visibleCustomers.find(customer => customer.customerCode === selectedCustomerCode) || visibleCustomers[0];
  const loyaltyProfitTotals = reportData.customerProfitability.reduce((totals, customer) => ({ revenue: totals.revenue + customer.revenue, cost: totals.cost + customer.cost, grossProfit: totals.grossProfit + customer.grossProfit, gifts: totals.gifts + customer.deliveredGiftCost, net: totals.net + customer.netProfitAfterGifts }), { revenue: 0, cost: 0, grossProfit: 0, gifts: 0, net: 0 });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">التقارير</h1>
            <p className="text-gray-600 mt-1">تحليل المبيعات والأداء — تنظيف الفواتير وإخراجها من الأرباح يتم من جرد المبيعات والأرباح، حيث يمكنك أرشفتها واستعادتها أو حذفها نهائيًا.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/advanced-reports")} className="flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              تنظيف الفواتير
            </Button>
            <Button
              onClick={handleExportPDF}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              تحميل التقرير
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              العودة
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-4">
        {reportLoading && <Card className="mb-4 border-0 shadow-sm"><CardContent className="py-4 text-center text-sm text-gray-600">جارٍ تحميل بيانات التقارير من Supabase...</CardContent></Card>}
        {hiddenReportItems.length > 0 && <Card className="mb-4 border-0 border-r-4 border-r-amber-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 py-3">
            <div><CardTitle className="text-base">عناصر مخفية من العرض ({hiddenReportItems.length})</CardTitle><CardDescription>الإخفاء لا يحذف أي فاتورة أو مبيعات؛ يمكنك استعادة العناصر متى أردت.</CardDescription></div>
            <Button type="button" variant="outline" size="sm" onClick={restoreAllReportItems} className="shrink-0">استعادة الكل</Button>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            {hiddenReportItems.map(item => <div key={item.id} className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs text-amber-950"><span>{item.label}</span><Button type="button" variant="ghost" size="sm" onClick={() => restoreOneReportItem(item.id)} className="h-7 px-2 text-amber-800">استعادة</Button></div>)}
          </CardContent>
        </Card>}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {isReportItemVisible(reportDisplayId("summary", "sales-count")) && <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between pb-2"><CardTitle className="text-xs font-medium text-gray-600">إجمالي المبيعات</CardTitle>{removeButton(reportDisplayId("summary", "sales-count"), "إجمالي المبيعات")}</CardHeader>
            <CardContent className="py-2"><p className="text-2xl font-bold text-gray-900">{reportData.totalSales}</p></CardContent>
          </Card>}
          {isReportItemVisible(reportDisplayId("summary", "revenue")) && <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between pb-2"><CardTitle className="text-xs font-medium text-gray-600">إجمالي الإيرادات</CardTitle>{removeButton(reportDisplayId("summary", "revenue"), "إجمالي الإيرادات")}</CardHeader>
            <CardContent className="py-2"><p className="text-2xl font-bold text-green-600">{reportData.totalRevenue.toFixed(2)} ج.م</p></CardContent>
          </Card>}
          {isReportItemVisible(reportDisplayId("summary", "average-order")) && <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between pb-2"><CardTitle className="text-xs font-medium text-gray-600">متوسط قيمة الطلب</CardTitle>{removeButton(reportDisplayId("summary", "average-order"), "متوسط قيمة الطلب")}</CardHeader>
            <CardContent className="py-2"><p className="text-2xl font-bold text-blue-600">{reportData.averageOrderValue.toFixed(2)} ج.م</p></CardContent>
          </Card>}
        </div>

        {/* Top Products */}
        {isReportItemVisible(reportDisplayId("section", "top-products")) && <Card className="border-0 shadow-sm mb-4">
          <CardHeader className="flex flex-row items-center justify-between gap-3 py-2">
            <div><CardTitle className="text-lg">أفضل 5 منتجات</CardTitle><CardDescription className="text-xs">المنتجات الأكثر مبيعاً</CardDescription></div>
            {removeButton(reportDisplayId("section", "top-products"), "تحليل أفضل المنتجات بالكامل")}
          </CardHeader>
          <CardContent className="py-2">
            {visibleTopProducts.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-xs">
                {reportData.topProducts.length === 0 ? "لا توجد بيانات مبيعات حتى الآن" : "تم مسح عناصر هذا التحليل من العرض"}
              </div>
            ) : (
              <div className="space-y-2">
                {visibleTopProducts.map((product, index) => (
                  <div key={product.name} className="flex items-center justify-between gap-2 pb-2 border-b last:border-b-0">
                    <div className="flex-1">
                      <p className="font-medium text-xs text-gray-900">{product.name}</p>
                      <p className="text-xs text-gray-600">
                        {product.sold} وحدة مباعة
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xs text-green-600">{product.revenue.toFixed(2)} ج.م</p>
                      <div className="w-32 bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{
                            width: `${(product.revenue / reportData.totalRevenue) * 100}%`
                          }}
                        />
                      </div>
                    </div>
                    {removeButton(reportDisplayId("top-product", product.name), `منتج ${product.name}`)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>}

        {isReportItemVisible(reportDisplayId("section", "loyalty-products")) && <Card className="mb-4 border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div><CardTitle>أكثر المنتجات والتركيبات توليدًا للنقاط</CardTitle><CardDescription>يعتمد التقرير على الفواتير المسجلة في البيع العادي والكاشير، ولا يظهر الصنف إذا كانت نقاطه صفرًا أو غير محددة.</CardDescription></div>
            {removeButton(reportDisplayId("section", "loyalty-products"), "تحليل نقاط المنتجات بالكامل")}
          </CardHeader>
          <CardContent>
            {visibleLoyaltyProducts.length === 0 ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{reportData.loyaltyProducts.length === 0 ? "لا توجد نقاط مكتسبة مسجلة بعد. أضف نقاطًا لبعض المنتجات أو التركيبات ثم سجّل فواتير باسم العميل." : "تم مسح عناصر هذا التحليل من العرض"}</p> : <div className="space-y-2">{visibleLoyaltyProducts.map((item, index) => <div key={item.name} className="flex items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50/60 p-3"><div><p className="font-bold text-gray-900">{index + 1}. {item.name}</p><p className="text-xs text-gray-500">{item.sold} وحدة مباعة</p></div><strong className="text-amber-700">{item.points} نقطة</strong>{removeButton(reportDisplayId("loyalty-product", item.name), `منتج نقاط ${item.name}`)}</div>)}</div>}
          </CardContent>
        </Card>}

        {isReportItemVisible(reportDisplayId("section", "customer-profitability")) && <Card className="mb-4 border-0 shadow-sm border-t-4 border-t-purple-500">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div><CardTitle className="text-lg text-purple-900">تحليل ربحية عملاء الولاء</CardTitle><CardDescription>متابعة العميل من أول شراء حتى الهدية: الإيراد، جملة التكلفة، الربح، تكلفة الهدايا، وصافي النتيجة.</CardDescription></div>
            {removeButton(reportDisplayId("section", "customer-profitability"), "تحليل ربحية العملاء بالكامل")}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {isReportItemVisible(reportDisplayId("loyalty-metric", "revenue")) && <div className="flex items-start justify-between gap-1 rounded-xl bg-blue-50 p-2"><div><span className="text-[11px] text-blue-700 block">إيراد العملاء</span><strong className="text-blue-900">{loyaltyProfitTotals.revenue.toFixed(2)} ج.م</strong></div>{removeButton(reportDisplayId("loyalty-metric", "revenue"), "إيراد العملاء")}</div>}
              {isReportItemVisible(reportDisplayId("loyalty-metric", "cost")) && <div className="flex items-start justify-between gap-1 rounded-xl bg-slate-50 p-2"><div><span className="text-[11px] text-slate-700 block">جملة التكلفة</span><strong className="text-slate-900">{loyaltyProfitTotals.cost.toFixed(2)} ج.م</strong></div>{removeButton(reportDisplayId("loyalty-metric", "cost"), "جملة التكلفة")}</div>}
              {isReportItemVisible(reportDisplayId("loyalty-metric", "gross")) && <div className="flex items-start justify-between gap-1 rounded-xl bg-green-50 p-2"><div><span className="text-[11px] text-green-700 block">الربح قبل الهدايا</span><strong className="text-green-900">{loyaltyProfitTotals.grossProfit.toFixed(2)} ج.م</strong></div>{removeButton(reportDisplayId("loyalty-metric", "gross"), "الربح قبل الهدايا")}</div>}
              {isReportItemVisible(reportDisplayId("loyalty-metric", "gifts")) && <div className="flex items-start justify-between gap-1 rounded-xl bg-orange-50 p-2"><div><span className="text-[11px] text-orange-700 block">تكلفة الهدايا</span><strong className="text-orange-900">{loyaltyProfitTotals.gifts.toFixed(2)} ج.م</strong></div>{removeButton(reportDisplayId("loyalty-metric", "gifts"), "تكلفة الهدايا")}</div>}
              {isReportItemVisible(reportDisplayId("loyalty-metric", "net")) && <div className={`flex items-start justify-between gap-1 rounded-xl p-2 ${loyaltyProfitTotals.net >= 0 ? "bg-emerald-50" : "bg-red-50"}`}><div><span className="text-[11px] block">الصافي بعد الهدايا</span><strong className={loyaltyProfitTotals.net >= 0 ? "text-emerald-900" : "text-red-900"}>{loyaltyProfitTotals.net.toFixed(2)} ج.م</strong></div>{removeButton(reportDisplayId("loyalty-metric", "net"), "الصافي بعد الهدايا")}</div>}
            </div>
            {visibleCustomers.length === 0 ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{reportData.customerProfitability.length === 0 ? "لا توجد فواتير مرتبطة بعملاء ولاء بعد. اكتب اسم العميل وكوده في الكاشير أو البيع العادي، أو استخدم كود العميل في طلب الكتالوج." : "تم مسح العملاء من العرض. يمكنك استعادة أي عنصر من قائمة العناصر المخفية أعلى الصفحة."}</p> : <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-4">
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {visibleCustomers.map(customer => {
                  const id = reportDisplayId("customer", customer.customerCode || customer.name);
                  return <div key={id} className="flex items-center gap-1">
                    <button type="button" onClick={() => setSelectedCustomerCode(customer.customerCode)} className={`min-w-0 flex-1 text-right rounded-xl border p-3 transition ${selectedCustomer?.customerCode === customer.customerCode ? "border-purple-500 bg-purple-50" : "border-gray-200 bg-white hover:border-purple-300"}`}>
                      <div className="flex justify-between gap-2"><strong className="text-gray-900">{customer.name}</strong><span className="text-xs font-bold text-purple-700">{customer.currentPoints} نقطة</span></div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600"><span>كود: {customer.customerCode || "—"}</span><span>{customer.purchaseCount} فاتورة</span><span className={customer.netProfitAfterGifts >= 0 ? "text-green-700" : "text-red-700"}>صافي: {customer.netProfitAfterGifts.toFixed(2)} ج.م</span></div>
                    </button>
                    {removeButton(id, `العميل ${customer.name}`)}
                  </div>;
                })}
              </div>
              {selectedCustomer && <div className="rounded-2xl border border-purple-100 bg-white p-4 space-y-3">
                <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-black text-gray-900">تفاصيل {selectedCustomer.name}</h3><p className="text-xs text-gray-500">الكود: {selectedCustomer.customerCode || "غير موجود"} {selectedCustomer.phone ? `• ${selectedCustomer.phone}` : "• بدون هاتف"}</p></div>{isReportItemVisible(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "points")) && <div className="flex items-center gap-1 text-left"><div><span className="text-[11px] text-gray-500 block">النقاط الحالية</span><strong className="text-xl text-purple-700">{selectedCustomer.currentPoints}</strong></div>{removeButton(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "points"), "النقاط الحالية للعميل")}</div>}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {isReportItemVisible(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "revenue")) && <div className="flex items-start justify-between gap-1 bg-blue-50 rounded-lg p-2">الإيراد<br/><strong>{selectedCustomer.revenue.toFixed(2)} ج.م</strong>{removeButton(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "revenue"), "إيراد العميل")}</div>}
                  {isReportItemVisible(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "cost")) && <div className="flex items-start justify-between gap-1 bg-slate-50 rounded-lg p-2">جملة التكلفة<br/><strong>{selectedCustomer.cost.toFixed(2)} ج.م</strong>{removeButton(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "cost"), "تكلفة العميل")}</div>}
                  {isReportItemVisible(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "gross")) && <div className="flex items-start justify-between gap-1 bg-green-50 rounded-lg p-2">الربح<br/><strong>{selectedCustomer.grossProfit.toFixed(2)} ج.م</strong>{removeButton(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "gross"), "ربح العميل")}</div>}
                  {isReportItemVisible(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "net")) && <div className={`flex items-start justify-between gap-1 rounded-lg p-2 ${selectedCustomer.netProfitAfterGifts >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>الصافي بعد الهدية<br/><strong>{selectedCustomer.netProfitAfterGifts.toFixed(2)} ج.م</strong>{removeButton(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "net"), "صافي ربح العميل")}</div>}
                </div>
                {isReportItemVisible(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "reward-status")) && <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-purple-800">{selectedCustomer.currentReward ? `وصل لهدية: ${selectedCustomer.currentReward.giftName}` : "لم يصل إلى مستوى هدية بعد"}{selectedCustomer.nextReward ? ` • باقي ${selectedCustomer.pointsToNextReward} نقطة لهدية ${selectedCustomer.nextReward.giftName}` : ""}</p>{removeButton(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "reward-status"), "حالة هدايا العميل")}</div>}
                {isReportItemVisible(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "products-section")) && <div className="border-t pt-2"><div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-sm font-bold text-gray-800">الأصناف التي ساهمت في نقاطه</h4>{removeButton(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "products-section"), "قائمة أصناف العميل بالكامل")}</div>{selectedCustomer.products.filter(product => isReportItemVisible(reportDisplayId("customer-product", selectedCustomer.customerCode || selectedCustomer.name, product.name))).length === 0 ? <p className="text-xs text-gray-500">لا توجد تفاصيل أصناف ظاهرة لهذا العميل.</p> : <div className="space-y-1">{selectedCustomer.products.filter(product => isReportItemVisible(reportDisplayId("customer-product", selectedCustomer.customerCode || selectedCustomer.name, product.name))).map(product => <div key={product.name} className="flex items-center justify-between gap-2 border-b last:border-b-0 py-1"><div className="flex justify-between gap-2 text-xs"><span>{product.name} × {product.quantity}</span><span className="text-left">{product.points} نقطة • بيع {product.revenue.toFixed(2)} • تكلفة {product.cost.toFixed(2)} • ربح {product.profit.toFixed(2)} ج.م</span></div>{removeButton(reportDisplayId("customer-product", selectedCustomer.customerCode || selectedCustomer.name, product.name), `صنف ${product.name} للعميل`)}</div>)}</div>}</div>}
                {selectedCustomer.gifts.length > 0 && isReportItemVisible(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "gifts-section")) && <div className="border-t pt-2"><div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-sm font-bold text-gray-800">الهدايا المسلّمة</h4>{removeButton(reportDisplayId("customer-detail", selectedCustomer.customerCode || selectedCustomer.name, "gifts-section"), "قائمة هدايا العميل بالكامل")}</div>{selectedCustomer.gifts.filter((gift, index) => isReportItemVisible(reportDisplayId("customer-gift", selectedCustomer.customerCode || selectedCustomer.name, gift.giftName, String(index)))).map((gift, index) => <div key={`${gift.giftName}-${index}`} className="flex items-center justify-between gap-2 border-b last:border-b-0 text-xs py-1"><span>{gift.giftName} ({gift.pointsDeducted} نقطة) • تكلفة {gift.giftCost.toFixed(2)} ج.م</span>{removeButton(reportDisplayId("customer-gift", selectedCustomer.customerCode || selectedCustomer.name, gift.giftName, String(index)), `هدية ${gift.giftName} للعميل`)}</div>)}</div>}
              </div>}
            </div>}
          </CardContent>
        </Card>}

        {isReportItemVisible(reportDisplayId("section", "daily-sales")) && <Card className="mb-4 border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 py-2">
            <div><CardTitle className="text-lg">المبيعات حسب اليوم</CardTitle><CardDescription className="text-xs">إجمالي قيمة المبيعات لكل يوم مسجل</CardDescription></div>
            {removeButton(reportDisplayId("section", "daily-sales"), "تحليل المبيعات اليومية بالكامل")}
          </CardHeader>
          <CardContent className="py-2">
            {visibleDailySales.length === 0 ? <p className="py-4 text-center text-xs text-gray-500">{Object.keys(reportData.dailySales).length === 0 ? "لا توجد بيانات يومية بعد" : "تم مسح الأيام من العرض"}</p> : <div className="space-y-2">{visibleDailySales.sort(([a], [b]) => b.localeCompare(a)).map(([date, amount]) => <div key={date} className="flex items-center justify-between gap-2 border-b pb-2 last:border-b-0"><span className="text-sm font-medium">{date}</span><strong className="text-sm text-green-700">{Number(amount).toFixed(2)} ج.م</strong>{removeButton(reportDisplayId("daily-sales", date), `مبيعات يوم ${date}`)}</div>)}</div>}
          </CardContent>
        </Card>}

        {/* Payment Methods */}
        {isReportItemVisible(reportDisplayId("section", "payment-methods")) && <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 py-2">
            <div><CardTitle className="text-lg">طرق الدفع</CardTitle><CardDescription className="text-xs">توزيع المبيعات حسب طريقة الدفع</CardDescription></div>
            {removeButton(reportDisplayId("section", "payment-methods"), "تحليل طرق الدفع بالكامل")}
          </CardHeader>
          <CardContent className="py-2">
            {visiblePaymentMethods.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-xs">
                {Object.keys(reportData.paymentMethods).length === 0 ? "لا توجد بيانات حتى الآن" : "تم مسح طرق الدفع من العرض"}
              </div>
            ) : (
              <div className="space-y-2">
                {visiblePaymentMethods.map(([method, amount]) => (
                  <div key={method} className="flex items-center justify-between gap-2 pb-2 border-b last:border-b-0">
                    <div className="capitalize font-medium text-xs text-gray-900">
                      {({ cash: "نقدًا", card: "بطاقة", check: "شيك", transfer: "تحويل بنكي" } as Record<string, string>)[method] || method}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xs text-blue-600">{(amount as number).toFixed(2)} ج.م</p>
                      <p className="text-xs text-gray-600">
                        {((amount as number / reportData.totalRevenue) * 100).toFixed(1)}%
                      </p>
                    </div>
                    {removeButton(reportDisplayId("payment-method", method), `طريقة الدفع ${method}`)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>}
      </main>
    </div>
  );
}

export default withPasswordProtection(ReportsContent, 'reports', 'التقارير');
