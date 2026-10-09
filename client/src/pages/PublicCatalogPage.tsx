import { browserState } from "@/lib/browserState";
import { useEffect, useMemo, useState } from "react";
import { Building2, Check, ChevronLeft, CircleHelp, ClipboardList, Clock3, Minus, Package, Phone, Plus, Search, ShoppingBag, Sparkles, Star, Trash2, Truck, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CATALOG_PHONE, CATALOG_WHATSAPP, catalogProductMatchesSearch, getCatalogDiscountPercent, getCatalogOldPrice, getCatalogPrice, getCatalogOrderLoyaltyPoints, getProductLoyaltyPoints, getSafeCatalogDetailsUrl, recipeToCatalogProduct, type CatalogCartItem, type CatalogCategory, type CatalogCompany, type CatalogProduct, type CatalogRecipe } from "@/lib/catalog";
import { getCatalogFulfillmentMode, getFulfillmentPrice, normalizeDeliveryMarkupPercent, type CatalogPricingConfig } from "@/lib/catalogPricing";
import { trpc } from "@/lib/trpc";
import { listCatalogDisplayData, listCatalogRewards } from "@/lib/supabase/operations";

type SavedOrderReference = { id: string; phone: string; customerCode?: string };
type LoyaltyRewardLevel = { points: number; giftName: string; confirmed?: boolean };
const DEFAULT_LOYALTY_REWARDS: LoyaltyRewardLevel[] = [
  { points: 20, giftName: "كيس مسحوق غسيل 1 كيلو", confirmed: true },
  { points: 50, giftName: "جركن صابون سائل 4 لتر", confirmed: true },
  { points: 100, giftName: "باكدج منظفات منزلية", confirmed: true },
  { points: 200, giftName: "هدية كبرى خاصة", confirmed: true },
];
const CUSTOMER_ORDERS_KEY = "abu_catalog_customer_orders";
const CUSTOMER_STATUS = {
  new: { label: "تم استلام طلبك", detail: "وصل الطلب إلى إدارة أبو رغوة للمراجعة.", className: "bg-amber-100 text-amber-800" },
  contacted: { label: "تم التواصل", detail: "تمت مراجعة الطلب والتواصل معك.", className: "bg-blue-100 text-blue-800" },
  confirmed: { label: "الطلب مؤكد", detail: "تم تأكيد الطلب ويجري تجهيزه.", className: "bg-emerald-100 text-emerald-800" },
  preparing: { label: "جارٍ توفير المنتجات", detail: "نعمل الآن على توفير وتجهيز المنتجات المطلوبة.", className: "bg-violet-100 text-violet-800" },
  delivered: { label: "تم التسليم", detail: "تم تسليم الطلب. شكرًا لتسوقك معنا.", className: "bg-green-100 text-green-800" },
  cancelled: { label: "تم إلغاء الطلب", detail: "تواصل معنا إذا أردت الاستفسار عن الطلب.", className: "bg-slate-100 text-slate-700" },
} as const;

