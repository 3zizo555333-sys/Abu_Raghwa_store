import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Barcode, Camera, Check, Minus, Plus, Printer, Search, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdvancedBarcodeScanner } from "@/components/AdvancedBarcodeScanner";
import { ProductPhotoSearch, type CashierProductCandidate } from "@/components/ProductPhotoSearch";
import { useCloudState } from "@/lib/cloudSync";
import { useSalesCloudState } from "@/lib/useSalesCloudState";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getContentUnit, getPackageStockDeduction } from "@/lib/packageUnits";
import { findProductsByBarcode, getProductBarcodes } from "@/lib/barcodes";
import { shouldLookupLoyaltyProfile } from "@/lib/loyaltyLookup";
import { getCashierQuantityStep, normalizeCashierQuantity } from "@/lib/cashierQuantity";

type Product = CashierProductCandidate & { barcodes?: string[] | string; sku?: string; barcode?: string; sharedCode?: string; plu?: string; saleMode?: "unit" | "weight"; retailPrice?: number; wholesaleRetailPrice?: number; bulkPrice?: number; quantity?: number; availableQuantity?: number; unit?: string; unitName?: string; contentUnit?: string; unitsPerPackage?: number; loyaltyPoints?: number; catalogVisible?: boolean };
type CartItem = { productId: string; name: string; quantity: number; unitPrice: number; total: number; unit: string; loyaltyPoints?: number };
type Sale = { id: string; date: string; items: Array<{ productId: string; productName: string; selectedUnitType: string; quantity: number; unitPrice: number; total: number; loyaltyPoints?: number }>; total: number; paymentMethod: string; customerName: string; customerPhone: string; customerCode?: string; loyaltyPointsAwarded?: number; saleType: "retail" };

const priceOf = (product: Product) => Number(product.wholesaleRetailPrice) || Number(product.retailPrice) || Number(product.bulkPrice) || 0;

