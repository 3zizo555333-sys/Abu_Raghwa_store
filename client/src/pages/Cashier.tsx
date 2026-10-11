import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Barcode, Camera, Check, Minus, Plus, Search, ShoppingCart, Trash2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SaleTypeSegmentedControl } from "@/components/SaleTypeSegmentedControl";
import { AdvancedBarcodeScanner } from "@/components/AdvancedBarcodeScanner";
import { useCloudProducts } from "@/lib/supabase/useProducts";
import { listProductCategories, type CloudProduct, type ProductCategory } from "@/lib/supabase/products";
import { acknowledgeInvoiceIntent, completeInvoiceIntent, createCloudInvoice, createInvoiceIdempotencyKey, getRecoverableInvoiceIntent, type CreateInvoiceInput } from "@/lib/supabase/invoices";
import { findProductsByBarcode, isUnbarcodedProduct, normalizeBarcodeToken } from "@/lib/barcodes";
import { getContentUnit, getLoyaltyPointsForSaleUnit, getSalePriceForUnit, getSaleUnitOptions } from "@/lib/packageUnits";
import { getCashierQuantityStep, normalizeCashierQuantity } from "@/lib/cashierQuantity";
import { toast } from "sonner";
import { useScaleConnection } from "@/lib/scaleConnection";

type Product = CloudProduct;
type SaleType = "retail" | "wholesale" | "bulk";
type PosMode = "unbarcoded" | "all";
type CartItem = { id: string; productId: string; name: string; quantity: number; unitPrice: number; total: number; unit: string; unitName: string; contentUnit: string; saleMode: Product["saleMode"]; bulkUnitName: string | null; unitsPerBulk: number; bulkUnitPrice: number | null; loyaltyPoints: number; prices: Record<SaleType, number>; points: Record<SaleType, number> };
type PendingInvoice = { idempotencyKey: string; payload: CreateInvoiceInput };
const saleTypeLabel: Record<SaleType, string> = { retail: "قطاعي", wholesale: "تجزئة", bulk: "جملة" };
const getProductCategoryName = (product: Product, categories: ProductCategory[]) =>
  (product.categoryId ? categories.find(category => category.id === product.categoryId)?.name : null) ?? (product.category || "بدون فئة");
