import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Barcode, Camera, Check, Minus, Plus, Search, ShoppingCart, Trash2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdvancedBarcodeScanner } from "@/components/AdvancedBarcodeScanner";
import { useCloudProducts } from "@/lib/supabase/useProducts";
import type { CloudProduct } from "@/lib/supabase/products";
import { acknowledgeInvoiceIntent, completeInvoiceIntent, createCloudInvoice, createInvoiceIdempotencyKey, getRecoverableInvoiceIntent, type CreateInvoiceInput } from "@/lib/supabase/invoices";
import { findProductsByBarcode, normalizeBarcodeToken } from "@/lib/barcodes";
import { getContentUnit } from "@/lib/packageUnits";
import { getCashierQuantityStep, normalizeCashierQuantity } from "@/lib/cashierQuantity";
import { toast } from "sonner";
import { useScaleConnection } from "@/lib/scaleConnection";

type Product = CloudProduct;
type CartItem = { productId: string; name: string; quantity: number; unitPrice: number; total: number; unit: string };
type PendingInvoice = { idempotencyKey: string; payload: CreateInvoiceInput };

export default function Cashier({ onBackToSalesChoice }: { onBackToSalesChoice?: () => void } = {}) {
  const [, navigate] = useLocation();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcode, setBarcode] = useState("");
  const [barcodeLookup, setBarcodeLookup] = useState("");
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeChoices, setBarcodeChoices] = useState<Product[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [attemptLocked, setAttemptLocked] = useState(true);
  const [scaleProductId, setScaleProductId] = useState("");
  const pendingInvoiceRef = useRef<PendingInvoice | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const scale = useScaleConnection("kg");

  const productsQuery = useCloudProducts({ search, pageSize: 50 });
  const barcodeQuery = useCloudProducts({ barcode: barcodeLookup, pageSize: 50, enabled: Boolean(barcodeLookup) });
  const products = productsQuery.products as Product[];
  const barcodeProducts = barcodeQuery.products as Product[];
  const total = cart.reduce((sum, item) => sum + item.total, 0);

  useEffect(() => {
    if (!attemptLocked) return;
    const warnAboutPendingInvoice = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnAboutPendingInvoice);
    return () => window.removeEventListener("beforeunload", warnAboutPendingInvoice);
  }, [attemptLocked]);

  useEffect(() => { codeInputRef.current?.focus(); }, []);

  useEffect(() => {
    let active = true;
    const recoverPendingInvoice = async () => {
      try {
        const intent = await getRecoverableInvoiceIntent();
        if (!active) return;
        if (!intent) {
          setAttemptLocked(false);
          return;
        }

        setAttemptLocked(true);
        setIsSaving(true);
        const created = intent.state === "completed" && intent.invoiceResult
          ? intent.invoiceResult
          : await completeInvoiceIntent(intent.intentId);
        try {
          if (intent.state !== "acknowledged") await acknowledgeInvoiceIntent(intent.intentId);
        } catch {
          toast.message("أكد الخادم الفاتورة؛ سيُستكمل تأكيد الاستلام السحابي عند عودة الاتصال.");
        }
        if (!active) return;
        toast.success(`استُعيدت الفاتورة ${created.invoice_number} بأمان من Supabase.`);
        navigate(`/invoice?invoiceId=${encodeURIComponent(created.invoice_id)}`);
      } catch (error) {
        if (!active) return;
        setAttemptLocked(true);
        const message = error instanceof Error ? error.message : "تعذر التحقق من محاولة البيع السابقة.";
        toast.error(`توجد محاولة بيع لم تُحسم بعد. لم نبدأ فاتورة جديدة؛ أعد تحميل الصفحة بعد استعادة الاتصال. ${message}`);
      } finally {
        if (active) setIsSaving(false);
      }
    };
    void recoverPendingInvoice();
    return () => { active = false; };
  }, [navigate]);

  useEffect(() => {
    const code = normalizeBarcodeToken(barcodeLookup);
    if (!code || barcodeQuery.isLoading || barcodeQuery.isFetching) return;
    if (barcodeQuery.isError) {
      setBarcodeLookup("");
      toast.error("تعذر البحث عن الباركود في Supabase. تحقّق من الاتصال ثم أعد المحاولة.");
      return;
    }
    const matches = findProductsByBarcode(barcodeProducts, code).length
      ? findProductsByBarcode(barcodeProducts, code)
      : barcodeProducts.filter(product => normalizeBarcodeToken(product.plu ?? "") === code);
    setBarcodeLookup("");
    if (!matches.length) {
      toast.error("لم أجد منتجًا بهذا الباركود ضمن نتائج البحث السحابي. سجّل الكود الأساسي أو ابحث باسم المنتج.");
      return;
    }
    if (matches.length > 1) {
      setBarcodeChoices(matches);
      toast.message(`هذا الباركود مرتبط بأكثر من منتج (${matches.length}). اختر المنتج المقصود.`);
      return;
    }
    addProduct(matches[0]);
    toast.success(`تمت إضافة ${matches[0].name} إلى السلة.`);
    // addProduct is stable for the current render; query completion is keyed to a unique lookup value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcodeLookup, barcodeQuery.data, barcodeQuery.isLoading, barcodeQuery.isFetching]);

  const addProductWithQuantity = (product: Product, requestedQuantity = 1) => {
    if (attemptLocked) return;
    const unitPrice = Number(product.retailPrice) || 0;
    if (unitPrice <= 0) return toast.error("سعر التجزئة لهذا المنتج غير مسجل.");
    const unit = getContentUnit(product);
    const quantity = Math.max(0.001, requestedQuantity);
    setCart(current => {
      const existing = current.find(item => item.productId === product.id);
      return existing
        ? current.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + quantity, total: (item.quantity + quantity) * item.unitPrice } : item)
        : [...current, { productId: product.id, name: product.name, quantity, unitPrice, total: quantity * unitPrice, unit }];
    });
    setBarcodeChoices([]);
    setBarcode("");
    setSearch("");
    codeInputRef.current?.focus();
  };
  const addProduct = (product: Product) => addProductWithQuantity(product, 1);

  const beginBarcodeLookup = (rawCode: string) => {
    if (attemptLocked || !rawCode.trim()) return;
    setBarcodeChoices([]);
    setBarcodeLookup(rawCode.trim());
  };

  const updateQuantity = (productId: string, rawQuantity: number) => {
    if (attemptLocked) return;
    const quantity = normalizeCashierQuantity(rawQuantity);
    setCart(current => quantity <= 0
      ? current.filter(item => item.productId !== productId)
      : current.map(item => item.productId === productId ? { ...item, quantity, total: item.unitPrice * quantity } : item));
  };
  const quantityStep = (item: CartItem) => getCashierQuantityStep(item.unit);

  const completeSale = async () => {
    if (isSaving) return;
    if (!pendingInvoiceRef.current && !cart.length) return toast.error("أضف منتجًا واحدًا على الأقل للفاتورة.");
    if (!pendingInvoiceRef.current) {
      let idempotencyKey: string;
      try {
        idempotencyKey = createInvoiceIdempotencyKey();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "تعذر إنشاء مفتاح آمن للفاتورة.");
        return;
      }
      const payload: CreateInvoiceInput = {
        idempotencyKey,
        items: cart.map(item => ({ productId: item.productId, quantity: item.quantity, selectedUnitType: item.unit })),
        saleType: "retail",
        paymentMethod: "cash",
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        discountType: "fixed",
        discountValue: 0,
      };
      pendingInvoiceRef.current = { idempotencyKey: payload.idempotencyKey, payload };
      setAttemptLocked(true);
    }

    setIsSaving(true);
    try {
      const created = await createCloudInvoice(pendingInvoiceRef.current.payload);
      // Keep the idempotency key only in memory until the atomic RPC confirms the invoice.
      pendingInvoiceRef.current = null;
      setAttemptLocked(false);
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      toast.success(`أكد الخادم الفاتورة ${created.invoice_number}.`);
      navigate(`/invoice?invoiceId=${encodeURIComponent(created.invoice_id)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تأكيد الفاتورة من الخادم.";
      toast.error(`${message} لم تُفرّغ السلة؛ أعد المحاولة بالسلة نفسها ولا تغلق الصفحة قبل التأكيد.`);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredProducts = useMemo(() => products.slice(0, 16), [products]);

  return <main className="min-h-screen bg-slate-100 p-4" dir="rtl"><div className="mx-auto max-w-[1500px]"><header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-orange-600">وضع الكمبيوتر والكاشير</p><h1 className="text-3xl font-black text-slate-950">نقطة بيع أبو رغوة</h1></div><div className="flex gap-2"><Button variant="outline" disabled={attemptLocked || isSaving} onClick={() => navigate("/sales")}>المبيعات العادية</Button><Button variant="outline" disabled={attemptLocked || isSaving} onClick={() => navigate("/dashboard")}><ArrowRight className="ml-1 h-4 w-4" />عودة للوحة التحكم</Button></div></header><div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">نقاط الولاء والتركيبات والمرتجعات غير متاحة في هذا المسار لعدم وجود عملية Supabase ذرية لها؛ لا تُكتب هذه البيانات محليًا ولا يُدّعى حفظها.</div><div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]"><section className="space-y-4"><div className="rounded-3xl bg-slate-950 p-5 text-white shadow-lg"><div className="flex flex-wrap items-end gap-3"><div className="min-w-[240px] flex-1"><label className="text-xs font-black text-slate-300">امسح بالليزر أو اكتب الباركود ثم اضغط Enter</label><Input ref={codeInputRef} value={barcode} disabled={attemptLocked || Boolean(barcodeLookup)} onChange={event => { setBarcode(event.target.value); setBarcodeChoices([]); }} onKeyDown={event => event.key === "Enter" && beginBarcodeLookup(barcode)} placeholder="الباركود" dir="ltr" className="mt-2 h-13 border-white/20 bg-white text-left text-lg font-bold text-slate-950" /></div><Button onClick={() => beginBarcodeLookup(barcode)} disabled={attemptLocked || Boolean(barcodeLookup)} className="h-13 bg-orange-500 hover:bg-orange-600"><Barcode className="ml-2 h-5 w-5" />إضافة</Button><Button onClick={() => setScannerOpen(true)} disabled={attemptLocked} variant="outline" className="h-13 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Camera className="ml-2 h-5 w-5" />كاميرا باركود</Button></div><p className="mt-3 text-xs text-slate-300">يُبحث الباركود في النتائج السحابية المحدودة. قارئ USB أو Bluetooth يكتب الكود هنا تلقائيًا.</p>{barcodeLookup && barcodeQuery.isFetching && <p className="mt-3 text-sm text-orange-200">جاري البحث عن الباركود في المنتجات السحابية...</p>}{barcodeChoices.length > 0 && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-slate-950"><p className="text-sm font-black">هذا الباركود مرتبط بأكثر من منتج — اختر المنتج المقصود</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{barcodeChoices.map(product => <button key={product.id} type="button" disabled={attemptLocked} onClick={() => addProduct(product)} className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-white p-3 text-right text-slate-900 hover:bg-orange-50"><span className="min-w-0"><span className="block truncate font-black">{product.name}</span><span className="block truncate text-xs text-slate-500">{[product.barcode, ...(product.barcodes ?? [])].filter(Boolean).join(" · ")}</span></span><span className="shrink-0 font-bold text-orange-700">{product.retailPrice.toFixed(2)} ج.م</span></button>)}</div></div>}</div><div className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Search className="h-5 w-5 text-orange-600" /><h2 className="font-black">بحث واختيار المنتج</h2></div><Input value={search} disabled={attemptLocked} onChange={event => setSearch(event.target.value)} placeholder="اكتب اسم المنتج أو الكود" className="mt-3" />{productsQuery.isLoading ? <p className="mt-3 text-sm text-slate-500">جاري تحميل النتائج من Supabase...</p> : productsQuery.isError ? <p className="mt-3 text-sm text-red-700">تعذر تحميل المنتجات من السحابة. تحقق من الاتصال.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{filteredProducts.map(product => <button key={product.id} type="button" disabled={attemptLocked} onClick={() => addProduct(product)} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 p-3 text-right hover:border-orange-300 hover:bg-orange-50"><div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-orange-100">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <ShoppingCart className="h-5 w-5 text-orange-600" />}</div><div className="min-w-0"><p className="truncate font-black text-slate-900">{product.name}</p><p className="text-xs font-bold text-orange-700">{product.retailPrice.toFixed(2)} ج.م / {product.contentUnit}</p></div></button>)}</div>}{productsQuery.hasNextPage && <Button variant="outline" disabled={productsQuery.isFetchingNextPage} onClick={() => void productsQuery.fetchNextPage()} className="mt-3 w-full">{productsQuery.isFetchingNextPage ? "جاري التحميل..." : "تحميل منتجات أخرى"}</Button>}</div></section><aside className="rounded-3xl bg-white p-5 shadow-lg ring-1 ring-slate-200"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-orange-600">الفاتورة الحالية</p><h2 className="text-xl font-black">السلة</h2></div><ShoppingCart className="h-7 w-7 text-orange-600" /></div>{cart.length === 0 ? <p className="py-14 text-center text-sm text-slate-400">امسح باركود أو اختر منتجًا من النتائج السحابية.</p> : <div className="mt-4 space-y-3">{cart.map(item => <div key={item.productId} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{item.name}</p><p className="text-xs text-slate-500">{item.unitPrice.toFixed(2)} ج.م / {item.unit}</p></div><Button size="icon" variant="ghost" disabled={attemptLocked} onClick={() => updateQuantity(item.productId, 0)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button></div><div className="mt-3 flex items-center justify-between"><div className="flex items-center overflow-hidden rounded-lg border bg-white"><button disabled={attemptLocked} className="p-2 disabled:opacity-50" onClick={() => updateQuantity(item.productId, item.quantity - quantityStep(item))}><Minus className="h-4 w-4" /></button><input aria-label={`كمية ${item.name}`} type="number" min="0" step={item.unit === "كيلو" || item.unit === "جرام" || item.unit === "لتر" ? "any" : 1} inputMode="decimal" disabled={attemptLocked} value={item.quantity} onChange={event => updateQuantity(item.productId, Number(event.target.value))} className="w-24 border-x bg-white p-2 text-center font-black" /><button disabled={attemptLocked} className="p-2 text-orange-600 disabled:opacity-50" onClick={() => updateQuantity(item.productId, item.quantity + quantityStep(item))}><Plus className="h-4 w-4" /></button></div><p className="font-black text-orange-700">{item.total.toFixed(2)} ج.م</p></div></div>)}<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black text-emerald-950">الميزان الرقمي</p><p className="text-xs text-emerald-800">يدعم Web Serial على Chrome وأجهزة الميزان التي تعمل كلوحة مفاتيح.</p></div><Button type="button" variant="outline" onClick={() => scale.status === "connected" ? void scale.disconnect() : void scale.connect().catch(error => toast.error(error instanceof Error ? error.message : "تعذر ربط الميزان."))} className="border-emerald-300 bg-white text-emerald-800"><Scale className="ml-1 h-4 w-4" />{scale.status === "connected" ? "فصل الميزان" : "ربط الميزان"}</Button></div>
  {scale.status === "unsupported" && <p className="mt-2 text-xs text-amber-800">Web Serial غير متاح على هذا المتصفح. يمكن استخدام ميزان USB/Bluetooth يرسل الوزن كلوحة مفاتيح.</p>}
  {scale.status === "connected" && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><select value={scaleProductId} onChange={event => setScaleProductId(event.target.value)} className="h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm"><option value="">اختر المنتج الذي سيأخذ الوزن</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select><Button type="button" disabled={!scale.reading || !scaleProductId || !scale.reading.stable} onClick={() => { const product = products.find(item => item.id === scaleProductId); if (!product || !scale.reading) return; addProductWithQuantity(product, scale.reading.value); toast.success(`تمت إضافة ${scale.reading.value.toFixed(3)} كجم من ${product.name}`); }} className="bg-emerald-600 hover:bg-emerald-700">إضافة الوزن {scale.reading ? `${scale.reading.value.toFixed(3)} كجم` : "—"}</Button></div>}
  {scale.reading && <p className="mt-2 text-xs font-bold text-emerald-900">القراءة: {scale.reading.value.toFixed(3)} كجم — {scale.reading.stable ? "ثابتة" : "غير مستقرة"}</p>}
</div><div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"><Input value={customerName} disabled={attemptLocked} onChange={event => setCustomerName(event.target.value)} placeholder="اسم العميل (اختياري)" /><Input value={customerPhone} disabled={attemptLocked} onChange={event => setCustomerPhone(event.target.value)} placeholder="الهاتف (اختياري)" type="tel" /></div><div className="rounded-2xl bg-orange-50 p-4"><p className="text-sm font-bold text-orange-900">إجمالي الفاتورة التقديري</p><p className="text-3xl font-black text-orange-700">{total.toFixed(2)} ج.م</p><p className="mt-1 text-xs text-orange-900">يعتمد الخادم السعر والمخزون النهائيين عند الإتمام الذري.</p></div><Button onClick={completeSale} disabled={isSaving || !cart.length} className="w-full bg-emerald-600 py-6 text-base hover:bg-emerald-700"><Check className="ml-2 h-5 w-5" />{isSaving ? "بانتظار تأكيد الخادم..." : attemptLocked ? "إعادة المحاولة بنفس الفاتورة" : "إتمام وطباعة الفاتورة"}</Button>{attemptLocked && <p className="text-center text-xs text-amber-800">لم يؤكد الخادم الفاتورة بعد. أعد المحاولة بالسلة المجمدة نفسها دون تعديل.</p>}<p className="text-center text-[11px] text-slate-500">لا تُفرّغ السلة ولا تظهر رسالة نجاح قبل استجابة RPC.</p></div>}</aside></div></div><AdvancedBarcodeScanner isOpen={scannerOpen} continuous onClose={() => setScannerOpen(false)} onDetect={code => { setBarcode(code); beginBarcodeLookup(code); }} title="امسح باركود المنتجات بشكل مستمر" /></main>;
}
