import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import { listProductsPage, type CloudProduct, type ProductCursor } from "@/lib/supabase/products";

type StockAlert = { product: CloudProduct; threshold: number; severity: "critical" | "warning" };
const PAGE_SIZE = 100;

export default function InventoryAlerts() {
  const [, navigate] = useLocation();
  const [products, setProducts] = useState<CloudProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<ProductCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async (cursor: ProductCursor | null, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const page = await listProductsPage({ cursor, limit: PAGE_SIZE });
      setProducts(current => {
        if (!append) return page.items;
        const merged = new Map(current.map(product => [product.id, product]));
        for (const product of page.items) merged.set(product.id, product);
        return Array.from(merged.values());
      });
      setTotal(page.total);
      setHasMore(page.has_more);
      setNextCursor(page.next_cursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل المنتجات من Supabase.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { void loadProducts(null, false); }, [loadProducts]);

  const alerts = useMemo<StockAlert[]>(() => products
    .filter(product => product.quantity <= Math.max(lowStockThreshold, product.minQuantity))
    .map(product => {
      const threshold = Math.max(lowStockThreshold, product.minQuantity);
      return { product, threshold, severity: product.quantity === 0 ? "critical" : "warning" };
    }), [products, lowStockThreshold]);
  const criticalCount = alerts.filter(alert => alert.severity === "critical").length;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">تنبيهات المخزون</h1>
            <p className="mt-1 text-gray-600">الكمية والحد الأدنى من سجل المنتجات السحابي</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")} className="flex items-center gap-2"><ArrowLeft className="h-4 w-4" />العودة</Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <Card className="mb-8 border-0 shadow-sm">
          <CardHeader><CardTitle>حد التنبيه العام</CardTitle><CardDescription>يُستخدم الحد الأكبر بين هذا الرقم والحد الأدنى المحفوظ لكل منتج في Supabase. الاختيار هنا مؤقت لهذه الصفحة ولا يُخزّن على الجهاز.</CardDescription></CardHeader>
          <CardContent className="flex items-center gap-4">
            <input aria-label="حد المخزون" type="range" min="1" max="20" value={lowStockThreshold} onChange={event => setLowStockThreshold(Number(event.target.value))} className="flex-1" />
            <span className="w-12 text-lg font-bold text-orange-600">{lowStockThreshold}</span>
            <Button type="button" variant="outline" onClick={() => void loadProducts(null, false)} disabled={loading}><RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button>
          </CardContent>
        </Card>

        {error && <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button type="button" variant="outline" onClick={() => void loadProducts(null, false)}>إعادة المحاولة</Button></div>}

        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-0 shadow-sm"><CardContent className="pt-6"><p className="text-sm text-gray-600">تنبيهات المنتجات المحمّلة</p><p className="text-3xl font-bold text-red-600">{alerts.length}</p></CardContent></Card>
          <Card className="border-0 shadow-sm"><CardContent className="pt-6"><p className="text-sm text-gray-600">نفد مخزونها</p><p className="text-3xl font-bold text-orange-600">{criticalCount}</p></CardContent></Card>
          <Card className="border-0 shadow-sm"><CardContent className="pt-6"><p className="text-sm text-gray-600">المنتجات المحمّلة</p><p className="text-3xl font-bold text-blue-600">{products.length} / {total}</p></CardContent></Card>
        </div>

        <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">تنبيه ركود المبيعات غير معروض هنا إلى حين توفر تجميع تاريخي موثوق من دفتر المخزون السحابي؛ لا تُستخدم مبيعات محفوظة في المتصفح.</div>

        {loading && products.length === 0 ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />جارٍ تحميل المنتجات من Supabase…</div> : alerts.length === 0 ? <Card className="border-0 shadow-sm"><CardContent className="py-12 text-center text-gray-600">{products.length === 0 ? "لا توجد منتجات مسجلة في السجل السحابي." : "لا توجد منتجات ناقصة ضمن المنتجات المحمّلة."}</CardContent></Card> : <div className="space-y-3">
          {alerts.map(({ product, threshold, severity }) => <Card key={product.id} className={`border-0 shadow-sm ${severity === "critical" ? "border-l-4 border-l-red-500 bg-red-50" : "border-l-4 border-l-orange-500 bg-orange-50"}`}>
            <CardContent className="flex items-center justify-between gap-4 py-5">
              <div><h3 className="text-lg font-semibold">{product.name}</h3><p className="mt-1 text-sm text-gray-600">الفئة: {product.category || "بدون فئة"} · الكمية الحالية: <strong>{product.quantity}</strong> · حد التنبيه: <strong>{threshold}</strong></p></div>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${severity === "critical" ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"}`}><AlertTriangle className="h-4 w-4" />{severity === "critical" ? "نفد المخزون" : "مخزون منخفض"}</span>
            </CardContent>
          </Card>)}
        </div>}

        {hasMore && nextCursor && <div className="mt-6 flex justify-center"><Button type="button" variant="outline" onClick={() => void loadProducts(nextCursor, true)} disabled={loadingMore}>{loadingMore && <LoaderCircle className="ml-2 h-4 w-4 animate-spin" />}تحميل منتجات إضافية</Button></div>}
      </main>
    </div>
  );
}