function loadSavedOrders(): SavedOrderReference[] {
  try {
    const parsed = JSON.parse(browserState.get(CUSTOMER_ORDERS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(item => typeof item?.id === "string" && typeof item?.phone === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}

export default function PublicCatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [manualProducts, setManualProducts] = useState<CatalogProduct[]>([]);
  const [recipes, setRecipes] = useState<CatalogRecipe[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [companies, setCompanies] = useState<CatalogCompany[]>([]);
  const [pricingConfig, setPricingConfig] = useState<CatalogPricingConfig>({ deliveryMarkupPercent: 0 });
  const [rewardLevels, setRewardLevels] = useState<LoyaltyRewardLevel[]>(DEFAULT_LOYALTY_REWARDS);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("الكل");
  const [companyFilter, setCompanyFilter] = useState("الكل");
  const [cart, setCart] = useState<CatalogCartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [savedOrders, setSavedOrders] = useState<SavedOrderReference[]>(loadSavedOrders);
  const [trackingPhone, setTrackingPhone] = useState("");
  const [loyaltyPhone, setLoyaltyPhone] = useState(() => loadSavedOrders()[0]?.phone || "");
  const [loyaltyCode, setLoyaltyCode] = useState(() => typeof window === "undefined" ? "" : browserState.get("abu_active_customer_code") || "");
  const [customer, setCustomer] = useState({ name: "", phone: "", customerCode: typeof window === "undefined" ? "" : browserState.get("abu_active_customer_code") || "", address: "", note: "" });
  useEffect(() => {
    listCatalogDisplayData().then(data => {
      setProducts(data.registeredProducts.map(product => ({ id: product.id, catalogSource: "product", name: product.name, unit: product.unit, retailPrice: product.retailPrice, wholesaleRetailPrice: product.wholesaleRetailPrice, category: product.category, catalogVisible: false, loyaltyPoints: product.loyaltyPoints, catalogImageUrl: product.imageUrl })));
      setManualProducts(data.manualProducts.map(row => ({ id: row.id, catalogSource: "manual", name: row.name, unit: row.unit, wholesaleRetailPrice: row.price, catalogPrice: row.price, category: "", company: "", catalogDescription: row.description, catalogDetailsUrl: row.details_url, catalogVisible: row.is_visible, loyaltyPoints: row.loyalty_points })));
      setRecipes((data.recipes as any[]).map(recipe => ({ id: String(recipe.id), name: String(recipe.name || ""), salePrice: Number(recipe.retail_price || 0), category: String(recipe.category || "تركيبات"), catalogVisible: false, notes: String(recipe.description || "") })));
      setCategories(data.categories.map(row => ({ id: row.id, name: row.name })));
      setCompanies(data.companies.map(row => ({ id: row.id, name: row.name })));
      setPricingConfig(data.pricing as CatalogPricingConfig);
      return listCatalogRewards();
    }).then(rows => { if (rows) setRewardLevels((rows as any[]).map(row => ({ points: Number(row.points_required), giftName: String(row.gift_name), confirmed: true }))); }).catch(() => undefined);
  }, []);
  const createOrder = trpc.catalog.createOrder.useMutation();
  const fulfillmentMode = typeof window === "undefined" ? "pickup" : getCatalogFulfillmentMode(window.location.search);
  const deliveryMarkup = normalizeDeliveryMarkupPercent(pricingConfig.deliveryMarkupPercent);
  const fulfillmentLabel = fulfillmentMode === "delivery" ? "التوصيل حتى باب البيت" : "الاستلام من المحل";
  const fulfillmentDescription = fulfillmentMode === "delivery" ? `أسعار التوصيل تشمل زيادة ${deliveryMarkup}% لكل صنف.` : "هذه أسعار الاستلام من المحل دون زيادة توصيل.";

  const catalogProducts = useMemo(() => {
    const registered = Array.isArray(products) ? products.filter(Boolean) : [];
    const manual = Array.isArray(manualProducts) ? manualProducts.filter(Boolean) : [];
    const recipeProducts = Array.isArray(recipes) ? recipes.filter(Boolean).map(recipeToCatalogProduct) : [];
    return [...registered, ...manual, ...recipeProducts].filter(product => product.catalogVisible === true && getCatalogPrice(product) > 0);
  }, [products, manualProducts, recipes]);
  const categoryNames = useMemo(() => Array.from(new Set([...(Array.isArray(categories) ? categories : []).map(category => String(category?.name ?? "")).filter(Boolean), ...catalogProducts.map(product => String(product.category ?? "")).filter(Boolean)])), [categories, catalogProducts]);
  const companyNames = useMemo(() => Array.from(new Set([...(Array.isArray(companies) ? companies : []).map(company => String(company?.name ?? "")).filter(Boolean), ...catalogProducts.map(product => String(product.company ?? "")).filter(Boolean)])), [companies, catalogProducts]);
  const categoryCards = useMemo(() => categoryNames.map(name => {
    const items = catalogProducts.filter(product => product.category === name);
    return { name, count: items.length, image: items.find(item => item.catalogImageUrl)?.catalogImageUrl };
  }), [categoryNames, catalogProducts]);
  const companyCards = useMemo(() => companyNames.map(name => {
    const items = catalogProducts.filter(product => product.company === name);
    return { name, count: items.length, image: items.find(item => item.catalogImageUrl)?.catalogImageUrl };
  }), [companyNames, catalogProducts]);
  const filteredProducts = catalogProducts.filter(product => {
    const matchesSearch = catalogProductMatchesSearch(product, search);
    return matchesSearch && (categoryFilter === "الكل" || product.category === categoryFilter) && (companyFilter === "الكل" || product.company === companyFilter);
  });
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const savedOrderIds = useMemo(() => savedOrders.map(order => order.id), [savedOrders]);
  const canTrackOrders = ordersOpen && savedOrderIds.length > 0 && trackingPhone.trim().length >= 7;
  const customerOrdersQuery = trpc.catalog.getCustomerOrders.useQuery({ orderIds: savedOrderIds.length ? savedOrderIds : ["catalog_no_order"], customerPhone: trackingPhone.trim() || "0000000" }, { enabled: canTrackOrders, refetchInterval: canTrackOrders ? 12_000 : false, retry: false });
  const customerOrders = customerOrdersQuery.data || [];
  const loyaltyLookupEnabled = loyaltyOpen && (loyaltyPhone.trim().length >= 7 || loyaltyCode.trim().length >= 5);
  const loyaltyProfileQuery = trpc.catalog.getLoyaltyProfile.useQuery({ phone: loyaltyPhone.trim() || undefined, customerCode: loyaltyCode.trim() || undefined }, { enabled: loyaltyLookupEnabled, retry: false });
  const loyaltyProfile = loyaltyProfileQuery.data;
  const cartLoyaltyPoints = getCatalogOrderLoyaltyPoints(cart);

  const persistOrders = (next: SavedOrderReference[]) => {
    setSavedOrders(next);
    browserState.set(CUSTOMER_ORDERS_KEY, JSON.stringify(next));
  };

  const browseCategory = (category: string) => {
    setCategoryFilter(category);
    setCompanyFilter("الكل");
    document.getElementById("catalog-products")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const browseCompany = (company: string) => {
    setCompanyFilter(company);
    setCategoryFilter("الكل");
    document.getElementById("catalog-products")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openMyOrders = () => {
    setTrackingPhone(savedOrders[0]?.phone || "");
    setOrdersOpen(true);
  };
  const openLoyalty = () => {
    setLoyaltyPhone(loyaltyPhone || savedOrders[0]?.phone || "");
    setLoyaltyCode(loyaltyCode || savedOrders[0]?.customerCode || browserState.get("abu_active_customer_code") || "");
    setLoyaltyOpen(true);
  };

  const addToCart = (product: CatalogProduct) => {
    const price = getFulfillmentPrice(getCatalogPrice(product), fulfillmentMode, pricingConfig);
    setCart(current => {
      const found = current.find(item => item.productId === product.id);
      if (found) return current.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { productId: product.id, name: product.name, unit: product.unit || "وحدة", price, quantity: 1, loyaltyPoints: getProductLoyaltyPoints(product) }];
    });
    toast.success(`تمت إضافة ${product.name} إلى العربة`);
  };

  const updateQuantity = (productId: string, quantity: number) => setCart(current => quantity <= 0 ? current.filter(item => item.productId !== productId) : current.map(item => item.productId === productId ? { ...item, quantity } : item));

  const submitOrder = async () => {
    if (!cart.length) return toast.error("أضف منتجًا واحدًا على الأقل إلى العربة");
    if (customer.name.trim().length < 2 || customer.phone.trim().length < 7) return toast.error("اكتب الاسم ورقم الهاتف للتواصل معك");
    if (fulfillmentMode === "delivery" && customer.address.trim().length < 3) return toast.error("اكتب العنوان أو المنطقة لأن الطلب للتوصيل");
    const orderId = `catalog_order_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const phone = customer.phone.trim();
    try {
      const result = await createOrder.mutateAsync({
        id: orderId,
        customerName: customer.name.trim(),
        customerPhone: phone,
        customerCode: customer.customerCode.trim() || undefined,
        address: customer.address.trim() || undefined,
        note: customer.note.trim() || undefined,
        itemsJson: JSON.stringify(cart),
        totalAmount: total,
        fulfillmentMethod: fulfillmentMode,
        priceAdjustmentPercent: fulfillmentMode === "delivery" ? deliveryMarkup : 0,
      });
      const assignedCustomerCode = result.customerCode || customer.customerCode.trim() || undefined;
      if (assignedCustomerCode) browserState.set("abu_active_customer_code", assignedCustomerCode);
      persistOrders([{ id: result.id, phone, customerCode: assignedCustomerCode }, ...savedOrders.filter(order => order.id !== result.id)].slice(0, 20));
      setTrackingPhone(phone);
      setLoyaltyCode(assignedCustomerCode || loyaltyCode);
      setCart([]);
      setCustomer({ name: "", phone: "", customerCode: assignedCustomerCode || "", address: "", note: "" });
      setCartOpen(false);
      setOrdersOpen(true);
      toast.success(`تم إرسال طلب ${fulfillmentLabel}. كود نقاطك: ${assignedCustomerCode || "محفوظ على رقم الهاتف"}. احتفظ به لمتابعة نفس الرصيد.`);
    } catch {
      toast.error("تعذر إرسال الطلب الآن، يرجى المحاولة مرة أخرى أو التواصل هاتفياً.");
    }
  };

  return (
    <main className="min-h-screen max-w-full overflow-x-hidden bg-[#f7f9ff] text-slate-900" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-blue-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white shadow-lg"><Sparkles className="h-5 w-5" /></span><div className="min-w-0"><h1 className="truncate text-lg font-black text-blue-950">أبو رغوة</h1><p className="truncate text-[10px] font-bold text-orange-600">{fulfillmentLabel}</p></div></div>
          <div className="flex max-w-full flex-wrap items-center justify-end gap-2"><Button variant="outline" onClick={openLoyalty} className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50"><Star className="ml-1 h-4 w-4" />نقاطي</Button><Button variant="outline" onClick={openMyOrders} className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50"><ClipboardList className="ml-1 h-4 w-4" />طلباتي{savedOrders.length > 0 && <span className="mr-1 rounded-full bg-blue-600 px-1.5 text-[10px] text-white">{savedOrders.length}</span>}</Button><Button onClick={() => setCartOpen(true)} className="relative rounded-xl bg-blue-600 px-4 hover:bg-blue-700"><ShoppingBag className="ml-1 h-4 w-4" />السلة{cartCount > 0 && <span className="absolute -left-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[10px] font-black text-white">{cartCount}</span>}</Button></div>
        </div>
      </header>

      <section className="overflow-hidden bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 px-4 py-10 text-white sm:py-14">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div><span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-black">كتالوج أبو رغوة الرسمي · {fulfillmentLabel}</span><h2 className="mt-4 max-w-2xl text-4xl font-black leading-tight sm:text-5xl">اطلب احتياجات بيتك<br />من الأقسام التي تحبها.</h2><p className="mt-4 max-w-xl text-sm leading-7 text-blue-50">{fulfillmentDescription} اختر فئة أو شركة، أضف المنتجات والتركيبات إلى العربة، ثم تابع حالة طلبك من نفس الهاتف.</p><div className="mt-6 flex flex-wrap gap-3"><a href={`tel:${CATALOG_PHONE}`} className="inline-flex items-center rounded-xl bg-white px-4 py-3 text-sm font-black text-blue-700 shadow-lg"><Phone className="ml-2 h-4 w-4" />للتواصل: {CATALOG_PHONE}</a><a href={`/catalog-offers${typeof window === "undefined" ? "" : window.location.search}`} className="inline-flex items-center rounded-xl bg-gradient-to-l from-orange-500 to-amber-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg ring-2 ring-white/50"><Sparkles className="ml-2 h-4 w-4" />عروض وخصومات حصرية</a><Button variant="secondary" onClick={openMyOrders} className="rounded-xl bg-blue-950/30 text-white hover:bg-blue-950/40"><Clock3 className="ml-2 h-4 w-4" />تابع طلباتك</Button></div></div>
          <div className="relative mx-auto w-full max-w-sm rounded-[2rem] border border-white/10 bg-gradient-to-br from-orange-500 to-amber-300 p-1 shadow-2xl"><div className="rounded-[1.8rem] bg-white p-6 text-slate-900"><div className="flex items-center justify-between"><span className="rounded-xl bg-orange-100 p-3 text-orange-700"><Package /></span><span className="text-xs font-black text-orange-600">تسوق بسهولة</span></div><p className="mt-5 text-2xl font-black">هنسيب علامة في بيتك</p><p className="mt-2 text-sm leading-6 text-slate-600">أسعار واضحة، خصومات ظاهرة، وعربة طلب مباشرة لإدارة المحل.</p><div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs font-bold"><span className="rounded-xl bg-orange-50 p-2 text-orange-800">فئات</span><span className="rounded-xl bg-blue-50 p-2 text-blue-800">شركات</span><span className="rounded-xl bg-green-50 p-2 text-green-800">عربة طلب</span></div></div></div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-900">تسوّق حسب الفئات</h2><p className="mt-1 text-sm text-slate-500">اختر الفئة لتشاهد منتجاتها وتركيباتها.</p></div><Package className="h-7 w-7 text-blue-600" /></div>{categoryCards.length ? <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{categoryCards.map(card => <button key={card.name} onClick={() => browseCategory(card.name)} className="group overflow-hidden rounded-3xl bg-white text-right shadow-sm ring-1 ring-blue-100 transition hover:-translate-y-1 hover:shadow-xl"><div className="relative aspect-square overflow-hidden bg-gradient-to-br from-blue-600 to-cyan-400">{card.image ? <img src={card.image} alt={card.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-110" /> : <div className="grid h-full place-items-center"><Package className="h-14 w-14 text-white/70" /></div>}<span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-blue-800">{card.count} عنصر</span></div><div className="p-3"><p className="font-black text-slate-900">{card.name}</p><p className="mt-1 flex items-center text-xs font-bold text-blue-600">استعرض القسم <ChevronLeft className="mr-1 h-3.5 w-3.5" /></p></div></button>)}</div> : <div className="mt-5 rounded-3xl border border-dashed border-blue-200 bg-white p-8 text-center text-sm text-slate-500">أضف الفئات يدويًا من إدارة الكتالوج لتظهر هنا.</div>}</section>

      <section className="bg-white/70 px-4 py-8"><div className="mx-auto max-w-7xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-900">تسوّق حسب الشركة</h2><p className="mt-1 text-sm text-slate-500">اختر الشركة لعرض كل محتوياتها.</p></div><Building2 className="h-7 w-7 text-cyan-600" /></div>{companyCards.length ? <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{companyCards.map(card => <button key={card.name} onClick={() => browseCompany(card.name)} className="group overflow-hidden rounded-3xl bg-white text-right shadow-sm ring-1 ring-cyan-100 transition hover:-translate-y-1 hover:shadow-xl"><div className="relative aspect-square overflow-hidden bg-gradient-to-br from-cyan-500 to-blue-700">{card.image ? <img src={card.image} alt={card.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-110" /> : <div className="grid h-full place-items-center"><Building2 className="h-14 w-14 text-white/75" /></div>}<span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-cyan-800">{card.count} عنصر</span></div><div className="p-3"><p className="font-black text-slate-900">{card.name}</p><p className="mt-1 flex items-center text-xs font-bold text-cyan-700">استعرض الشركة <ChevronLeft className="mr-1 h-3.5 w-3.5" /></p></div></button>)}</div> : <div className="mt-5 rounded-3xl border border-dashed border-cyan-200 bg-white p-8 text-center text-sm text-slate-500">أضف الشركات يدويًا من إدارة الكتالوج لتظهر هنا.</div>}</div></section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div id="catalog-products" className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-5"><div className="flex flex-col gap-3 lg:flex-row"><div className="relative flex-1"><Search className="absolute right-4 top-3.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث باسم المنتج أو الشركة أو الفئة" className="h-11 rounded-xl pr-10" /></div><select value={companyFilter} onChange={event => setCompanyFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option>الكل</option>{companyNames.map(company => <option key={company}>{company}</option>)}</select></div><div className="mt-4 flex gap-2 overflow-x-auto pb-1"><button onClick={() => setCategoryFilter("الكل")} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${categoryFilter === "الكل" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-orange-100"}`}>كل المنتجات</button>{categoryNames.map(category => <button key={category} onClick={() => setCategoryFilter(category)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${categoryFilter === category ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-800 hover:bg-orange-100"}`}>{category}</button>)}</div></div>

        <div className="mt-7 flex items-center justify-between"><div><p className="text-sm font-black text-slate-900">منتجات الكتالوج</p><p className="mt-1 text-xs text-slate-500">{filteredProducts.length} منتج متاح للتصفح</p></div><div className="hidden items-center gap-2 text-xs font-bold text-slate-500 sm:flex"><CircleHelp className="h-4 w-4 text-orange-500" />السعر القديم يظهر عند وجود خصم فعلي</div></div>
        {filteredProducts.length === 0 ? <div className="mt-8 rounded-3xl border border-dashed border-orange-200 bg-orange-50 p-12 text-center"><Package className="mx-auto h-10 w-10 text-orange-400" /><h3 className="mt-3 font-black text-slate-900">لا توجد منتجات في هذا القسم الآن</h3><p className="mt-1 text-sm text-slate-500">جرّب اختيار قسم آخر أو تواصل مع إدارة أبو رغوة.</p></div> : <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filteredProducts.map(product => { const basePrice = getCatalogPrice(product); const baseOldPrice = getCatalogOldPrice(product); const price = getFulfillmentPrice(basePrice, fulfillmentMode, pricingConfig); const oldPrice = getFulfillmentPrice(baseOldPrice, fulfillmentMode, pricingConfig); const discount = getCatalogDiscountPercent(product); const detailsUrl = getSafeCatalogDetailsUrl(product.catalogDetailsUrl); return <article key={product.id} className="group overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 transition duration-200 hover:-translate-y-1 hover:shadow-lg"><div className="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-orange-100 via-amber-50 to-white">{product.catalogImageUrl ? <img src={product.catalogImageUrl} alt={product.name} className="h-full w-full object-cover transition duration-200 group-hover:scale-105" /> : <Package className="h-16 w-16 text-orange-400 transition duration-200 group-hover:scale-110" />}{discount > 0 && <span className="absolute right-3 top-3 rounded-full bg-green-600 px-2.5 py-1 text-[11px] font-black text-white">خصم {discount}%</span>}{product.company && <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-slate-700 shadow-sm">{product.company}</span>}</div><div className="p-4"><p className="text-[11px] font-bold text-orange-700">{product.category || "منتجات أبو رغوة"}{getProductLoyaltyPoints(product) > 0 && <span className="mr-2 text-amber-700">· {getProductLoyaltyPoints(product)} نقطة</span>}</p><h3 className="mt-1 min-h-12 font-black leading-6 text-slate-900">{product.name}</h3>{product.catalogDescription ? <p className="mt-1 min-h-9 text-xs leading-5 text-slate-500">{product.catalogDescription}</p> : <p className="mt-1 text-xs text-slate-500">الوحدة: {product.unit || "وحدة"}</p>}{detailsUrl && <a href={detailsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-100">شاهد فيديو أو منشور التعريف</a>}<div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-xs text-slate-400">سعر {fulfillmentMode === "delivery" ? "التوصيل" : "المحل"}</p><p className="text-xl font-black text-orange-600">{price} <span className="text-xs">ج.م</span></p>{oldPrice > price && <p className="text-xs font-bold text-slate-400 line-through">{oldPrice} ج.م</p>}</div><Button size="sm" onClick={() => addToCart(product)} className="rounded-xl bg-slate-950 text-white hover:bg-orange-600"><Plus className="ml-1 h-4 w-4" />أضف</Button></div></div></article>; })}</div>}
      </section>

      <footer className="border-t border-orange-100 bg-white px-4 py-8 text-center"><p className="font-black text-slate-900">أبو رغوة — أصل الرغوة في مصر</p><p className="mt-1 text-sm text-orange-700">هنسيب علامة في بيتك</p><p className="mt-3 text-xs text-slate-500">للتواصل: <a className="font-black text-slate-700" href={`tel:${CATALOG_PHONE}`}>{CATALOG_PHONE}</a> · إدارة أبو رغوة</p></footer>

      {cartOpen && <div className="fixed inset-0 z-50 bg-slate-950/45" onClick={() => setCartOpen(false)}><aside onClick={event => event.stopPropagation()} className="absolute left-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl sm:left-auto sm:right-0" dir="rtl"><div className="flex items-center justify-between border-b pb-4"><div><p className="text-xs font-bold text-orange-600">طلب {fulfillmentLabel} إلى إدارة أبو رغوة</p><h2 className="text-xl font-black text-slate-900">عربة التسوق</h2></div><Button variant="ghost" size="icon" onClick={() => setCartOpen(false)}><X /></Button></div>{cart.length === 0 ? <div className="py-16 text-center"><ShoppingBag className="mx-auto h-12 w-12 text-slate-300" /><p className="mt-3 font-black text-slate-700">العربة فارغة</p><p className="mt-1 text-sm text-slate-500">اختر المنتجات التي تريد الاستفسار عنها أو طلبها.</p></div> : <div className="space-y-5 pt-5"><div className="rounded-2xl bg-blue-50 p-3 text-xs font-bold text-blue-900"><Truck className="ml-1 inline h-4 w-4" />{fulfillmentDescription}</div><div className="space-y-3">{cart.map(item => <div key={item.productId} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-900">{item.name}</p><p className="text-xs text-orange-700">{item.price} ج.م / {item.unit}</p></div><Button size="icon" variant="ghost" onClick={() => updateQuantity(item.productId, 0)} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button></div><div className="mt-3 flex items-center justify-between"><div className="flex items-center rounded-lg border bg-white"><button onClick={() => updateQuantity(item.productId, item.quantity - 1)} className="p-1.5 text-slate-600"><Minus className="h-4 w-4" /></button><span className="min-w-8 text-center text-sm font-black">{item.quantity}</span><button onClick={() => updateQuantity(item.productId, item.quantity + 1)} className="p-1.5 text-orange-600"><Plus className="h-4 w-4" /></button></div><p className="font-black text-slate-900">{item.price * item.quantity} ج.م</p></div></div>)}</div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between gap-3"><span className="font-bold text-amber-950">نقاط هذا الطلب</span><span className="text-lg font-black text-amber-700">{cartLoyaltyPoints} نقطة</span></div><p className="mt-1 text-xs leading-5 text-amber-800">تُضاف بعد تأكيد التسليم، وليست عند إرسال الطلب.</p></div><div className="flex items-center justify-between rounded-2xl bg-orange-50 p-4"><span className="font-bold text-orange-900">إجمالي {fulfillmentMode === "delivery" ? "التوصيل" : "الاستلام"}</span><span className="text-xl font-black text-orange-700">{total} ج.م</span></div><div className="space-y-3 border-t pt-5"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-orange-600" /><p className="text-sm font-black">بيانات التواصل</p></div><Input value={customer.name} onChange={event => setCustomer({ ...customer, name: event.target.value })} placeholder="الاسم الكريم *" /><Input value={customer.phone} onChange={event => setCustomer({ ...customer, phone: event.target.value })} placeholder="رقم الهاتف *" type="tel" dir="rtl" /><Input value={customer.customerCode} onChange={event => setCustomer({ ...customer, customerCode: event.target.value })} placeholder="كود الولاء (اختياري للعميل العائد)" dir="ltr" /><Input value={customer.address} onChange={event => setCustomer({ ...customer, address: event.target.value })} placeholder={fulfillmentMode === "delivery" ? "العنوان أو المنطقة *" : "العنوان أو المنطقة (اختياري)"} /><Textarea value={customer.note} onChange={event => setCustomer({ ...customer, note: event.target.value })} placeholder="أي ملاحظة للطلب (اختياري)" /><Button disabled={createOrder.isPending} onClick={submitOrder} className="w-full bg-orange-600 py-6 text-base font-black hover:bg-orange-700">{createOrder.isPending ? "جارٍ إرسال الطلب..." : `إرسال طلب ${fulfillmentLabel}`}<Check className="mr-2 h-5 w-5" /></Button><p className="text-center text-[11px] leading-5 text-slate-500">بإرسال الطلب، سيتواصل معك إدارة أبو رغوة لتأكيد توفر المنتجات والسعر وطريقة الاستلام.</p></div></div>}</aside></div>}
      {loyaltyOpen && <div className="fixed inset-0 z-50 bg-slate-950/45" onClick={() => setLoyaltyOpen(false)}><aside onClick={event => event.stopPropagation()} className="absolute left-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl sm:left-auto sm:right-0" dir="rtl"><div className="flex items-center justify-between border-b pb-4"><div><p className="text-xs font-bold text-amber-600">مكافآتك من أبو رغوة</p><h2 className="text-xl font-black">نقاطي</h2></div><Button variant="ghost" size="icon" onClick={() => setLoyaltyOpen(false)}><X /></Button></div><div className="space-y-4 pt-5"><label className="text-xs font-black text-slate-600">كود الولاء أو رقم الهاتف</label><div className="grid gap-2 sm:grid-cols-2"><Input value={loyaltyCode} onChange={event => setLoyaltyCode(event.target.value)} placeholder="كود الولاء AR-..." className="text-left" dir="ltr" /><Input value={loyaltyPhone} onChange={event => setLoyaltyPhone(event.target.value)} type="tel" placeholder="رقم الهاتف (اختياري)" /></div>{loyaltyProfileQuery.isLoading ? <p className="py-8 text-center text-sm text-slate-500">جارٍ تحميل رصيدك...</p> : !loyaltyLookupEnabled ? <p className="rounded-2xl bg-amber-50 p-4 text-center text-sm leading-6 text-amber-900">اكتب كود الولاء لعرض نقاطك، ورقم الهاتف اختياري.</p> : !loyaltyProfile ? <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm leading-6 text-slate-600">لا يوجد رصيد مسجل بهذا الكود أو الرقم حتى الآن. سجّل في عرض أو أرسل طلبًا من الكتالوج ليبدأ حسابك.</p> : <><div className="rounded-3xl bg-gradient-to-l from-amber-500 to-orange-500 p-5 text-white shadow-lg"><p className="text-sm font-bold text-amber-50">أهلًا {loyaltyProfile.name}</p><p className="mt-1 text-4xl font-black">{loyaltyProfile.points} <span className="text-base">نقطة</span></p><p className="mt-2 text-xs text-amber-50">هذا رصيدك الموحد من العروض والكتالوج والكاشير والبيع العادي.</p><p className="mt-2 text-xs text-amber-100">كودك: <strong dir="ltr">{loyaltyProfile.customerCode}</strong></p></div>{(() => { const confirmedRewards = (Array.isArray(rewardLevels) ? rewardLevels : []).filter(level => level.confirmed).sort((a, b) => a.points - b.points); const matched = [...confirmedRewards].reverse().find(level => loyaltyProfile.points >= level.points); const next = confirmedRewards.find(level => loyaltyProfile.points < level.points); return <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4"><p className="font-black text-purple-950">{matched ? `الهدية المستحقة: ${matched.giftName}` : "اجمع نقاطًا أكثر لتحصل على أول هدية"}</p>{next && <p className="mt-1 text-xs leading-5 text-purple-800">متبقي {next.points - loyaltyProfile.points} نقطة للوصول إلى: {next.giftName}</p>}</div>; })()}<div className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><h3 className="font-black text-amber-950">الهدايا المتاحة بالنقاط</h3><p className="mt-1 text-xs leading-5 text-amber-800">كلما وصل رصيدك إلى المستوى المحدد، تصبح الهدية مستحقة ويمكنك طلب استبدالها من إدارة أبو رغوة.</p><div className="mt-3 space-y-2">{(Array.isArray(rewardLevels) ? rewardLevels : []).filter(level => level.confirmed).sort((a, b) => a.points - b.points).map(level => <div key={`${level.points}-${level.giftName}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2"><span className="text-sm font-bold text-slate-800">{level.giftName}</span><span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-800">{level.points} نقطة</span></div>)}</div></div><div><h3 className="font-black text-slate-900">سجل النقاط</h3>{!loyaltyProfile.transactions?.length ? <p className="mt-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">لا توجد حركات مسجلة بعد.</p> : <div className="mt-2 space-y-2">{loyaltyProfile.transactions.slice(0, 50).map(transaction => <div key={transaction.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3"><div><p className="text-sm font-bold text-slate-800">{transaction.description}</p><p className="mt-1 text-[11px] text-slate-500">{transaction.source === "catalog" ? "شراء من الكتالوج" : transaction.source === "offer" ? "كوبون عرض" : transaction.source === "reward" ? "استبدال هدية" : "تعديل إداري"} · {new Date(transaction.createdAt).toLocaleString("ar-EG")}</p></div><strong className={transaction.points >= 0 ? "text-green-600" : "text-red-600"}>{transaction.points > 0 ? "+" : ""}{transaction.points}</strong></div>)}</div>}</div></>}</div></aside></div>}
      {ordersOpen && <div className="fixed inset-0 z-50 bg-slate-950/45" onClick={() => setOrdersOpen(false)}><aside onClick={event => event.stopPropagation()} className="absolute left-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl sm:left-auto sm:right-0"><div className="flex items-center justify-between border-b pb-4"><div><p className="text-xs font-bold text-blue-600">متابعة من نفس الهاتف</p><h2 className="text-xl font-black">طلباتي</h2></div><Button variant="ghost" size="icon" onClick={() => setOrdersOpen(false)}><X /></Button></div>{savedOrders.length === 0 ? <div className="py-16 text-center"><ClipboardList className="mx-auto h-12 w-12 text-blue-200" /><p className="mt-3 font-black">لا توجد طلبات محفوظة على هذا الهاتف</p><p className="mt-1 text-sm text-slate-500">بعد إرسال أول طلب سيظهر هنا تلقائيًا.</p></div> : <div className="space-y-4 pt-5"><div><label className="text-xs font-black text-slate-600">رقم الهاتف الذي استخدمته في الطلب</label><Input value={trackingPhone} onChange={event => setTrackingPhone(event.target.value)} className="mt-2" type="tel" placeholder="رقم الهاتف" /></div>{customerOrdersQuery.isLoading ? <p className="py-8 text-center text-sm text-slate-500">جارٍ تحديث حالة الطلبات...</p> : customerOrders.length === 0 ? <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">اكتب رقم الهاتف المسجل في الطلب لعرض المتابعة.</div> : customerOrders.map(order => { const status = CUSTOMER_STATUS[order.status as keyof typeof CUSTOMER_STATUS] || CUSTOMER_STATUS.new; let items: Array<{ name: string; quantity: number }> = []; try { items = JSON.parse(order.itemsJson); } catch {} return <article key={order.id} className="rounded-3xl border border-blue-100 bg-blue-50/40 p-4"><div className="flex items-start justify-between gap-3"><div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${status.className}`}>{status.label}</span><p className="mt-2 text-sm font-black text-slate-900">طلب #{order.id.slice(-6).toUpperCase()}</p>            <p className="mt-1 text-xs leading-5 text-slate-500">{status.detail}</p>{order.customerCode && <p className="mt-1 text-xs font-black text-purple-700">كود نقاطك: <span dir="ltr">{order.customerCode}</span></p>}</div><Truck className="h-7 w-7 text-blue-600" /></div><div className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-600">{items.map(item => <p key={item.name}>• {item.name} × {item.quantity}</p>)}</div><p className="mt-3 text-xs font-bold text-blue-700">إجمالي تقديري: {order.totalAmount} ج.م</p>{order.status === "delivered" && Number(order.loyaltyPointsAwarded || 0) > 0 && <p className="mt-1 text-xs font-black text-amber-700">أُضيف إلى رصيدك: {order.loyaltyPointsAwarded} نقطة ولاء</p>}</article>; })}</div>}</aside></div>}
    </main>
  );
}