const getSaleValues = (product: Product, saleType: SaleType) => {
  const prices: Record<SaleType, number> = { retail: Number(product.retailPrice) || 0, wholesale: Number(product.wholesaleRetailPrice) || Number(product.retailPrice) || 0, bulk: Number(product.bulkPrice) || Number(product.wholesaleRetailPrice) || Number(product.retailPrice) || 0 };
  const points: Record<SaleType, number> = { retail: Number(product.retailLoyaltyPoints ?? product.loyaltyPoints) || 0, wholesale: Number(product.subWholesaleLoyaltyPoints ?? product.loyaltyPoints) || 0, bulk: Number(product.wholesaleLoyaltyPoints ?? product.loyaltyPoints) || 0 };
  return { prices, points, unitPrice: prices[saleType], loyaltyPoints: points[saleType] };
};

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
  const [saleType, setSaleType] = useState<SaleType>("retail");
  const [posMode, setPosMode] = useState<PosMode>("unbarcoded");
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [activePosCategory, setActivePosCategory] = useState("__all__");
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [attemptLocked, setAttemptLocked] = useState(true);
  const [scaleProductId, setScaleProductId] = useState("");
  const pendingInvoiceRef = useRef<PendingInvoice | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const scanAudioContextRef = useRef<AudioContext | null>(null);
  const cameraScanFeedbackPendingRef = useRef(false);
  const scale = useScaleConnection("kg");

  const productsQuery = useCloudProducts({ search, pageSize: 50 });
  const barcodeQuery = useCloudProducts({ barcode: barcodeLookup, pageSize: 50, enabled: Boolean(barcodeLookup) });
  const products = productsQuery.products as Product[];
  const barcodeProducts = barcodeQuery.products as Product[];
  const total = cart.reduce((sum, item) => sum + item.total, 0);

  useEffect(() => {
    let active = true;
    void listProductCategories().then(categories => { if (active) setProductCategories(categories); }).catch(() => {
      // Product category labels from the secure product RPC remain available if this lookup is unavailable.
    });
    return () => { active = false; };
  }, []);

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
      cameraScanFeedbackPendingRef.current = false;
      setBarcodeLookup("");
      toast.error("تعذر البحث عن الباركود في Supabase. تحقّق من الاتصال ثم أعد المحاولة.");
      return;
    }
    const matches = findProductsByBarcode(barcodeProducts, code).length
      ? findProductsByBarcode(barcodeProducts, code)
      : barcodeProducts.filter(product => normalizeBarcodeToken(product.plu ?? "") === code);
    setBarcodeLookup("");
    if (!matches.length) {
      cameraScanFeedbackPendingRef.current = false;
      toast.error("لم أجد منتجًا بهذا الباركود ضمن نتائج البحث السحابي. سجّل الكود الأساسي أو ابحث باسم المنتج.");
      return;
    }
    if (matches.length > 1) {
      setBarcodeChoices(matches);
      toast.message(`هذا الباركود مرتبط بأكثر من منتج (${matches.length}). اختر المنتج المقصود.`);
      return;
    }
    const cameraAlreadyBeeped = cameraScanFeedbackPendingRef.current;
    cameraScanFeedbackPendingRef.current = false;
    addProduct(matches[0], !cameraAlreadyBeeped);
    toast.success(`تمت إضافة ${matches[0].name} إلى السلة.`);
    // addProduct is stable for the current render; query completion is keyed to a unique lookup value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcodeLookup, barcodeQuery.data, barcodeQuery.isLoading, barcodeQuery.isFetching]);

  const provideScanFeedback = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(200);
    if (typeof window === "undefined") return;
    try {
      const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const context = scanAudioContextRef.current ?? new AudioContextConstructor();
      scanAudioContextRef.current = context;
      void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.13);
    } catch {
      // Haptics/audio are optional browser capabilities and must never block a sale.
    }
  };

  const addProductWithQuantity = (product: Product, requestedQuantity = 1, feedback = false) => {
    if (attemptLocked) return;
    const values = getSaleValues(product, saleType);
    const unit = getContentUnit(product);
    const unitPrice = getSalePriceForUnit(product, values.unitPrice, unit);
    const loyaltyPoints = getLoyaltyPointsForSaleUnit(product, values.loyaltyPoints, unit);
    if (unitPrice <= 0) return toast.error("سعر الوحدة المحددة لهذا المنتج غير مسجل.");
    const quantity = Math.max(0.001, requestedQuantity);
    const id = `${product.id}::${unit}`;
    setCart(current => {
      const existing = current.find(item => item.productId === product.id && item.unit === unit);
      return existing
        ? current.map(item => item.id === existing.id ? { ...item, quantity: item.quantity + quantity, total: (item.quantity + quantity) * item.unitPrice } : item)
        : [...current, { id, productId: product.id, name: product.name, quantity, unitPrice, total: quantity * unitPrice, unit, unitName: product.unit, contentUnit: product.contentUnit, saleMode: product.saleMode, bulkUnitName: product.bulkUnitName, unitsPerBulk: product.unitsPerBulk, bulkUnitPrice: product.bulkUnitPrice, loyaltyPoints, prices: values.prices, points: values.points }];
    });
    setBarcodeChoices([]);
    setBarcode("");
    setSearch("");
    codeInputRef.current?.focus();
    if (feedback) provideScanFeedback();
  };
  const addProduct = (product: Product, feedback = false) => addProductWithQuantity(product, 1, feedback);
  const chooseBarcodeProduct = (product: Product) => {
    const feedback = !cameraScanFeedbackPendingRef.current;
    cameraScanFeedbackPendingRef.current = false;
    addProduct(product, feedback);
    toast.success(`تمت إضافة ${product.name} إلى السلة.`);
  };
  const changeSaleType = (nextSaleType: SaleType) => {
    setSaleType(nextSaleType);
    setCart(current => current.map(item => {
      const unitPrice = getSalePriceForUnit(item, item.prices[nextSaleType], item.unit);
      const loyaltyPoints = getLoyaltyPointsForSaleUnit(item, item.points[nextSaleType], item.unit);
      return { ...item, unitPrice, loyaltyPoints, total: item.quantity * unitPrice };
    }));
  };

  const beginBarcodeLookup = (rawCode: string, cameraFeedbackAlreadyPlayed = false) => {
    if (attemptLocked || !rawCode.trim()) return;
    cameraScanFeedbackPendingRef.current = cameraFeedbackAlreadyPlayed;
    setBarcodeChoices([]);
    setBarcodeLookup(rawCode.trim());
  };

  const updateQuantity = (cartItemId: string, rawQuantity: number) => {
    if (attemptLocked) return;
    const quantity = normalizeCashierQuantity(rawQuantity);
    setCart(current => quantity <= 0
      ? current.filter(item => item.id !== cartItemId)
      : current.map(item => item.id === cartItemId ? { ...item, quantity, total: item.unitPrice * quantity } : item));
  };
  const changeQuantityDraft = (cartItemId: string, value: string) => {
    setQuantityDrafts(current => ({ ...current, [cartItemId]: value }));
    if (!value.trim()) return;
    const quantity = Number(value);
    if (Number.isFinite(quantity) && quantity > 0) updateQuantity(cartItemId, quantity);
  };
  const commitQuantityDraft = (cartItemId: string) => {
    const value = quantityDrafts[cartItemId];
    if (value !== undefined && value.trim()) { const quantity = Number(value); if (Number.isFinite(quantity) && quantity > 0) updateQuantity(cartItemId, quantity); }
    setQuantityDrafts(current => {
      const next = { ...current };
      delete next[cartItemId];
      return next;
    });
  };
  const changeQuantityByStep = (cartItemId: string, delta: number) => {
    const item = cart.find(entry => entry.id === cartItemId);
    if (!item || attemptLocked) return;
    setQuantityDrafts(current => {
      const next = { ...current };
      delete next[cartItemId];
      return next;
    });
    updateQuantity(cartItemId, item.quantity + delta);
  };
  const changeCartUnit = (cartItemId: string, nextUnit: string) => {
    if (attemptLocked) return;
    setQuantityDrafts(current => {
      const next = { ...current };
      delete next[cartItemId];
      return next;
    });
    setCart(current => {
      const item = current.find(entry => entry.id === cartItemId);
      if (!item || !getSaleUnitOptions(item, saleType === "bulk" || item.unit === item.unitName).includes(nextUnit)) return current;
      const unitPrice = getSalePriceForUnit(item, item.prices[saleType], nextUnit);
      const loyaltyPoints = getLoyaltyPointsForSaleUnit(item, item.points[saleType], nextUnit);
      const moved = { ...item, id: `${item.productId}::${nextUnit}`, unit: nextUnit, unitPrice, loyaltyPoints, total: item.quantity * unitPrice };
      const otherItems = current.filter(entry => entry.id !== cartItemId);
      const matchingLine = otherItems.find(entry => entry.id === moved.id);
      return matchingLine
        ? otherItems.map(entry => entry.id === matchingLine.id ? { ...entry, quantity: entry.quantity + moved.quantity, total: (entry.quantity + moved.quantity) * entry.unitPrice } : entry)
        : [...otherItems, moved];
    });
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
        saleType,
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

  const posModeProducts = useMemo(() => posMode === "unbarcoded" ? products.filter(isUnbarcodedProduct) : products, [products, posMode]);
  const posCategories = useMemo(() => {
    const names = new Set<string>(posMode === "unbarcoded" ? [] : productCategories.map(category => category.name));
    posModeProducts.forEach(product => names.add(getProductCategoryName(product, productCategories)));
    return ["__all__", ...Array.from(names).sort((a, b) => a.localeCompare(b, "ar"))];
  }, [posMode, posModeProducts, productCategories]);
  const filteredProducts = useMemo(() => posModeProducts
    .filter(product => activePosCategory === "__all__" || getProductCategoryName(product, productCategories) === activePosCategory)
    .slice(0, 24), [posModeProducts, activePosCategory, productCategories]);

  return <main className="min-h-screen bg-slate-100 p-4" dir="rtl"><div className="mx-auto max-w-[1500px]"><header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-orange-600">وضع الكمبيوتر والكاشير</p><h1 className="text-3xl font-black text-slate-950">نقطة بيع أبو رغوة</h1></div><div className="flex gap-2"><Button variant="outline" disabled={attemptLocked || isSaving} onClick={() => navigate("/sales")}>المبيعات العادية</Button><Button variant="outline" disabled={attemptLocked || isSaving} onClick={() => navigate("/dashboard")}><ArrowRight className="ml-1 h-4 w-4" />عودة للوحة التحكم</Button></div></header><div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]"><section className="space-y-4"><div className="rounded-3xl bg-slate-950 p-5 text-white shadow-lg"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><span className="text-sm font-black">نوع البيع المحدد: {saleTypeLabel[saleType]}</span><span className="text-xs text-slate-300">غيّر نوع البيع من عناصر التحكم داخل السلة لتحديث الأسعار والنقاط والإجمالي</span></div><div className="flex flex-wrap items-end gap-3"><div className="min-w-[240px] flex-1"><label className="text-xs font-black text-slate-300">امسح بالليزر أو اكتب الباركود ثم اضغط Enter</label><Input ref={codeInputRef} value={barcode} disabled={attemptLocked || Boolean(barcodeLookup)} onChange={event => { setBarcode(event.target.value); setBarcodeChoices([]); }} onKeyDown={event => event.key === "Enter" && beginBarcodeLookup(barcode)} placeholder="الباركود" dir="ltr" className="mt-2 h-13 border-white/20 bg-white text-left text-lg font-bold text-slate-950" /></div><Button onClick={() => beginBarcodeLookup(barcode)} disabled={attemptLocked || Boolean(barcodeLookup)} className="h-13 bg-orange-500 hover:bg-orange-600"><Barcode className="ml-2 h-5 w-5" />إضافة</Button><Button onClick={() => setScannerOpen(true)} disabled={attemptLocked} variant="outline" className="h-13 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Camera className="ml-2 h-5 w-5" />كاميرا باركود</Button></div><p className="mt-3 text-xs text-slate-300">يُبحث الباركود في النتائج السحابية المحدودة. قارئ USB أو Bluetooth يكتب الكود هنا تلقائيًا.</p>{barcodeLookup && barcodeQuery.isFetching && <p className="mt-3 text-sm text-orange-200">جاري البحث عن الباركود في المنتجات السحابية...</p>}{barcodeChoices.length > 0 && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-slate-950"><p className="text-sm font-black">هذا الباركود مرتبط بأكثر من منتج — اختر المنتج المقصود</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{barcodeChoices.map(product => <button key={product.id} type="button" disabled={attemptLocked} onClick={() => chooseBarcodeProduct(product)} className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-white p-3 text-right text-slate-900 hover:bg-orange-50"><span className="min-w-0"><span className="block truncate font-black">{product.name}</span><span className="block truncate text-xs text-slate-500">{[product.barcode, ...(product.barcodes ?? [])].filter(Boolean).join(" · ")}</span></span><span className="shrink-0 font-bold text-orange-700">{getSaleValues(product, saleType).unitPrice.toFixed(2)} ج.م</span></button>)}</div></div>}</div><div className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Search className="h-5 w-5 text-orange-600" /><h2 className="font-black">بحث واختيار المنتج</h2></div><div role="tablist" aria-label="نمط البيع السريع" className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1"><button type="button" role="tab" aria-selected={posMode === "unbarcoded"} disabled={attemptLocked} onClick={() => { setPosMode("unbarcoded"); setActivePosCategory("__all__"); }} className={`rounded-xl px-3 py-3 text-sm font-black transition ${posMode === "unbarcoded" ? "bg-orange-600 text-white shadow" : "text-slate-700 hover:bg-white"}`}>أصناف الصب <span className="block text-xs font-bold">(بدون باركود)</span></button><button type="button" role="tab" aria-selected={posMode === "all"} disabled={attemptLocked} onClick={() => { setPosMode("all"); setActivePosCategory("__all__"); }} className={`rounded-xl px-3 py-3 text-sm font-black transition ${posMode === "all" ? "bg-orange-600 text-white shadow" : "text-slate-700 hover:bg-white"}`}>جميع المنتجات</button></div><p className="mt-2 text-xs text-slate-500">{posMode === "unbarcoded" ? "الوضع السريع يعرض المنتجات الخالية من الباركود فقط." : "وضع احتياطي لتصفح وبحث كامل دليل المنتجات."}</p><Input value={search} disabled={attemptLocked} onChange={event => setSearch(event.target.value)} placeholder="اكتب اسم المنتج أو الكود" className="mt-3" /><div role="tablist" aria-label="فئات البيع السريع" className="mt-3 flex gap-2 overflow-x-auto pb-2">{posCategories.map(category => <button key={category} type="button" role="tab" aria-selected={activePosCategory === category} disabled={attemptLocked} onClick={() => setActivePosCategory(category)} className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-black transition ${activePosCategory === category ? "border-orange-600 bg-orange-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50"}`}>{category === "__all__" ? (posMode === "unbarcoded" ? "كل أصناف الصب" : "كل المنتجات") : category}</button>)}</div>{productsQuery.isLoading ? <p className="mt-3 text-sm text-slate-500">جاري تحميل النتائج من Supabase...</p> : productsQuery.isError ? <p className="mt-3 text-sm text-red-700">تعذر تحميل المنتجات من السحابة. تحقق من الاتصال.</p> : <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{filteredProducts.map(product => { const price = getSaleValues(product, saleType).unitPrice; return <button key={product.id} type="button" disabled={attemptLocked} onClick={() => addProduct(product)} className="flex min-h-28 min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition active:scale-[0.98] hover:border-orange-400 hover:bg-orange-50 disabled:opacity-50"><div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-orange-100">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <ShoppingCart className="h-6 w-6 text-orange-600" />}</div><span className="line-clamp-2 w-full font-black text-slate-900">{product.name}</span><span className="text-sm font-black text-orange-700">{price.toFixed(2)} ج.م / {getContentUnit(product)}</span><span className="text-[11px] font-bold text-slate-500">اضغط للإضافة · {product.quantity} متاح</span></button>; })}{filteredProducts.length === 0 && <p className="col-span-full rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">{posMode === "unbarcoded" ? "لا توجد أصناف بلا باركود ضمن الفئة والبحث الحاليين؛ حمّل المزيد أو غيّر الفئة." : "لا توجد منتجات في هذه الفئة ضمن نتائج البحث الحالية."}</p>}</div>}{productsQuery.hasNextPage && <Button type="button" variant="outline" disabled={productsQuery.isFetchingNextPage || attemptLocked} onClick={() => void productsQuery.fetchNextPage()} className="mt-3 w-full">{productsQuery.isFetchingNextPage ? "جاري التحميل..." : "تحميل منتجات أخرى"}</Button>}</div></section><aside className="rounded-3xl bg-white p-5 shadow-lg ring-1 ring-slate-200"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-orange-600">الفاتورة الحالية</p><h2 className="text-xl font-black">السلة</h2></div><ShoppingCart className="h-7 w-7 text-orange-600" /></div>{cart.length === 0 ? <p className="py-14 text-center text-sm text-slate-400">امسح باركود أو اختر منتجًا من النتائج السحابية.</p> : <div className="mt-4 space-y-3">{cart.map(item => <div key={item.id} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{item.name}</p><p className="text-xs text-slate-500">{item.unitPrice.toFixed(2)} ج.م / {item.unit} · {item.loyaltyPoints} نقطة/وحدة</p>{getSaleUnitOptions(item, saleType === "bulk" || item.unit === item.unitName).length > 1 && <label className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-600"><span>وحدة البيع</span><select value={item.unit} disabled={attemptLocked} onChange={event => changeCartUnit(item.id, event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900">{getSaleUnitOptions(item, saleType === "bulk" || item.unit === item.unitName).map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>}</div><Button type="button" size="icon" variant="ghost" aria-label={`حذف ${item.name} من السلة`} disabled={attemptLocked} onClick={() => updateQuantity(item.id, 0)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button></div><div className="mt-3 flex items-center justify-between gap-2"><div className="flex items-center overflow-hidden rounded-xl border bg-white"><button type="button" aria-label={`تقليل كمية ${item.name}`} disabled={attemptLocked} className="grid h-12 w-12 place-items-center disabled:opacity-50" onClick={() => changeQuantityByStep(item.id, -quantityStep(item))}><Minus className="h-5 w-5" /></button><input aria-label={`كمية ${item.name}`} type="number" min="0.001" step={item.unit === "كيلو" || item.unit === "جرام" || item.unit === "لتر" ? "any" : 1} inputMode="decimal" disabled={attemptLocked} value={quantityDrafts[item.id] ?? item.quantity} onFocus={event => { event.currentTarget.select(); setQuantityDrafts(current => current[item.id] === undefined ? { ...current, [item.id]: String(item.quantity) } : current); }} onChange={event => changeQuantityDraft(item.id, event.target.value)} onBlur={() => commitQuantityDraft(item.id)} className="h-12 w-24 border-x bg-white p-2 text-center text-lg font-black" /><button type="button" aria-label={`زيادة كمية ${item.name}`} disabled={attemptLocked} className="grid h-12 w-12 place-items-center text-orange-600 disabled:opacity-50" onClick={() => changeQuantityByStep(item.id, quantityStep(item))}><Plus className="h-5 w-5" /></button></div><p className="shrink-0 font-black text-orange-700">{item.total.toFixed(2)} ج.م</p></div></div>)}<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black text-emerald-950">الميزان الرقمي</p><p className="text-xs text-emerald-800">يدعم Web Serial على Chrome وأجهزة الميزان التي تعمل كلوحة مفاتيح.</p></div><Button type="button" variant="outline" onClick={() => scale.status === "connected" ? void scale.disconnect() : void scale.connect().catch(error => toast.error(error instanceof Error ? error.message : "تعذر ربط الميزان."))} className="border-emerald-300 bg-white text-emerald-800"><Scale className="ml-1 h-4 w-4" />{scale.status === "connected" ? "فصل الميزان" : "ربط الميزان"}</Button></div>
  {scale.status === "unsupported" && <p className="mt-2 text-xs text-amber-800">Web Serial غير متاح على هذا المتصفح. يمكن استخدام ميزان USB/Bluetooth يرسل الوزن كلوحة مفاتيح.</p>}
  {scale.status === "connected" && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><select value={scaleProductId} onChange={event => setScaleProductId(event.target.value)} className="h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm"><option value="">اختر المنتج الذي سيأخذ الوزن</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select><Button type="button" disabled={!scale.reading || !scaleProductId || !scale.reading.stable} onClick={() => { const product = products.find(item => item.id === scaleProductId); if (!product || !scale.reading) return; addProductWithQuantity(product, scale.reading.value); toast.success(`تمت إضافة ${scale.reading.value.toFixed(3)} كجم من ${product.name}`); }} className="bg-emerald-600 hover:bg-emerald-700">إضافة الوزن {scale.reading ? `${scale.reading.value.toFixed(3)} كجم` : "—"}</Button></div>}
  {scale.reading && <p className="mt-2 text-xs font-bold text-emerald-900">القراءة: {scale.reading.value.toFixed(3)} كجم — {scale.reading.stable ? "ثابتة" : "غير مستقرة"}</p>}
</div><div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"><Input value={customerName} disabled={attemptLocked} onChange={event => setCustomerName(event.target.value)} placeholder="اسم العميل (اختياري)" /><Input value={customerPhone} disabled={attemptLocked} onChange={event => setCustomerPhone(event.target.value)} placeholder="الهاتف (اختياري)" type="tel" /></div><SaleTypeSegmentedControl value={saleType} onChange={changeSaleType} disabled={attemptLocked} /><div className="rounded-2xl bg-orange-50 p-4"><p className="text-sm font-bold text-orange-900">إجمالي الفاتورة التقديري</p><p className="text-3xl font-black text-orange-700">{total.toFixed(2)} ج.م</p><p className="mt-1 text-xs text-orange-900">النقاط المتوقعة: {cart.reduce((sum, item) => sum + item.loyaltyPoints * item.quantity, 0).toFixed(2)} · نوع البيع: {saleTypeLabel[saleType]}</p><p className="mt-1 text-xs text-orange-900">يعتمد الخادم السعر والمخزون النهائيين عند الإتمام الذري.</p></div><Button onClick={completeSale} disabled={isSaving || !cart.length} className="w-full bg-emerald-600 py-6 text-base hover:bg-emerald-700"><Check className="ml-2 h-5 w-5" />{isSaving ? "بانتظار تأكيد الخادم..." : attemptLocked ? "إعادة المحاولة بنفس الفاتورة" : "إتمام وطباعة الفاتورة"}</Button>{attemptLocked && <p className="text-center text-xs text-amber-800">لم يؤكد الخادم الفاتورة بعد. أعد المحاولة بالسلة المجمدة نفسها دون تعديل.</p>}<p className="text-center text-[11px] text-slate-500">لا تُفرّغ السلة ولا تظهر رسالة نجاح قبل استجابة RPC.</p></div>}</aside></div></div><AdvancedBarcodeScanner isOpen={scannerOpen} continuous onClose={() => setScannerOpen(false)} onCameraDetect={() => { cameraScanFeedbackPendingRef.current = true; provideScanFeedback(); }} onDetect={code => { setBarcode(code); beginBarcodeLookup(code, cameraScanFeedbackPendingRef.current); }} title="امسح باركود المنتجات بشكل مستمر" /></main>;
}
