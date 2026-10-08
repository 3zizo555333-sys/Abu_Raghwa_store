import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Barcode, Plus, Printer, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCloudProducts } from "@/lib/supabase/useProducts";
import { createCloudInvoice, createInvoiceIdempotencyKey, listCloudInvoices, type CloudInvoice, type CreateInvoiceInput } from "@/lib/supabase/invoices";
import type { CloudProduct } from "@/lib/supabase/products";
import { getContentUnit, getSalePriceForUnit, getSaleUnitOptions } from "@/lib/packageUnits";
import Cashier from "@/pages/Cashier";
import { toast } from "sonner";

type SaleItem = { productId: string; productName: string; selectedUnitType: string; quantity: number; unitPrice: number; total: number };
type PendingInvoice = { idempotencyKey: string; payload: CreateInvoiceInput };
const PAGE_SIZE = 20;

function getProductUnitPrice(product: CloudProduct, saleType: CreateInvoiceInput["saleType"], selectedUnit: string) {
  const base = saleType === "wholesale"
    ? product.wholesaleRetailPrice || product.retailPrice
    : saleType === "bulk"
      ? product.bulkPrice || product.wholesaleRetailPrice || product.retailPrice
      : product.retailPrice;
  return getSalePriceForUnit(product, base, selectedUnit);
}