export default function Cashier({ onBackToSalesChoice }: { onBackToSalesChoice?: () => void } = {}) {
  const [, navigate] = useLocation();
  const [products, setProducts] = useCloudState<Product[]>("abu_raghwa_products", []);
  const [recipes] = useCloudState<Array<{ id: string; name: string; salePrice?: number; catalogPrice?: number; productionUnit?: string; catalogImageUrl?: string; loyaltyPoints?: number }>>("abu_raghwa_recipes", []);
  const [sales, setSales] = useSalesCloudState<Sale>();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcode, setBarcode] = useState("");
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeChoices, setBarcodeChoices] = useState<Product[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const recordDirectSaleLoyalty = trpc.catalog.recordDirectSaleLoyalty.useMutation();
  const loyaltyProfileQuery = trpc.catalog.getLoyaltyProfile.useQuery({ customerCode: customerCode.trim() || undefined, phone: customerPhone.trim() || undefined }, { enabled: shouldLookupLoyaltyProfile(customerPhone, customerCode), retry: false });
  const codeInputRef = useRef<HTMLInputElement>(null);
  const catalogLogin = trpc.catalog.loginWithStaffSession.useMutation({ onSuccess: result => { try { sessionStorage.setItem("abu_catalog_admin_token", result.token); } catch {} } });
  useEffect(() => {
    if (!sessionStorage.getItem("abu_catalog_admin_token")) catalogLogin.mutate();
  }, []);
  const recipeProducts = useMemo<Product[]>(() => (Array.isArray(recipes) ? recipes : []).map(recipe => ({
    id: `catalog_recipe_${recipe.id}`,
    name: recipe.name,
    sku: "تركيبة",
    barcode: "",
    retailPrice: Number(recipe.catalogPrice || recipe.salePrice || 0),
    wholesaleRetailPrice: Number(recipe.catalogPrice || recipe.salePrice || 0),
    bulkPrice: Number(recipe.catalogPrice || recipe.salePrice || 0),
    unit: recipe.productionUnit || "وحدة",
    unitName: recipe.productionUnit || "وحدة",
    unitType: "recipe",
    unitValue: 1,
    loyaltyPoints: recipe.loyaltyPoints,
    catalogImageUrl: recipe.catalogImageUrl,
  })), [recipes]);
  const safeProducts = useMemo(() => [...(Array.isArray(products) ? products.filter(Boolean) : []), ...recipeProducts], [products, recipeProducts]);
  const total = cart.reduce((sum, item) => sum + item.total, 0);
  const expectedLoyaltyPoints = Math.round(cart.reduce((sum, item) => sum + Math.max(0, Number(safeProducts.find(product => product.id === item.productId)?.loyaltyPoints) || 0) * Math.max(0, Number(item.quantity) || 0), 0));
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ar-EG");
    return safeProducts.filter(product => !query || `${product.name} ${product.plu || ""} ${getProductBarcodes(product).join(" ")}`.toLocaleLowerCase("ar-EG").includes(query)).slice(0, 16);
  }, [safeProducts, search]);

  useEffect(() => { codeInputRef.current?.focus(); }, []);
  useEffect(() => {
    const profile = loyaltyProfileQuery.data;
    if (!profile) return;
    setCustomerName(current => current || profile.name);
    setCustomerPhone(current => current || profile.phone);
    if (profile.customerCode && profile.customerCode !== customerCode) setCustomerCode(profile.customerCode);
  }, [loyaltyProfileQuery.data, customerCode]);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("abu_catalog_admin_token") || catalogLogin.isPending) return;
      catalogLogin.mutate();
    } catch {}
  }, [catalogLogin.isPending]);

  useEffect(() => {
    if (!onBackToSalesChoice) return;
    const returnToNormalSales = (event: MouseEvent) => {
      const clickedElement = event.target instanceof Element ? event.target : null;
      const button = clickedElement?.closest("button");
      if (!button?.textContent?.includes("المبيعات العادية")) return;
      event.preventDefault();
      event.stopPropagation();
      onBackToSalesChoice();
    };
    document.addEventListener("click", returnToNormalSales, true);
    return () => document.removeEventListener("click", returnToNormalSales, true);
  }, [onBackToSalesChoice]);

  const addProduct = (product: Product) => {
    const unitPrice = priceOf(product);
    if (unitPrice <= 0) return toast.error("سعر هذا المنتج غير مسجل بعد");
    setCart(current => {
      const existing = current.find(item => item.productId === product.id);
      return existing ? current.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unitPrice } : item) : [...current, { productId: product.id, name: product.name, quantity: 1, unitPrice, total: unitPrice, unit: product.saleMode === "weight" ? (product.contentUnit || "كيلو") : getContentUnit(product), loyaltyPoints: Math.max(0, Number(product.loyaltyPoints) || 0) }];
    });
    setBarcodeChoices([]);
    setBarcode("");
    setSearch("");
    codeInputRef.current?.focus();
  };

  const addByBarcode = (rawCode: string) => {
    if (!rawCode.trim()) return;
    const matches = findProductsByBarcode(safeProducts, rawCode).length ? findProductsByBarcode(safeProducts, rawCode) : safeProducts.filter(product => product.plu && product.plu.toLocaleLowerCase() === rawCode.trim().toLocaleLowerCase());
    setBarcodeChoices([]);
    if (!matches.length) return toast.error("لم أجد منتجًا بهذا الباركود. سجّل الكود أو الكود المشترك في بيانات المنتج أولًا.");
    if (matches.length > 1) {
      setBarcodeChoices(matches);
      toast.message(`هذا الباركود مسجّل لأكثر من منتج (${matches.length}). اختر المنتج المقصود.`);
      return;
    }
    addProduct(matches[0]);
    toast.success(`تمت إضافة ${matches[0].name}`);
  };

  const updateQuantity = (productId: string, rawQuantity: number) => {
    const quantity = normalizeCashierQuantity(rawQuantity);
    setCart(current => quantity <= 0 ? current.filter(item => item.productId !== productId) : current.map(item => item.productId === productId ? { ...item, quantity, total: item.unitPrice * quantity } : item));
  };
  // Weighted/liquid items can be entered freely. The buttons use a fine
  // 0.001 step, while the input itself uses step="any" for arbitrary decimals.
  const quantityStep = (item: CartItem) => getCashierQuantityStep(item.unit);

  const completeSale = async () => {
    if (!cart.length) return toast.error("أضف منتجًا واحدًا على الأقل للفاتورة");
    const saleId = `INV-${Date.now()}`;
    let loyaltyProfile: { customerCode: string; phone: string; name: string } | null = null;
    // Keep the product points on the sale even when the customer has no
    // loyalty profile yet; the invoice must still show what was earned.
    let loyaltyPointsAwarded = expectedLoyaltyPoints;
    if (customerName.trim()) {
      try {
        if (!sessionStorage.getItem("abu_catalog_admin_token")) await catalogLogin.mutateAsync();
        const result = await recordDirectSaleLoyalty.mutateAsync({ saleId, customerName: customerName.trim(), phone: customerPhone.trim() || undefined, customerCode: customerCode.trim() || undefined, itemsJson: JSON.stringify(cart.map(item => ({ productId: item.productId, quantity: item.quantity, loyaltyPoints: item.loyaltyPoints || 0 }))) });
        loyaltyProfile = result.profile;
        loyaltyPointsAwarded = Math.max(expectedLoyaltyPoints, Number(result.pointsAwarded) || 0);
      } catch {
        toast.warning("تم تسجيل الفاتورة، لكن تعذر مزامنة نقاط العميل الآن.");
      }
    }
    const sale: Sale = { id: saleId, date: new Date().toISOString(), items: cart.map(item => ({ productId: item.productId, productName: item.name, selectedUnitType: item.unit, quantity: item.quantity, unitPrice: item.unitPrice, total: item.total, loyaltyPoints: item.loyaltyPoints || 0 })), total, paymentMethod: "cash", customerName, customerPhone, customerCode: loyaltyProfile?.customerCode || customerCode.trim() || undefined, loyaltyPointsAwarded, saleType: "retail" };
    setSales(current => [...(Array.isArray(current) ? current : []), sale]);
    setProducts(current => (Array.isArray(current) ? current : []).map(product => {
      const item = cart.find(cartItem => cartItem.productId === product.id);
      if (!item) return product;
      const stock = Number(product.availableQuantity ?? product.quantity ?? 0);
      const deduction = getPackageStockDeduction(product, item.unit, item.quantity);
      return { ...product, availableQuantity: Math.max(0, stock - deduction), quantity: Math.max(0, stock - deduction) };
    }));
    localStorage.setItem("current_invoice", JSON.stringify(sale));
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerCode("");
    navigate("/invoice");
  };

  return <main className="min-h-screen bg-slate-100 p-4" dir="rtl"><div className="mx-auto max-w-[1500px]"><header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-orange-600">وضع الكمبيوتر والكاشير</p><h1 className="text-3xl font-black text-slate-950">نقطة بيع أبو رغوة</h1></div><div className="flex gap-2"><Button variant="outline" onClick={() => navigate("/sales")}>المبيعات العادية</Button><Button variant="outline" onClick={() => navigate("/dashboard")}><ArrowRight className="ml-1 h-4 w-4" />عودة للوحة التحكم</Button></div></header><div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]"><section className="space-y-4"><div className="rounded-3xl bg-slate-950 p-5 text-white shadow-lg"><div className="flex flex-wrap items-end gap-3"><div className="min-w-[240px] flex-1"><label className="text-xs font-black text-slate-300">امسح بالليزر أو اكتب الباركود ثم اضغط Enter</label><Input ref={codeInputRef} value={barcode} onChange={event => { setBarcode(event.target.value); setBarcodeChoices([]); }} onKeyDown={event => event.key === "Enter" && addByBarcode(barcode)} placeholder="الباركود" dir="ltr" className="mt-2 h-13 border-white/20 bg-white text-left text-lg font-bold text-slate-950" /></div><Button onClick={() => addByBarcode(barcode)} className="h-13 bg-orange-500 hover:bg-orange-600"><Barcode className="ml-2 h-5 w-5" />إضافة</Button><Button onClick={() => setScannerOpen(true)} variant="outline" className="h-13 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Camera className="ml-2 h-5 w-5" />كاميرا باركود</Button></div><p className="mt-3 text-xs text-slate-300">قارئ USB أو Bluetooth الذي يعمل كلوحة مفاتيح يكتب الكود هنا تلقائيًا. يقبل الكاشير كل الأكواد المسجلة للمنتج.</p>{barcodeChoices.length > 0 && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-slate-950"><p className="text-sm font-black">هذا الباركود مرتبط بأكثر من منتج — اختر المنتج المقصود</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{barcodeChoices.map(product => <button key={product.id} type="button" onClick={() => addProduct(product)} className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-white p-3 text-right text-slate-900 hover:bg-orange-50"><span className="min-w-0"><span className="block truncate font-black">{product.name}</span><span className="block truncate text-xs text-slate-500">{getProductBarcodes(product).join(" · ")}</span></span><span className="shrink-0 font-bold text-orange-700">{priceOf(product).toFixed(2)} ج.م</span></button>)}</div></div>}</div><div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]"><section className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Search className="h-5 w-5 text-orange-600" /><h2 className="font-black">بحث واختيار المنتج</h2></div><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="اكتب اسم المنتج أو الكود" className="mt-3" /> <div className="mt-3 grid gap-2 sm:grid-cols-2">{filteredProducts.map(product => <button key={product.id} onClick={() => addProduct(product)} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 p-3 text-right hover:border-orange-300 hover:bg-orange-50"><div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-orange-100">{product.catalogImageUrl ? <img src={product.catalogImageUrl} alt="" className="h-full w-full object-cover" /> : <ShoppingCart className="h-5 w-5 text-orange-600" />}</div><div className="min-w-0"><p className="truncate font-black text-slate-900">{product.name}</p><p className="text-xs font-bold text-orange-700">{priceOf(product)} ج.م</p></div></button>)}</div></section><ProductPhotoSearch candidates={safeProducts} onChoose={id => { const product = safeProducts.find(item => item.id === id); if (product) addProduct(product); }} /></div></section><aside className="rounded-3xl bg-white p-5 shadow-lg ring-1 ring-slate-200"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-orange-600">الفاتورة الحالية</p><h2 className="text-xl font-black">السلة</h2></div><ShoppingCart className="h-7 w-7 text-orange-600" /></div>{cart.length === 0 ? <p className="py-14 text-center text-sm text-slate-400">امسح باركود أو اختر منتجًا لتبدأ البيع.</p> : <div className="mt-4 space-y-3">{cart.map(item => <div key={item.productId} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{item.name}</p><p className="text-xs text-slate-500">{item.unitPrice} ج.م / {item.unit}</p></div><Button size="icon" variant="ghost" onClick={() => updateQuantity(item.productId, 0)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button></div><div className="mt-3 flex items-center justify-between"><div className="flex items-center overflow-hidden rounded-lg border bg-white"><button className="p-2" onClick={() => updateQuantity(item.productId, item.quantity - quantityStep(item))}><Minus className="h-4 w-4" /></button><input aria-label={`كمية ${item.name}`} type="number" min="0" step={item.unit === "كيلو" || item.unit === "جرام" || item.unit === "لتر" ? "any" : 1} inputMode="decimal" value={item.quantity} onChange={event => updateQuantity(item.productId, Number(event.target.value))} className="w-24 border-x bg-white p-2 text-center font-black" /><button className="p-2 text-orange-600" onClick={() => updateQuantity(item.productId, item.quantity + quantityStep(item))}><Plus className="h-4 w-4" /></button></div><p className="font-black text-orange-700">{item.total.toFixed(2)} ج.م</p></div></div>)}<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-amber-950">نقاط العميل في هذه الفاتورة</span><span className="text-lg font-black text-amber-700">{expectedLoyaltyPoints} نقطة</span></div><p className="mt-1 text-xs text-amber-800">اكتب اسم العميل، وسيُنشأ له كود إذا كان جديدًا.</p></div><div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3"><Input value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="اسم العميل" /><div className="relative"><Input value={customerCode} onChange={event => setCustomerCode(event.target.value)} placeholder="كود الولاء (اختياري)" dir="ltr" />{loyaltyProfileQuery.isFetching && <span className="absolute left-2 top-2 text-[10px] text-slate-400">بحث...</span>}</div><Input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="الهاتف (اختياري)" type="tel" /></div><div className="rounded-2xl bg-orange-50 p-4"><p className="text-sm font-bold text-orange-900">إجمالي الفاتورة</p><p className="text-3xl font-black text-orange-700">{total.toFixed(2)} ج.م</p></div><Button onClick={completeSale} disabled={recordDirectSaleLoyalty.isPending || catalogLogin.isPending} className="w-full bg-emerald-600 py-6 text-base hover:bg-emerald-700"><Check className="ml-2 h-5 w-5" />إتمام وطباعة الفاتورة</Button><p className="text-center text-[11px] text-slate-500">بعد الإتمام ستفتح الفاتورة؛ اختر طابعتك الحرارية من نافذة الطباعة.</p></div>}</aside></div></div><AdvancedBarcodeScanner isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onDetect={code => { setScannerOpen(false); addByBarcode(code); }} title="امسح باركود المنتج بالكاميرا" /></main>;
}