export default function Sales() {
  const [, navigate] = useLocation();
  const [saleMode, setSaleMode] = useState<"choose" | "normal" | "cashier">("choose");
  const [showSalesList, setShowSalesList] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const cloudProducts = useCloudProducts({ search: productSearch, pageSize: 40 });
  const products = cloudProducts.products as CloudProduct[];
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saleType, setSaleType] = useState<CreateInvoiceInput["saleType"]>("retail");
  const [paymentMethod, setPaymentMethod] = useState<CreateInvoiceInput["paymentMethod"]>("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [attemptLocked, setAttemptLocked] = useState(false);
  const pendingInvoiceRef = useRef<PendingInvoice | null>(null);

  const [invoices, setInvoices] = useState<CloudInvoice[] | null>(null);
  const [nextInvoiceOffset, setNextInvoiceOffset] = useState<number | null>(0);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const initialInvoiceLoadAttemptedRef = useRef(false);

  useEffect(() => {
    if (!attemptLocked) return;
    const warnAboutPendingInvoice = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnAboutPendingInvoice);
    return () => window.removeEventListener("beforeunload", warnAboutPendingInvoice);
  }, [attemptLocked]);

  const selectedProductRow = products.find(product => product.id === selectedProduct);
  const availableUnits = selectedProductRow ? getSaleUnitOptions(selectedProductRow) : [];
  const subTotal = useMemo(() => saleItems.reduce((sum, item) => sum + item.total, 0), [saleItems]);
  const parsedDiscount = Number(discountValue) || 0;
  const discountAmount = discountType === "percent"
    ? subTotal * Math.min(100, Math.max(0, parsedDiscount)) / 100
    : Math.min(subTotal, Math.max(0, parsedDiscount));
  const totalAmount = Math.max(0, subTotal - discountAmount);

  const loadInvoices = useCallback(async (reset: boolean) => {
    if (isLoadingInvoices) return;
    const offset = reset ? 0 : nextInvoiceOffset;
    if (offset === null) return;
    setIsLoadingInvoices(true);
    setInvoiceError("");
    try {
      const page = await listCloudInvoices(offset, PAGE_SIZE);
      setInvoices(current => reset ? page.items : [...(current ?? []), ...page.items]);
      setNextInvoiceOffset(page.nextOffset);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تحميل سجل الفواتير من السحابة.";
      setInvoiceError(message);
      toast.error(message);
    } finally {
      setIsLoadingInvoices(false);
    }
  }, [isLoadingInvoices, nextInvoiceOffset]);

  useEffect(() => {
    if (showSalesList && invoices === null && !isLoadingInvoices && !initialInvoiceLoadAttemptedRef.current) {
      initialInvoiceLoadAttemptedRef.current = true;
      void loadInvoices(true);
    }
  }, [showSalesList, invoices, isLoadingInvoices, loadInvoices]);

  const handleAddProduct = () => {
    if (attemptLocked) return;
    const product = products.find(item => item.id === selectedProduct);
    if (!product) return toast.error("اختر منتجًا محمّلًا من البحث السحابي.");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return toast.error("أدخل كمية صحيحة أولًا.");
    if (!selectedUnit) return toast.error("اختر وحدة البيع أولًا.");
    const unitPrice = getProductUnitPrice(product, saleType, selectedUnit);
    const line: SaleItem = { productId: product.id, productName: product.name, selectedUnitType: selectedUnit, quantity: qty, unitPrice, total: qty * unitPrice };
    setSaleItems(current => [...current, line]);
    setSelectedProduct("");
    setSelectedUnit("");
    setQuantity("");
  };

  const handleCompleteSale = async () => {
    if (isSaving) return;
    if (!pendingInvoiceRef.current && !saleItems.length) return toast.error("أضف منتجًا واحدًا على الأقل للفاتورة.");
    if (!pendingInvoiceRef.current) {
      const discount = discountType === "percent" ? Math.min(100, Math.max(0, Number(discountValue) || 0)) : Math.max(0, Number(discountValue) || 0);
      let idempotencyKey: string;
      try {
        idempotencyKey = createInvoiceIdempotencyKey();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "تعذر إنشاء مفتاح آمن للفاتورة.");
        return;
      }
      const payload: CreateInvoiceInput = {
        idempotencyKey,
        items: saleItems.map(item => ({ productId: item.productId, quantity: item.quantity, selectedUnitType: item.selectedUnitType })),
        saleType,
        paymentMethod,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        discountType,
        discountValue: discount,
      };
      pendingInvoiceRef.current = { idempotencyKey: payload.idempotencyKey, payload };
      setAttemptLocked(true);
    }

    setIsSaving(true);
    try {
      const created = await createCloudInvoice(pendingInvoiceRef.current.payload);
      // The in-memory key is discarded only after the atomic RPC returns a confirmed invoice.
      pendingInvoiceRef.current = null;
      setAttemptLocked(false);
      setSaleItems([]);
      setPaymentMethod("cash");
      setCustomerName("");
      setCustomerPhone("");
      setSaleType("retail");
      setDiscountType("percent");
      setDiscountValue("");
      toast.success(`تم تأكيد الفاتورة ${created.invoice_number} من الخادم.`);
      navigate(`/invoice?invoiceId=${encodeURIComponent(created.invoice_id)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تأكيد الفاتورة من الخادم.";
      toast.error(`${message} لم تُفرّغ السلة؛ أعد المحاولة دون تعديلها، ولا تغلق الصفحة قبل التأكيد.`);
    } finally {
      setIsSaving(false);
    }
  };

  if (saleMode === "cashier") return <Cashier onBackToSalesChoice={() => setSaleMode("normal")} />;

  if (saleMode === "choose") return <main className="min-h-screen bg-slate-50 p-4" dir="rtl"><div className="mx-auto max-w-4xl"><header className="mb-7 flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-orange-600">تسجيل مبيعة</p><h1 className="text-3xl font-black text-slate-950">اختر طريقة البيع</h1><p className="mt-2 text-sm text-slate-600">كل إتمام بيع يمر عبر عملية Supabase الذرية نفسها للفواتير والمخزون.</p></div><Button variant="outline" disabled={attemptLocked || isSaving} onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-1 h-4 w-4" />العودة</Button></header><div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">المرتجعات والتركيبات ونقاط الولاء غير متاحة هنا؛ لا توجد لها عملية Supabase ذرية معتمدة، لذلك لن نسجلها محليًا أو ندّعي حفظها.</div><div className="grid gap-5 md:grid-cols-2"><button onClick={() => setSaleMode("normal")} className="rounded-3xl border-2 border-blue-100 bg-white p-7 text-right shadow-sm transition hover:border-blue-400 hover:shadow-lg"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-100 text-blue-700"><Printer className="h-7 w-7" /></div><h2 className="mt-5 text-2xl font-black">بيع عادي</h2><p className="mt-2 leading-7 text-slate-600">اختيار المنتجات والوحدات والكمية والخصم وبيانات العميل.</p><span className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2 font-bold text-white">فتح البيع العادي</span></button><button onClick={() => setSaleMode("cashier")} className="rounded-3xl border-2 border-orange-100 bg-white p-7 text-right shadow-sm transition hover:border-orange-400 hover:shadow-lg"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-orange-100 text-orange-700"><Barcode className="h-7 w-7" /></div><h2 className="mt-5 text-2xl font-black">بيع كاشير</h2><p className="mt-2 leading-7 text-slate-600">بيع سريع بالباركود والبحث السحابي والسلة.</p><span className="mt-6 inline-flex rounded-xl bg-orange-600 px-4 py-2 font-bold text-white">فتح بيع الكاشير</span></button></div></div></main>;

  return <main className="min-h-screen bg-slate-50 p-4" dir="rtl"><div className="mx-auto max-w-6xl"><header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-black text-slate-950">نظام المبيعات</h1><p className="mt-1 text-sm text-slate-600">الفواتير والمخزون يُعتمدان من Supabase فقط.</p></div><div className="flex gap-2"><Button variant="outline" disabled={attemptLocked || isSaving} onClick={() => { setShowSalesList(false); setSaleMode("choose"); }}>اختر نوع البيع</Button><Button variant={showSalesList ? "default" : "outline"} disabled={attemptLocked || isSaving} onClick={() => setShowSalesList(value => !value)}>سجل الفواتير</Button><Button variant="outline" disabled={attemptLocked || isSaving} onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-1 h-4 w-4" />العودة</Button></div></header>
    {showSalesList ? <section className="rounded-2xl bg-white p-5 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">سجل الفواتير السحابية</h2><p className="mt-1 text-sm text-slate-500">تُحمّل الفواتير على دفعات، وتُقرأ تفاصيل البنود من العرض الآمن بحسب صلاحية الحساب.</p></div><Button variant="outline" disabled={isLoadingInvoices} onClick={() => { setInvoices(null); setNextInvoiceOffset(0); void loadInvoices(true); }}>تحديث السجل</Button></div><div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">إرجاع الفواتير وحذفها غير متاحين: لا توجد عملية ذرية معتمدة للمرتجعات أو الحذف، ولن تُجرى كتابة محلية بديلة.</div>{invoiceError && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{invoiceError}</p>}{isLoadingInvoices && invoices === null ? <p className="py-10 text-center text-slate-500">جاري تحميل الفواتير...</p> : !invoices?.length ? <p className="py-10 text-center text-slate-500">لا توجد فواتير سحابية لعرضها.</p> : <div className="space-y-3">{invoices.map(invoice => <article key={invoice.invoiceId} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-slate-900">{invoice.customerName || "عميل عام"}</p><p className="mt-1 text-sm text-slate-500">{new Date(invoice.date).toLocaleString("ar-EG")} · {invoice.id}</p></div><p className="text-lg font-black text-emerald-700">{invoice.total.toFixed(2)} ج.م</p></div><p className="mt-2 text-sm text-slate-600">{invoice.items.length} بند · {invoice.status === "completed" ? "مكتملة" : invoice.status}</p><div className="mt-3 space-y-1 text-sm">{invoice.items.map((item, index) => <p key={`${invoice.invoiceId}-${index}`} className="text-slate-700">{item.productName} — {item.quantity} {item.selectedUnitType} × {item.unitPrice.toFixed(2)} = {item.total.toFixed(2)} ج.م</p>)}</div><Button size="sm" variant="outline" className="mt-3" onClick={() => navigate(`/invoice?invoiceId=${encodeURIComponent(invoice.invoiceId)}`)}>عرض الفاتورة</Button></article>)}</div>}{nextInvoiceOffset !== null && invoices && invoices.length > 0 && <Button className="mt-4 w-full" variant="outline" disabled={isLoadingInvoices} onClick={() => void loadInvoices(false)}>{isLoadingInvoices ? "جاري التحميل..." : "تحميل فواتير أخرى"}</Button>}</section> : <><section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">البيع بالتركيبات/الوصفات والولاء والمرتجعات غير مدعوم بعملية Supabase ذرية في هذا المسار، لذا عُطّل بدل تسجيل بيانات محلية أو إظهار نجاح غير مؤكد.</section><div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]"><section className="space-y-4"><div className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-3 font-black">بيانات الفاتورة</h2><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">اسم العميل<input value={customerName} disabled={attemptLocked} onChange={event => setCustomerName(event.target.value)} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label><label className="text-sm font-bold">رقم الهاتف<input value={customerPhone} disabled={attemptLocked} onChange={event => setCustomerPhone(event.target.value)} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label><label className="text-sm font-bold">نوع البيع<select value={saleType} disabled={attemptLocked} onChange={event => setSaleType(event.target.value as CreateInvoiceInput["saleType"])} className="mt-1 w-full rounded-lg border p-2"><option value="retail">تجزئة</option><option value="wholesale">قطاعي</option><option value="bulk">جملة</option></select></label><label className="text-sm font-bold">طريقة الدفع<select value={paymentMethod} disabled={attemptLocked} onChange={event => setPaymentMethod(event.target.value as CreateInvoiceInput["paymentMethod"])} className="mt-1 w-full rounded-lg border p-2"><option value="cash">نقدًا</option><option value="card">بطاقة</option><option value="check">شيك</option><option value="bank_transfer">تحويل بنكي</option><option value="other">أخرى</option></select></label></div></div><div className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-3 font-black">إضافة منتج</h2><label className="relative block"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><input type="search" value={productSearch} disabled={attemptLocked} onChange={event => setProductSearch(event.target.value)} placeholder="ابحث بالاسم أو الكود أو الباركود" className="w-full rounded-lg border py-2 pl-3 pr-9" /></label><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-sm font-bold">المنتج<select value={selectedProduct} disabled={attemptLocked || cloudProducts.isLoading} onChange={event => { const product = products.find(item => item.id === event.target.value); setSelectedProduct(event.target.value); setSelectedUnit(product ? getContentUnit(product) : ""); }} className="mt-1 w-full rounded-lg border p-2"><option value="">اختر منتجًا</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label className="text-sm font-bold">وحدة البيع<select value={selectedUnit} disabled={attemptLocked || !selectedProduct} onChange={event => setSelectedUnit(event.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">اختر الوحدة</option>{availableUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label><label className="text-sm font-bold">الكمية<input type="number" min="0.001" step="any" value={quantity} disabled={attemptLocked} onChange={event => setQuantity(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label><div className="flex items-end"><Button disabled={attemptLocked} onClick={handleAddProduct} className="w-full"><Plus className="ml-1 h-4 w-4" />إضافة للسلة</Button></div></div>{cloudProducts.isLoading && <p className="mt-3 text-sm text-slate-500">جاري البحث في المنتجات السحابية...</p>}{cloudProducts.isError && <p className="mt-3 text-sm text-red-700">تعذر جلب المنتجات من السحابة. تحقق من الاتصال ثم أعد المحاولة.</p>}{cloudProducts.hasNextPage && <Button variant="outline" disabled={cloudProducts.isFetchingNextPage} onClick={() => void cloudProducts.fetchNextPage()} className="mt-3 w-full">{cloudProducts.isFetchingNextPage ? "جاري التحميل..." : "تحميل مزيد من المنتجات"}</Button>}</div>{saleItems.length > 0 && <div className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-3 font-black">بنود الفاتورة</h2><div className="space-y-2">{saleItems.map((item, index) => <div key={`${item.productId}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-3"><div><p className="font-bold">{item.productName}</p><p className="text-xs text-slate-500">{item.quantity} {item.selectedUnitType} × {item.unitPrice.toFixed(2)} ج.م</p></div><div className="flex items-center gap-2"><b>{item.total.toFixed(2)} ج.م</b><Button size="icon" variant="ghost" disabled={attemptLocked} onClick={() => setSaleItems(current => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="حذف بند"><Trash2 className="h-4 w-4 text-red-600" /></Button></div></div>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">نوع الخصم<select value={discountType} disabled={attemptLocked} onChange={event => setDiscountType(event.target.value as "percent" | "fixed")} className="mt-1 w-full rounded-lg border p-2"><option value="percent">نسبة مئوية</option><option value="fixed">قيمة ثابتة</option></select></label><label className="text-sm font-bold">قيمة الخصم<input type="number" min="0" step="0.01" value={discountValue} disabled={attemptLocked} onChange={event => setDiscountValue(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label></div><div className="mt-4 space-y-1 border-t pt-3 text-sm"><p className="flex justify-between"><span>إجمالي المنتجات</span><b>{subTotal.toFixed(2)} ج.م</b></p>{discountAmount > 0 && <p className="flex justify-between text-red-700"><span>الخصم</span><b>−{discountAmount.toFixed(2)} ج.م</b></p>}<p className="flex justify-between text-lg font-black"><span>الإجمالي</span><span className="text-emerald-700">{totalAmount.toFixed(2)} ج.م</span></p></div><Button onClick={handleCompleteSale} disabled={isSaving || !saleItems.length} className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700"><Printer className="ml-2 h-4 w-4" />{isSaving ? "بانتظار تأكيد الخادم..." : attemptLocked ? "إعادة المحاولة بنفس الفاتورة" : "تأكيد البيع وطباعة الفاتورة"}</Button>{attemptLocked && <p className="mt-2 text-center text-xs text-amber-800">لم يؤكد الخادم الفاتورة بعد. أعد المحاولة بالسلة المجمدة نفسها؛ لا تُغيّر البنود.</p>}</div>}</section><aside className="rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600"><h2 className="font-black text-slate-900">تأكيد البيع بأمان</h2><p className="mt-2">لا يُسجّل النجاح إلا بعد رد عملية Supabase الذرية التي تحفظ الفاتورة وبنودها وحركات المخزون وتخصم الرصيد.</p><p className="mt-2">عند انقطاع الشبكة تبقى السلة كما هي ويُعاد استخدام مفتاح الطلب الموجود في ذاكرة الصفحة.</p></aside></div></>}</div></main>;
}
