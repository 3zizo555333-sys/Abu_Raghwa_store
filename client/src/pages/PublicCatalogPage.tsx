import { browserState } from "@/lib/browserState";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, Check, ChevronLeft, CircleHelp, ClipboardList, Clock3, Heart, Home, Minus, Package, Percent, Phone, Plus, ShoppingBag, Sparkles, Star, Ticket, Trash2, Truck, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CATALOG_PHONE, CATALOG_WHATSAPP, catalogProductMatchesSearch, getCatalogDiscountPercent, getCatalogOldPrice, getCatalogPrice, getCatalogOrderLoyaltyPoints, getProductLoyaltyPoints, getSafeCatalogDetailsUrl, getTrustedCatalogImageUrl, recipeToCatalogProduct, type CatalogCartItem, type CatalogCategory, type CatalogCompany, type CatalogProduct, type CatalogRecipe } from "@/lib/catalog";
import { getCatalogFulfillmentMode, getFulfillmentPrice, normalizeDeliveryMarkupPercent, type CatalogPricingConfig } from "@/lib/catalogPricing";
import { trpc } from "@/lib/trpc";
import { listPublicCatalogDisplayData, listCatalogRewards } from "@/lib/supabase/operations";
import { subscribeToShopChanges } from "@/lib/supabase/products";
import { listActiveStoreOffers, type CloudStoreOffer } from "@/lib/supabase/storeOffers";
import { PromoCarousel } from "@/components/PromoCarousel";
import { listActiveCatalogCoupons, validateCatalogCoupon, type CatalogCoupon, type CatalogCouponValidation } from "@/lib/supabase/catalogCoupons";
import { readPersistentCloudCache, writePersistentCloudCache } from "@/lib/persistentCloudCache";

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

function CatalogProductCard({
  product,
  fulfillmentMode,
  pricingConfig,
  favoriteIds,
  onToggleFavorite,
  onAddToCart,
}: {
  product: CatalogProduct;
  fulfillmentMode: "pickup" | "delivery";
  pricingConfig: CatalogPricingConfig;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  onAddToCart: (product: CatalogProduct) => void;
}) {
  const price = getFulfillmentPrice(getCatalogPrice(product), fulfillmentMode, pricingConfig);
  const oldPrice = getFulfillmentPrice(getCatalogOldPrice(product), fulfillmentMode, pricingConfig);
  const discount = getCatalogDiscountPercent(product);
  const detailsUrl = getSafeCatalogDetailsUrl(product.catalogDetailsUrl);
  const isFavorite = favoriteIds.has(product.id);
  return <article className="group overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 transition duration-200 hover:-translate-y-1 hover:shadow-lg">
    <div className="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-orange-100 via-amber-50 to-white">
      {product.catalogImageUrl ? <img src={product.catalogImageUrl} alt={product.name} className="h-full w-full object-cover transition duration-200 group-hover:scale-105" /> : <Package className="h-16 w-16 text-orange-400 transition duration-200 group-hover:scale-110" />}
      {discount > 0 && <span className="absolute right-3 top-3 rounded-full bg-green-600 px-2.5 py-1 text-[11px] font-black text-white">خصم {discount}%</span>}
      <button type="button" aria-label={isFavorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"} onClick={() => onToggleFavorite(product.id)} className={`absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow-sm ${isFavorite ? "text-red-500" : "text-slate-400"}`}><Heart className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} /></button>
      {product.company && <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-slate-700 shadow-sm">{product.company}</span>}
    </div>
    <div className="p-4"><p className="text-[11px] font-bold text-orange-700">{product.category || "منتجات أبو رغوة"}{getProductLoyaltyPoints(product) > 0 && <span className="mr-2 text-amber-700">· {getProductLoyaltyPoints(product)} نقطة</span>}</p><h3 className="mt-1 min-h-12 font-black leading-6 text-slate-900">{product.name}</h3>{product.catalogDescription ? <p className="mt-1 min-h-9 text-xs leading-5 text-slate-500">{product.catalogDescription}</p> : <p className="mt-1 text-xs text-slate-500">الوحدة: {product.unit || "وحدة"}</p>}{detailsUrl && <a href={detailsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-100">شاهد فيديو أو منشور التعريف</a>}<div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-xs text-slate-400">سعر {fulfillmentMode === "delivery" ? "التوصيل" : "المحل"}</p><p className="text-xl font-black text-orange-600">{price} <span className="text-xs">ج.م</span></p>{oldPrice > price && <p className="text-xs font-bold text-slate-400 line-through">{oldPrice} ج.م</p>}</div><Button size="sm" onClick={() => onAddToCart(product)} className="rounded-xl bg-slate-950 text-white hover:bg-orange-600"><Plus className="ml-1 h-4 w-4" />أضف</Button></div></div>
  </article>;
}

export default function PublicCatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [manualProducts, setManualProducts] = useState<CatalogProduct[]>([]);
  const [recipes, setRecipes] = useState<CatalogRecipe[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [companies, setCompanies] = useState<CatalogCompany[]>([]);
  const [pricingConfig, setPricingConfig] = useState<CatalogPricingConfig>({ deliveryMarkupPercent: 0 });
  const [rewardLevels, setRewardLevels] = useState<LoyaltyRewardLevel[]>(DEFAULT_LOYALTY_REWARDS);
  const [promoOffers, setPromoOffers] = useState<CloudStoreOffer[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("الكل");
  const [companyFilter, setCompanyFilter] = useState("الكل");
  const [selectedSection, setSelectedSection] = useState<{ type: "category" | "company"; name: string } | null>(null);
  const [browseOrigin, setBrowseOrigin] = useState<"category" | "company" | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [cart, setCart] = useState<CatalogCartItem[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [showFavorites, setShowFavorites] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<"home" | "favorites" | "orders">("home");
  const [savedOrders, setSavedOrders] = useState<SavedOrderReference[]>(loadSavedOrders);
  const [trackingPhone, setTrackingPhone] = useState("");
  const [loyaltyPhone, setLoyaltyPhone] = useState(() => loadSavedOrders()[0]?.phone || "");
  const [loyaltyCode, setLoyaltyCode] = useState(() => typeof window === "undefined" ? "" : browserState.get("abu_active_customer_code") || "");
  const [customer, setCustomer] = useState({ name: "", phone: "", customerCode: typeof window === "undefined" ? "" : browserState.get("abu_active_customer_code") || "", address: "", note: "" });
  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState<CatalogCouponValidation | null>(null);
  const [activeCoupons, setActiveCoupons] = useState<CatalogCoupon[]>([]);
  const [couponLoadError, setCouponLoadError] = useState(false);
  const applyCatalogSnapshot = (data: any) => {
    setProducts((data.registeredProducts || []).filter((product: any) => product.catalogVisible === true && product.deleted_at == null).map((product: any) => ({ id: product.id, catalogSource: "product", name: product.name, unit: product.unit, categoryId: product.categoryId ?? product.category_id ?? null, companyId: product.companyId ?? product.company_id ?? null, retailPrice: product.retailPrice, wholesaleRetailPrice: product.wholesaleRetailPrice, category: product.category, company: product.company, catalogVisible: true, catalogPrice: product.catalogPrice ?? undefined, catalogOldPrice: product.catalogOldPrice ?? undefined, catalogDescription: product.catalogDescription || "", catalogDetailsUrl: product.catalogDetailsUrl || "", loyaltyPoints: product.loyaltyPoints, catalogImageUrl: getTrustedCatalogImageUrl(product.imageUrl) })));
    setManualProducts((data.manualProducts || []).filter((row: any) => row.is_visible === true && row.deleted_at == null).map((row: any) => ({ id: row.id, catalogSource: "manual", name: row.name, unit: row.unit, categoryId: row.category_id ?? null, companyId: row.company_id ?? null, wholesaleRetailPrice: row.price, catalogPrice: row.price, category: String(row.category || ""), company: String(row.company || ""), catalogDescription: row.description, catalogDetailsUrl: row.details_url, catalogVisible: true, loyaltyPoints: row.loyalty_points, catalogImageUrl: getTrustedCatalogImageUrl(row.catalog_image_url), catalogImageStoragePath: row.catalog_image_storage_path || undefined })));
    setRecipes((data.recipes || []).filter((recipe: any) => recipe.catalog_visible === true && recipe.deleted_at == null).map((recipe: any) => ({ id: String(recipe.id), version: Number(recipe.version || 1), name: String(recipe.name || ""), salePrice: Number(recipe.retail_price || 0), productionUnit: String(recipe.production_unit || "وحدة"), category: String(recipe.catalog_category || "تركيبات"), company: String(recipe.catalog_company || "أبو رغوة"), catalogVisible: recipe.catalog_visible === true, catalogPrice: recipe.catalog_price == null ? undefined : Number(recipe.catalog_price), catalogOldPrice: recipe.catalog_old_price == null ? undefined : Number(recipe.catalog_old_price), catalogDescription: String(recipe.catalog_description || ""), catalogDetailsUrl: String(recipe.catalog_details_url || ""), catalogImageUrl: getTrustedCatalogImageUrl(recipe.image_signed_url), imageStoragePath: String(recipe.image_storage_path || "") || undefined, loyaltyPoints: Number(recipe.loyalty_points || 0) })));
    setCategories((data.categories || []).map((row: any) => ({ id: row.id, name: row.name, sortOrder: Number(row.sort_order || 0), imageUrl: getTrustedCatalogImageUrl(row.image_url), imageStoragePath: row.image_storage_path || undefined })));
    setCompanies((data.companies || []).map((row: any) => ({ id: row.id, name: row.name, sortOrder: Number(row.sort_order || 0), imageUrl: getTrustedCatalogImageUrl(row.image_url), imageStoragePath: row.image_storage_path || undefined })));
    setPricingConfig((data.pricing || { deliveryMarkupPercent: 0 }) as CatalogPricingConfig);
  };
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => Promise<unknown>) | undefined;
    const requestedShopId = typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("shop_id") || undefined;
    listPublicCatalogDisplayData({ shopId: requestedShopId }).then(data => {
      if (!active) return;
      applyCatalogSnapshot(data);
      void subscribeToShopChanges(data.shopId, () => {
        void listPublicCatalogDisplayData({ shopId: data.shopId }).then(fresh => {
          if (!active) return;
          applyCatalogSnapshot(fresh);
        }).catch(() => undefined);
        void listActiveStoreOffers().then(freshOffers => { if (active) setPromoOffers(freshOffers); }).catch(() => undefined);
      }).then(cleanup => { if (active) unsubscribe = cleanup; else void cleanup(); }).catch(() => undefined);
      return Promise.allSettled([listCatalogRewards(data.shopId), listActiveCatalogCoupons(data.shopId)] as const);
    }).then(result => {
      if (!active || !result) return;
      const [rewardsResult, couponsResult] = result;
      if (rewardsResult.status === "fulfilled") setRewardLevels(rewardsResult.value.map((row: any) => ({ points: Number(row.points_required), giftName: String(row.gift_name), confirmed: true })));
      if (couponsResult.status === "fulfilled") { setActiveCoupons(couponsResult.value); setCouponLoadError(false); }
      else { setCouponLoadError(true); }
    }).catch(() => undefined);
    return () => { active = false; if (unsubscribe) void unsubscribe(); };
  }, []);
  useEffect(() => {
    let active = true;
    const refreshOffers = async () => {
      try {
        const offers = await listActiveStoreOffers();
        if (active) setPromoOffers(offers);
      } catch {
        if (active) void readPersistentCloudCache<CloudStoreOffer[]>("public-store-offers").then(cached => { if (active && cached) setPromoOffers(cached); });
      }
    };
    void readPersistentCloudCache<CloudStoreOffer[]>("public-store-offers").then(cached => { if (active && cached) setPromoOffers(cached); });
    void refreshOffers();
    const timer = window.setInterval(() => void refreshOffers(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const createOrder = trpc.catalog.createOrder.useMutation();
  const orderAttempt = useRef<{ fingerprint: string; id: string } | null>(null);
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
    return { name, count: items.length, image: categories.find(category => category.name === name)?.imageUrl || items.find(item => item.catalogImageUrl)?.catalogImageUrl };
  }), [categoryNames, catalogProducts, categories]);
  const companyCards = useMemo(() => companyNames.map(name => {
    const items = catalogProducts.filter(product => product.company === name);
    return { name, count: items.length, image: companies.find(company => company.name === name)?.imageUrl || items.find(item => item.catalogImageUrl)?.catalogImageUrl };
  }), [companyNames, catalogProducts, companies]);
  const linkedCompanyCards = useMemo(() => categoryFilter === "الكل" ? [] : companyCards.filter(card => catalogProducts.some(product => product.category === categoryFilter && product.company === card.name)).map(card => ({ ...card, count: catalogProducts.filter(product => product.category === categoryFilter && product.company === card.name).length })), [categoryFilter, companyCards, catalogProducts]);
  const linkedCategoryCards = useMemo(() => companyFilter === "الكل" ? [] : categoryCards.filter(card => catalogProducts.some(product => product.company === companyFilter && product.category === card.name)).map(card => ({ ...card, count: catalogProducts.filter(product => product.company === companyFilter && product.category === card.name).length })), [companyFilter, categoryCards, catalogProducts]);
  const selectedCategoryId = selectedSection?.type === "category" ? categories.find(category => category.name === selectedSection.name)?.id : undefined;
  const selectedCompanyId = selectedSection?.type === "company" ? companies.find(company => company.name === selectedSection.name)?.id : undefined;
  const productBelongsToCategory = (product: CatalogProduct, category: CatalogCategory) => product.categoryId ? product.categoryId === category.id : product.category === category.name;
  const productBelongsToCompany = (product: CatalogProduct, company: CatalogCompany) => product.companyId ? product.companyId === company.id : product.company === company.name;
  const dedicatedScopeProducts = selectedSection?.type === "category"
    ? catalogProducts.filter(product => selectedCategoryId ? (product.categoryId ? product.categoryId === selectedCategoryId : product.category === selectedSection.name) : product.category === selectedSection.name)
    : selectedSection?.type === "company"
      ? catalogProducts.filter(product => selectedCompanyId ? (product.companyId ? product.companyId === selectedCompanyId : product.company === selectedSection.name) : product.company === selectedSection.name)
      : [];
  const dedicatedNavigationProducts = selectedSection?.type === "category" && companyFilter !== "الكل"
    ? dedicatedScopeProducts.filter(product => { const company = companies.find(row => row.name === companyFilter); return company ? productBelongsToCompany(product, company) : product.company === companyFilter; })
    : selectedSection?.type === "company" && categoryFilter !== "الكل"
      ? dedicatedScopeProducts.filter(product => { const category = categories.find(row => row.name === categoryFilter); return category ? productBelongsToCategory(product, category) : product.category === categoryFilter; })
      : dedicatedScopeProducts;
  const dedicatedCompanyCards = selectedSection?.type === "category"
    ? companyCards.filter(card => dedicatedScopeProducts.some(product => { const company = companies.find(row => row.name === card.name); return company ? productBelongsToCompany(product, company) : product.company === card.name; }))
    : [];
  const dedicatedCategoryCards = selectedSection?.type === "company"
    ? categoryCards.filter(card => dedicatedScopeProducts.some(product => { const category = categories.find(row => row.name === card.name); return category ? productBelongsToCategory(product, category) : product.category === card.name; }))
    : [];
  const dedicatedProducts = dedicatedNavigationProducts;
  const homeProducts = showFavorites ? catalogProducts.filter(product => favoriteIds.has(product.id)) : catalogProducts;
  const bestDealProducts = useMemo(() => catalogProducts.filter(product => getCatalogDiscountPercent(product) > 0).sort((a, b) => getCatalogDiscountPercent(b) - getCatalogDiscountPercent(a)).slice(0, 8), [catalogProducts]);
  const companyDealGroups = useMemo(() => {
    const groups = new Map<string, CatalogProduct[]>();
    for (const product of catalogProducts) {
      const company = String(product.company || "").trim();
      if (!company || getCatalogDiscountPercent(product) <= 0) continue;
      groups.set(company, [...(groups.get(company) || []), product]);
    }
    return Array.from(groups, ([name, items]) => ({ name, items: items.sort((a, b) => getCatalogDiscountPercent(b) - getCatalogDiscountPercent(a)).slice(0, 4), maxDiscount: Math.max(...items.map(getCatalogDiscountPercent)) }))
      .sort((a, b) => b.maxDiscount - a.maxDiscount).slice(0, 6);
  }, [catalogProducts]);
  const quickAccessItems = [
    { targetId: "catalog-coupons", title: "كوبونات المشتريات", count: `${activeCoupons.length} كوبون`, Icon: Ticket, color: "text-violet-700 bg-violet-100 ring-violet-200" },
    { targetId: "catalog-best-prices", title: "أفضل الأسعار", count: `${bestDealProducts.length} عرض`, Icon: Percent, color: "text-emerald-700 bg-emerald-100 ring-emerald-200" },
    { targetId: "catalog-company-deals", title: "عروض الشركات", count: `${companyDealGroups.length} شركة`, Icon: Building2, color: "text-cyan-700 bg-cyan-100 ring-cyan-200" },
    { targetId: "catalog-new-arrivals", title: "أحدث المنتجات", count: `${Math.min(homeProducts.length, 8)} منتج`, Icon: Package, color: "text-orange-700 bg-orange-100 ring-orange-200" },
  ];
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountedTotal = couponResult?.valid ? Number(couponResult.final_amount ?? total) : total;
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
    setShowFavorites(false);
    setCategoryFilter(category);
    setCompanyFilter("الكل");
    setSelectedSection({ type: "category", name: category });
    setBrowseOrigin("category");
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const browseCompany = (company: string) => {
    setShowFavorites(false);
    setCompanyFilter(company);
    setCategoryFilter("الكل");
    setSelectedSection({ type: "company", name: company });
    setBrowseOrigin("company");
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const clearCatalogBrowse = () => {
    setShowFavorites(false);
    setActiveNav("home");
    setCategoryFilter("الكل");
    setCompanyFilter("الكل");
    setSelectedSection(null);
    setBrowseOrigin(null);
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
  const applyCoupon = async () => {
    if (!couponCode.trim()) return toast.error("اكتب رمز الكوبون أولاً");
    try {
      const result = await validateCatalogCoupon(couponCode, total);
      setCouponResult(result);
      if (result.valid) toast.success(`تم تطبيق الخصم ${Number(result.discount_amount || 0).toFixed(2)} ج.م`);
      else toast.error(result.error_code === "min_order_not_met" ? `الحد الأدنى للكوبون ${result.min_order_amount || 0} ج.م` : "الكوبون غير صالح أو منتهي");
    } catch { toast.error("تعذر التحقق من الكوبون الآن"); }
  };

  const submitOrder = async () => {
    if (!cart.length) return toast.error("أضف منتجًا واحدًا على الأقل إلى العربة");
    if (customer.name.trim().length < 2 || customer.phone.trim().length < 7) return toast.error("اكتب الاسم ورقم الهاتف للتواصل معك");
    if (fulfillmentMode === "delivery" && customer.address.trim().length < 3) return toast.error("اكتب العنوان أو المنطقة لأن الطلب للتوصيل");
    const phone = customer.phone.trim();
    const payload = {
      customerName: customer.name.trim(),
      customerPhone: phone,
      customerCode: customer.customerCode.trim() || undefined,
      address: customer.address.trim() || undefined,
      note: customer.note.trim() || undefined,
      itemsJson: JSON.stringify(cart),
      totalAmount: discountedTotal,
      couponCode: couponResult?.valid ? couponCode.trim().toUpperCase() : undefined,
      fulfillmentMethod: fulfillmentMode,
      priceAdjustmentPercent: fulfillmentMode === "delivery" ? deliveryMarkup : 0,
    };
    const fingerprint = JSON.stringify(payload);
    if (!orderAttempt.current || orderAttempt.current.fingerprint !== fingerprint) {
      orderAttempt.current = { fingerprint, id: `catalog_order_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
    }
    try {
      const result = await createOrder.mutateAsync({
        id: orderAttempt.current.id,
        ...payload,
      });
      const assignedCustomerCode = result.customerCode || customer.customerCode.trim() || undefined;
      if (assignedCustomerCode) browserState.set("abu_active_customer_code", assignedCustomerCode);
      persistOrders([{ id: result.id, phone, customerCode: assignedCustomerCode }, ...savedOrders.filter(order => order.id !== result.id)].slice(0, 20));
      setTrackingPhone(phone);
      setLoyaltyCode(assignedCustomerCode || loyaltyCode);
      setCart([]);
      setCouponCode("");
      setCouponResult(null);
      orderAttempt.current = null;
      setCustomer({ name: "", phone: "", customerCode: assignedCustomerCode || "", address: "", note: "" });
      setCartOpen(false);
      setOrdersOpen(true);
      toast.success(assignedCustomerCode
        ? `تم حفظ طلب ${fulfillmentLabel}. كود نقاطك: ${assignedCustomerCode}. احتفظ به لمتابعة رصيدك.`
        : `تم حفظ طلب ${fulfillmentLabel} بنجاح. سلة التسوق جاهزة لطلب جديد.`);
    } catch {
      toast.error("تعذر إرسال الطلب الآن، يرجى المحاولة مرة أخرى أو التواصل هاتفياً.");
    }
  };

  if (selectedSection) {
    const categoryFirst = selectedSection.type === "category";
    const activeCategory = categoryFirst ? selectedSection.name : categoryFilter;
    const activeCompany = categoryFirst ? companyFilter : selectedSection.name;
    const title = activeCategory !== "الكل" && activeCompany !== "الكل" ? `${activeCategory} - ${activeCompany}` : categoryFirst ? activeCategory : activeCompany;
    const setDedicatedCategory = (name: string) => {
      setShowFavorites(false);
      setCategoryFilter(name);
      setCompanyFilter(categoryFirst ? "الكل" : activeCompany);
        if (!categoryFirst) setSelectedSection({ type: "company", name: activeCompany });
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    const setDedicatedCompany = (name: string) => {
      setShowFavorites(false);
      setCompanyFilter(name);
        setSelectedSection({ type: "category", name: activeCategory });
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    return <main className="min-h-screen bg-[#f7f9ff] pb-24 text-slate-900" dir="rtl">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-md backdrop-blur">
        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-4">
          <div className="flex items-center gap-3"><button type="button" aria-label="العودة للرئيسية" onClick={clearCatalogBrowse} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-800 hover:bg-orange-100 hover:text-orange-700"><ArrowRight className="h-5 w-5" /></button><div className="min-w-0 flex-1"><p className="text-[11px] font-black text-orange-600">تصفح الكتالوج</p><h1 className="truncate text-lg font-black text-slate-950">{title}</h1></div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">{dedicatedProducts.length} منتج</span></div>
          {categoryFirst ? <>
            <div className="mt-3 flex gap-3 overflow-x-auto border-t border-slate-100 pt-3">{categoryCards.map(card => <button type="button" key={card.name} onClick={() => browseCategory(card.name)} className={`flex w-16 shrink-0 flex-col items-center gap-1 text-center text-[10px] font-black ${activeCategory === card.name ? "text-orange-700" : "text-slate-600"}`}><span className={`grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-white ${activeCategory === card.name ? "ring-4 ring-orange-400" : "ring-1 ring-slate-200"}`}>{card.image ? <img src={card.image} alt="" className="h-full w-full object-contain" /> : <Package className="h-5 w-5 text-slate-400" />}</span><span className="w-full truncate">{card.name}</span></button>)}</div>
            <div aria-label="شريط الشركات التابعة للفئة" className="mt-2 flex gap-3 overflow-x-auto border-t border-slate-100 pt-2"><button type="button" onClick={() => { setCompanyFilter("الكل"); setSelectedSection({ type: "category", name: activeCategory }); window.scrollTo({ top: 0, behavior: "instant" }); }} className={`flex w-16 shrink-0 flex-col items-center gap-1 text-center text-[10px] font-black ${activeCompany === "الكل" ? "text-slate-950" : "text-slate-600"}`}><span className={`grid h-12 w-12 place-items-center rounded-full bg-slate-950 text-xs text-white ${activeCompany === "الكل" ? "ring-4 ring-orange-300" : ""}`}>الكل</span><span>كل الشركات</span></button>{dedicatedCompanyCards.map(card => <button type="button" key={card.name} onClick={() => setDedicatedCompany(card.name)} className={`flex w-16 shrink-0 flex-col items-center gap-1 text-center text-[10px] font-black ${activeCompany === card.name ? "text-orange-700" : "text-slate-600"}`}><span className={`grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-white ${activeCompany === card.name ? "ring-4 ring-orange-400" : "ring-1 ring-slate-200"}`}>{card.image ? <img src={card.image} alt="" className="h-full w-full object-contain" /> : <Building2 className="h-5 w-5 text-slate-400" />}</span><span className="w-full truncate">{card.name}</span></button>)}</div>
          </> : <>
            <div className="mt-3 flex gap-3 overflow-x-auto border-t border-slate-100 pt-3">{companyCards.map(card => <button type="button" key={card.name} onClick={() => browseCompany(card.name)} className={`flex w-16 shrink-0 flex-col items-center gap-1 text-center text-[10px] font-black ${activeCompany === card.name ? "text-cyan-700" : "text-slate-600"}`}><span className={`grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-white ${activeCompany === card.name ? "ring-4 ring-cyan-400" : "ring-1 ring-slate-200"}`}>{card.image ? <img src={card.image} alt="" className="h-full w-full object-contain" /> : <Building2 className="h-5 w-5 text-slate-400" />}</span><span className="w-full truncate">{card.name}</span></button>)}</div>
            <div aria-label="شريط الفئات التابعة للشركة" className="mt-2 flex gap-3 overflow-x-auto border-t border-slate-100 pt-2"><button type="button" onClick={() => { setCategoryFilter("الكل"); setSelectedSection({ type: "company", name: activeCompany }); window.scrollTo({ top: 0, behavior: "instant" }); }} className={`flex w-16 shrink-0 flex-col items-center gap-1 text-center text-[10px] font-black ${activeCategory === "الكل" ? "text-slate-950" : "text-slate-600"}`}><span className={`grid h-12 w-12 place-items-center rounded-full bg-slate-950 text-xs text-white ${activeCategory === "الكل" ? "ring-4 ring-cyan-300" : ""}`}>الكل</span><span>كل الفئات</span></button>{dedicatedCategoryCards.map(card => <button type="button" key={card.name} onClick={() => setDedicatedCategory(card.name)} className={`flex w-16 shrink-0 flex-col items-center gap-1 text-center text-[10px] font-black ${activeCategory === card.name ? "text-cyan-700" : "text-slate-600"}`}><span className={`grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-white ${activeCategory === card.name ? "ring-4 ring-cyan-400" : "ring-1 ring-slate-200"}`}>{card.image ? <img src={card.image} alt="" className="h-full w-full object-contain" /> : <Package className="h-5 w-5 text-slate-400" />}</span><span className="w-full truncate">{card.name}</span></button>)}</div>
          </>}
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-3 py-4 sm:px-4"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="truncate text-base font-black text-slate-900">{title} <span className="text-sm text-slate-500">({dedicatedProducts.length})</span></h2><div className="hidden items-center gap-2 text-xs font-bold text-slate-500 sm:flex"><CircleHelp className="h-4 w-4 text-orange-500" />تصفح سريع</div></div>{dedicatedProducts.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{dedicatedProducts.map(product => <CatalogProductCard key={product.id} product={product} fulfillmentMode={fulfillmentMode} pricingConfig={pricingConfig} favoriteIds={favoriteIds} onToggleFavorite={id => setFavoriteIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onAddToCart={addToCart} />)}</div> : <div className="rounded-3xl border border-dashed border-orange-200 bg-gradient-to-br from-orange-50 via-white to-blue-50 p-10 text-center"><Package className="mx-auto h-12 w-12 text-orange-400" /><h3 className="mt-3 font-black">لا توجد منتجات بهذا الاختيار</h3><p className="mt-2 text-sm leading-7 text-slate-600">عذراً، لا توجد منتجات متوفرة حالياً في هذا القسم. سيتم إضافتها قريباً! ✨</p></div>}</section>
      {cart.length > 0 && <button type="button" onClick={() => setCartOpen(true)} className="fixed bottom-[4.8rem] left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-2xl ring-4 ring-white/80"><span className="flex items-center gap-2 text-sm font-black"><ShoppingBag className="h-5 w-5 text-orange-400" />{cartCount} صنف في السلة</span><span className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-black">عرض السلة</span></button>}
      {cartOpen && <div className="fixed inset-0 z-50 bg-slate-950/45" onClick={() => setCartOpen(false)}><aside onClick={event => event.stopPropagation()} className="absolute left-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl sm:left-auto sm:right-0" dir="rtl"><div className="flex items-center justify-between border-b pb-4"><div><p className="text-xs font-bold text-orange-600">طلب {fulfillmentLabel} إلى إدارة أبو رغوة</p><h2 className="text-xl font-black text-slate-900">عربة التسوق</h2></div><Button variant="ghost" size="icon" onClick={() => setCartOpen(false)}><X /></Button></div>{cart.length === 0 ? <div className="py-16 text-center"><ShoppingBag className="mx-auto h-12 w-12 text-slate-300" /><p className="mt-3 font-black text-slate-700">العربة فارغة</p><p className="mt-1 text-sm text-slate-500">اختر المنتجات التي تريد الاستفسار عنها أو طلبها.</p></div> : <div className="space-y-5 pt-5"><div className="rounded-2xl bg-blue-50 p-3 text-xs font-bold text-blue-900"><Truck className="ml-1 inline h-4 w-4" />{fulfillmentDescription}</div><div className="space-y-3">{cart.map(item => <div key={item.productId} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-900">{item.name}</p><p className="text-xs text-orange-700">{item.price} ج.م / {item.unit}</p></div><Button size="icon" variant="ghost" onClick={() => updateQuantity(item.productId, 0)} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button></div><div className="mt-3 flex items-center justify-between"><div className="flex items-center rounded-lg border bg-white"><button onClick={() => updateQuantity(item.productId, item.quantity - 1)} className="p-1.5 text-slate-600"><Minus className="h-4 w-4" /></button><span className="min-w-8 text-center text-sm font-black">{item.quantity}</span><button onClick={() => updateQuantity(item.productId, item.quantity + 1)} className="p-1.5 text-orange-600"><Plus className="h-4 w-4" /></button></div><p className="font-black text-slate-900">{item.price * item.quantity} ج.م</p></div></div>)}</div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between gap-3"><span className="font-bold text-amber-950">نقاط هذا الطلب</span><span className="text-lg font-black text-amber-700">{cartLoyaltyPoints} نقطة</span></div><p className="mt-1 text-xs leading-5 text-amber-800">تُضاف بعد تأكيد التسليم، وليست عند إرسال الطلب.</p></div><div className="rounded-2xl border border-violet-100 bg-violet-50 p-3">{activeCoupons.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{activeCoupons.map(coupon => <button type="button" key={coupon.id} onClick={() => { setCouponCode(coupon.code); setCouponResult(null); }} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-violet-700 ring-1 ring-violet-200">{coupon.code} · {coupon.title}</button>)}</div>}<div className="flex gap-2"><Input value={couponCode} onChange={event => { setCouponCode(event.target.value.toUpperCase()); setCouponResult(null); }} placeholder="رمز كوبون الخصم" dir="ltr" /><Button type="button" variant="outline" onClick={() => void applyCoupon()}>تطبيق</Button></div>{couponResult?.valid && <p className="mt-2 text-xs font-bold text-green-700">تم الخصم: {couponResult.discount_amount} ج.م</p>}</div><div className="flex items-center justify-between rounded-2xl bg-orange-50 p-4"><span className="font-bold text-orange-900">إجمالي {fulfillmentMode === "delivery" ? "التوصيل" : "الاستلام"}</span><span className="text-xl font-black text-orange-700">{discountedTotal} ج.م</span></div><div className="space-y-3 border-t pt-5"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-orange-600" /><p className="text-sm font-black">بيانات التواصل</p></div><Input value={customer.name} onChange={event => setCustomer({ ...customer, name: event.target.value })} placeholder="الاسم الكريم *" /><Input value={customer.phone} onChange={event => setCustomer({ ...customer, phone: event.target.value })} placeholder="رقم الهاتف *" type="tel" dir="rtl" /><Input value={customer.customerCode} onChange={event => setCustomer({ ...customer, customerCode: event.target.value })} placeholder="كود الولاء (اختياري للعميل العائد)" dir="ltr" /><Input value={customer.address} onChange={event => setCustomer({ ...customer, address: event.target.value })} placeholder={fulfillmentMode === "delivery" ? "العنوان أو المنطقة *" : "العنوان أو المنطقة (اختياري)"} /><Textarea value={customer.note} onChange={event => setCustomer({ ...customer, note: event.target.value })} placeholder="العنوان بالتفصيل (اختياري - في حال التوصيل)" /><Button disabled={createOrder.isPending} onClick={submitOrder} className="w-full bg-orange-600 py-6 text-base font-black hover:bg-orange-700">{createOrder.isPending ? "جارٍ إرسال الطلب..." : `إرسال طلب ${fulfillmentLabel}`}<Check className="mr-2 h-5 w-5" /></Button><p className="text-center text-[11px] leading-5 text-slate-500">بإرسال الطلب، سيتواصل معك إدارة أبو رغوة لتأكيد توفر المنتجات والسعر وطريقة الاستلام.</p></div></div>}</aside></div>}
    </main>;
  }

  if (showAllCategories || showAllCompanies) {
    const directoryTitle = showAllCategories ? "جميع الأقسام" : "جميع العلامات التجارية";
    const directoryCards = showAllCategories ? categoryCards : companyCards;
    const isCategoryDirectory = showAllCategories;
    return (
      <main className="min-h-screen bg-[#f7f9ff] text-slate-900" dir="rtl">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <button type="button" aria-label="العودة للرئيسية" onClick={() => { setShowAllCategories(false); setShowAllCompanies(false); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-800 transition hover:bg-orange-100 hover:text-orange-700">
              <ArrowRight className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-black text-slate-950">{directoryTitle}</h1>
            <span className="mr-auto rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">{directoryCards.length}</span>
          </div>
        </header>
        <section className="mx-auto max-w-5xl px-4 py-6">
          {directoryCards.length ? <div className="grid grid-cols-3 gap-3 sm:gap-5">{directoryCards.map(card => <button key={card.name} type="button" onClick={() => { if (isCategoryDirectory) browseCategory(card.name); else browseCompany(card.name); setShowAllCategories(false); setShowAllCompanies(false); }} className="group overflow-hidden rounded-2xl bg-white text-right shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-lg">
            <div className={`relative aspect-square overflow-hidden ${isCategoryDirectory ? "bg-gradient-to-br from-blue-600 to-cyan-400" : "bg-gradient-to-br from-cyan-500 to-blue-700"}`}>{card.image ? <img src={card.image} alt={card.name} className={`h-full w-full transition duration-300 group-hover:scale-105 ${isCategoryDirectory ? "object-cover" : "object-contain p-2 sm:p-4"}`} /> : <div className="grid h-full place-items-center">{isCategoryDirectory ? <Package className="h-10 w-10 text-white/70" /> : <Building2 className="h-10 w-10 text-white/75" />}</div>}</div>
            <div className="p-2.5 sm:p-3"><p className="truncate text-xs font-black text-slate-900 sm:text-sm">{card.name}</p><p className="mt-1 text-[10px] font-bold text-slate-500 sm:text-xs">{card.count} عنصر</p></div>
          </button>)}</div> : <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500">لا توجد عناصر متاحة حالياً.</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen max-w-full overflow-x-hidden bg-[#f7f9ff] pb-28 text-slate-900" dir="rtl">
      <PromoCarousel offers={promoOffers} />
      <header className="relative z-20 border-b border-blue-100 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white shadow-lg"><Sparkles className="h-5 w-5" /></span><div className="min-w-0"><h1 className="truncate text-lg font-black text-blue-950">أبو رغوة</h1><p className="truncate text-[10px] font-bold text-orange-600">{fulfillmentLabel}</p></div></div>
          <div className="flex max-w-full flex-wrap items-center justify-end gap-2"><Button variant="outline" onClick={openLoyalty} className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50"><Star className="ml-1 h-4 w-4" />نقاطي</Button><Button variant="outline" onClick={openMyOrders} className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50"><ClipboardList className="ml-1 h-4 w-4" />طلباتي{savedOrders.length > 0 && <span className="mr-1 rounded-full bg-blue-600 px-1.5 text-[10px] text-white">{savedOrders.length}</span>}</Button><Button onClick={() => setCartOpen(true)} className="relative rounded-xl bg-blue-600 px-4 hover:bg-blue-700"><ShoppingBag className="ml-1 h-4 w-4" />السلة{cartCount > 0 && <span className="absolute -left-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[10px] font-black text-white">{cartCount}</span>}</Button></div>
        </div>
      </header>
      <section className="overflow-hidden bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 px-4 py-10 text-white sm:py-14">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div><span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-black">كتالوج أبو رغوة الرسمي · {fulfillmentLabel}</span><h2 className="mt-4 max-w-2xl text-4xl font-black leading-tight sm:text-5xl">اطلب احتياجات بيتك<br />من الأقسام التي تحبها.</h2><p className="mt-4 max-w-xl text-sm leading-7 text-blue-50">{fulfillmentDescription} اختر فئة أو شركة، أضف المنتجات والتركيبات إلى العربة، ثم تابع حالة طلبك من نفس الهاتف.</p><div className="mt-6 flex flex-wrap gap-3"><a href={`tel:${CATALOG_PHONE}`} className="inline-flex items-center rounded-xl bg-white px-4 py-3 text-sm font-black text-blue-700 shadow-lg"><Phone className="ml-2 h-4 w-4" />للتواصل: {CATALOG_PHONE}</a><a href={`/catalog-offers${typeof window === "undefined" ? "" : window.location.search}`} className="inline-flex items-center rounded-xl bg-gradient-to-l from-orange-500 to-amber-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg ring-2 ring-white/50"><Sparkles className="ml-2 h-4 w-4" />عروض وخصومات حصرية</a><a href="/community" className="inline-flex items-center rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 shadow-lg ring-2 ring-white/50">🎁 جوائز ومسابقات</a><Button variant="secondary" onClick={openMyOrders} className="rounded-xl bg-blue-950/30 text-white hover:bg-blue-950/40"><Clock3 className="ml-2 h-4 w-4" />تابع طلباتك</Button></div></div>
          <div className="relative mx-auto w-full max-w-sm rounded-[2rem] border border-white/10 bg-gradient-to-br from-orange-500 to-amber-300 p-1 shadow-2xl"><div className="rounded-[1.8rem] bg-white p-6 text-slate-900"><div className="flex items-center justify-between"><span className="rounded-xl bg-orange-100 p-3 text-orange-700"><Package /></span><span className="text-xs font-black text-orange-600">تسوق بسهولة</span></div><p className="mt-5 text-2xl font-black">هنسيب علامة في بيتك</p><p className="mt-2 text-sm leading-6 text-slate-600">أسعار واضحة، خصومات ظاهرة، وعربة طلب مباشرة لإدارة المحل.</p><div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs font-bold"><span className="rounded-xl bg-orange-50 p-2 text-orange-800">فئات</span><span className="rounded-xl bg-blue-50 p-2 text-blue-800">شركات</span><span className="rounded-xl bg-green-50 p-2 text-green-800">عربة طلب</span></div></div></div>
        </div>
      </section>

      <nav aria-label="الوصول السريع لأقسام الكتالوج" className="mx-auto max-w-7xl px-4 pt-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {quickAccessItems.map(({ targetId, title, count, Icon, color }) => <button key={targetId} type="button" onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" })} className="group flex min-h-[76px] items-center gap-3 rounded-2xl bg-white p-3 text-right shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-4">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${color}`}><Icon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-slate-900 sm:text-sm">{title}</span><span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{count}</span></span>
          </button>)}
        </div>
      </nav>

      <section className="mx-auto max-w-7xl px-4 py-8"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-900">تسوّق حسب الفئات</h2><p className="mt-1 text-sm text-slate-500">مرر يميناً ويساراً واختر الفئة لتشاهد منتجاتها.</p></div><div dir="ltr" className="flex items-center gap-2"><button type="button" aria-label="عرض جميع الأقسام" onClick={() => setShowAllCategories(true)} className="grid h-10 w-10 place-items-center rounded-full bg-orange-50 text-orange-700 shadow-sm ring-1 ring-orange-100 transition hover:bg-orange-100"><ChevronLeft className="h-5 w-5" /></button><Package className="h-7 w-7 text-blue-600" /></div></div><div id="catalog-categories" className="mt-5 flex snap-x gap-4 overflow-x-auto pb-3">{categoryCards.slice(0, 6).map(card => <button key={card.name} onClick={() => browseCategory(card.name)} className="group w-44 shrink-0 snap-start overflow-hidden rounded-3xl bg-white text-right shadow-sm ring-1 ring-blue-100 transition hover:-translate-y-1 hover:shadow-xl"><div className="relative aspect-square overflow-hidden bg-gradient-to-br from-blue-600 to-cyan-400">{card.image ? <img src={card.image} alt={card.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-110" /> : <div className="grid h-full place-items-center"><Package className="h-14 w-14 text-white/70" /></div>}<span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-blue-800">{card.count} عنصر</span></div><div className="p-3"><p className="truncate font-black text-slate-900">{card.name}</p><p className="mt-1 flex items-center text-xs font-bold text-blue-600">استعرض القسم <ChevronLeft className="mr-1 h-3.5 w-3.5" /></p></div></button>)}</div>{!categoryCards.length && <div className="mt-5 rounded-3xl border border-dashed border-blue-200 bg-white p-8 text-center text-sm text-slate-500">لا توجد فئات متاحة حالياً.</div>}</section>

      <section id="catalog-companies" className="bg-white/70 px-4 py-8"><div className="mx-auto max-w-7xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-900">تسوّق حسب الشركة</h2><p className="mt-1 text-sm text-slate-500">مرر بين الشركات واعرض كل محتوياتها.</p></div><div dir="ltr" className="flex items-center gap-2"><button type="button" aria-label="عرض جميع العلامات التجارية" onClick={() => setShowAllCompanies(true)} className="grid h-10 w-10 place-items-center rounded-full bg-cyan-50 text-cyan-700 shadow-sm ring-1 ring-cyan-100 transition hover:bg-cyan-100"><ChevronLeft className="h-5 w-5" /></button><Building2 className="h-7 w-7 text-cyan-600" /></div></div><div className="mt-5 flex snap-x gap-4 overflow-x-auto pb-3">{companyCards.slice(0, 6).map(card => <button key={card.name} onClick={() => browseCompany(card.name)} className="group w-44 shrink-0 snap-start overflow-hidden rounded-3xl bg-white text-right shadow-sm ring-1 ring-cyan-100 transition hover:-translate-y-1 hover:shadow-xl"><div className="relative aspect-square overflow-hidden bg-gradient-to-br from-cyan-500 to-blue-700">{card.image ? <img src={card.image} alt={card.name} className="h-full w-full object-contain p-4 transition duration-300 group-hover:scale-110" /> : <div className="grid h-full place-items-center"><Building2 className="h-14 w-14 text-white/75" /></div>}<span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-cyan-800">{card.count} عنصر</span></div><div className="p-3"><p className="truncate font-black text-slate-900">{card.name}</p><p className="mt-1 flex items-center text-xs font-bold text-cyan-700">استعرض الشركة <ChevronLeft className="mr-1 h-3.5 w-3.5" /></p></div></button>)}</div>{!companyCards.length && <div className="mt-5 rounded-3xl border border-dashed border-cyan-200 bg-white p-8 text-center text-sm text-slate-500">لا توجد شركات متاحة حالياً.</div>}</div></section>

      <section id="catalog-coupons" dir="rtl" className="mx-auto max-w-7xl px-4 py-7">
        <div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-black text-violet-950"><Ticket className="h-6 w-6 text-violet-600" />كوبونات المشتريات</h2><p className="mt-1 text-sm text-slate-500">انسخ الرمز أو ضعه في عربة التسوق لتطبيقه على طلبك.</p></div><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-800">{activeCoupons.length} كوبون</span></div>
        {activeCoupons.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{activeCoupons.map(coupon => <article key={coupon.id} className="rounded-2xl border border-violet-100 bg-gradient-to-l from-white to-violet-50 p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><div><p className="font-black text-slate-900">{coupon.title}</p>{coupon.description && <p className="mt-1 text-xs leading-5 text-slate-600">{coupon.description}</p>}</div><span className="shrink-0 rounded-full bg-violet-600 px-3 py-1 text-xs font-black text-white">{coupon.discount_type === "percentage" ? `${coupon.discount_value}% خصم` : `${coupon.discount_value} ج.م خصم`}</span></div><p className="mt-2 text-xs text-slate-500">الحد الأدنى للطلب: {Number(coupon.min_order_amount || 0).toLocaleString("ar-EG")} ج.م{coupon.max_discount_amount != null ? ` · أقصى خصم ${Number(coupon.max_discount_amount).toLocaleString("ar-EG")} ج.م` : ""}</p><div className="mt-3 flex items-center justify-between gap-2"><code dir="ltr" className="rounded-lg border border-dashed border-violet-300 bg-white px-3 py-2 font-black tracking-widest text-violet-800">{coupon.code}</code><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(coupon.code).then(() => toast.success("تم نسخ رمز الكوبون")).catch(() => toast.error("تعذر النسخ؛ يمكنك تحديد الرمز ونسخه يدويًا")); }}>نسخ</Button><Button type="button" size="sm" onClick={() => { setCouponCode(coupon.code); setCouponResult(null); setCartOpen(true); toast.success("أُضيف الرمز إلى العربة؛ أضف مشترياتك ثم اضغط تطبيق الكوبون"); }} className="bg-violet-700 hover:bg-violet-800">استخدمه</Button></div></div></article>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-violet-200 bg-white p-5 text-center text-sm text-slate-500">{couponLoadError ? "تعذر تحميل الكوبونات حالياً. حاول تحديث الصفحة بعد قليل." : "لا توجد كوبونات فعالة حالياً."}</div>}
      </section>

      <section id="catalog-best-prices" dir="rtl" className="bg-emerald-50/60 px-4 py-8"><div className="mx-auto max-w-7xl"><div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-black text-emerald-950"><Percent className="h-6 w-6 text-emerald-600" />أفضل الأسعار</h2><p className="mt-1 text-sm text-slate-600">منتجات عليها خصومات مباشرة — الأعلى توفيراً أولاً.</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">{bestDealProducts.length} عرض</span></div>{bestDealProducts.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{bestDealProducts.map(product => <CatalogProductCard key={`best-${product.id}`} product={product} fulfillmentMode={fulfillmentMode} pricingConfig={pricingConfig} favoriteIds={favoriteIds} onToggleFavorite={id => setFavoriteIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onAddToCart={addToCart} />)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-emerald-200 bg-white p-5 text-center text-sm text-slate-500">ستظهر هنا المنتجات فور تسجيل سعر قديم وخصم مباشر في الكتالوج.</div>}</div></section>

      <section id="catalog-company-deals" dir="rtl" className="mx-auto max-w-7xl px-4 py-8"><div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><Building2 className="h-6 w-6 text-cyan-600" />عروض الشركات</h2><p className="mt-1 text-sm text-slate-500">العروض المرتبة حسب الشركة والعلامة التجارية.</p></div><span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-800">{companyDealGroups.length} شركة</span></div>{companyDealGroups.length ? <div className="mt-5 space-y-6">{companyDealGroups.map(group => <div key={group.name} className="rounded-3xl border border-cyan-100 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h3 className="font-black text-cyan-950">{group.name}</h3><span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-800">حتى {group.maxDiscount}% خصم</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{group.items.map(product => <CatalogProductCard key={`company-${group.name}-${product.id}`} product={product} fulfillmentMode={fulfillmentMode} pricingConfig={pricingConfig} favoriteIds={favoriteIds} onToggleFavorite={id => setFavoriteIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onAddToCart={addToCart} />)}</div></div>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-cyan-200 bg-white p-5 text-center text-sm text-slate-500">ستظهر عروض الشركات هنا عند وجود منتجات عليها خصم مباشر.</div>}</section>

      <section id="catalog-new-arrivals" className="scroll-mt-6 mx-auto max-w-7xl px-4 py-8"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-900">أحدث المنتجات</h2><p className="mt-1 text-sm text-slate-500">اختيارات جديدة من كتالوج أبو رغوة.</p></div><Package className="h-7 w-7 text-orange-500" /></div>{homeProducts.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{homeProducts.slice(0, 8).map(product => <CatalogProductCard key={product.id} product={product} fulfillmentMode={fulfillmentMode} pricingConfig={pricingConfig} favoriteIds={favoriteIds} onToggleFavorite={id => setFavoriteIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onAddToCart={addToCart} />)}</div> : <div className="mt-5 rounded-3xl border border-dashed border-orange-200 bg-white p-8 text-center text-sm text-slate-500">لا توجد منتجات متاحة حالياً.</div>}</section>

      <footer className="border-t border-orange-100 bg-white px-4 py-8 text-center"><p className="font-black text-slate-900">أبو رغوة — أصل الرغوة في مصر</p><p className="mt-1 text-sm text-orange-700">هنسيب علامة في بيتك</p><p className="mt-3 text-xs text-slate-500">للتواصل: <a className="font-black text-slate-700" href={`tel:${CATALOG_PHONE}`}>{CATALOG_PHONE}</a> · إدارة أبو رغوة</p></footer>

      {cart.length > 0 && <button type="button" onClick={() => setCartOpen(true)} className="fixed bottom-[4.8rem] left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-2xl ring-4 ring-white/80"><span className="flex items-center gap-2 text-sm font-black"><ShoppingBag className="h-5 w-5 text-orange-400" />{cartCount} صنف في السلة</span><span className="flex items-center gap-2 text-sm font-black"><span>{total} ج.م</span><span className="rounded-xl bg-orange-500 px-3 py-2">عرض السلة</span></span></button>}
      {cartOpen && <div className="fixed inset-0 z-50 bg-slate-950/45" onClick={() => setCartOpen(false)}><aside onClick={event => event.stopPropagation()} className="absolute left-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl sm:left-auto sm:right-0" dir="rtl"><div className="flex items-center justify-between border-b pb-4"><div><p className="text-xs font-bold text-orange-600">طلب {fulfillmentLabel} إلى إدارة أبو رغوة</p><h2 className="text-xl font-black text-slate-900">عربة التسوق</h2></div><Button variant="ghost" size="icon" onClick={() => setCartOpen(false)}><X /></Button></div>{cart.length === 0 ? <div className="py-16 text-center"><ShoppingBag className="mx-auto h-12 w-12 text-slate-300" /><p className="mt-3 font-black text-slate-700">العربة فارغة</p><p className="mt-1 text-sm text-slate-500">اختر المنتجات التي تريد الاستفسار عنها أو طلبها.</p></div> : <div className="space-y-5 pt-5"><div className="rounded-2xl bg-blue-50 p-3 text-xs font-bold text-blue-900"><Truck className="ml-1 inline h-4 w-4" />{fulfillmentDescription}</div><div className="space-y-3">{cart.map(item => <div key={item.productId} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-900">{item.name}</p><p className="text-xs text-orange-700">{item.price} ج.م / {item.unit}</p></div><Button size="icon" variant="ghost" onClick={() => updateQuantity(item.productId, 0)} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button></div><div className="mt-3 flex items-center justify-between"><div className="flex items-center rounded-lg border bg-white"><button onClick={() => updateQuantity(item.productId, item.quantity - 1)} className="p-1.5 text-slate-600"><Minus className="h-4 w-4" /></button><span className="min-w-8 text-center text-sm font-black">{item.quantity}</span><button onClick={() => updateQuantity(item.productId, item.quantity + 1)} className="p-1.5 text-orange-600"><Plus className="h-4 w-4" /></button></div><p className="font-black text-slate-900">{item.price * item.quantity} ج.م</p></div></div>)}</div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between gap-3"><span className="font-bold text-amber-950">نقاط هذا الطلب</span><span className="text-lg font-black text-amber-700">{cartLoyaltyPoints} نقطة</span></div><p className="mt-1 text-xs leading-5 text-amber-800">تُضاف بعد تأكيد التسليم، وليست عند إرسال الطلب.</p></div><div className="rounded-2xl border border-violet-100 bg-violet-50 p-3">{activeCoupons.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{activeCoupons.map(coupon => <button type="button" key={coupon.id} onClick={() => { setCouponCode(coupon.code); setCouponResult(null); }} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-violet-700 ring-1 ring-violet-200">{coupon.code} · {coupon.title}</button>)}</div>}<div className="flex gap-2"><Input value={couponCode} onChange={event => { setCouponCode(event.target.value.toUpperCase()); setCouponResult(null); }} placeholder="رمز كوبون الخصم" dir="ltr" /><Button type="button" variant="outline" onClick={() => void applyCoupon()}>تطبيق</Button></div>{couponResult?.valid && <p className="mt-2 text-xs font-bold text-green-700">تم الخصم: {couponResult.discount_amount} ج.م</p>}</div><div className="flex items-center justify-between rounded-2xl bg-orange-50 p-4"><span className="font-bold text-orange-900">إجمالي {fulfillmentMode === "delivery" ? "التوصيل" : "الاستلام"}</span><span className="text-xl font-black text-orange-700">{discountedTotal} ج.م</span></div><div className="space-y-3 border-t pt-5"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-orange-600" /><p className="text-sm font-black">بيانات التواصل</p></div><Input value={customer.name} onChange={event => setCustomer({ ...customer, name: event.target.value })} placeholder="الاسم الكريم *" /><Input value={customer.phone} onChange={event => setCustomer({ ...customer, phone: event.target.value })} placeholder="رقم الهاتف *" type="tel" dir="rtl" /><Input value={customer.customerCode} onChange={event => setCustomer({ ...customer, customerCode: event.target.value })} placeholder="كود الولاء (اختياري للعميل العائد)" dir="ltr" /><Input value={customer.address} onChange={event => setCustomer({ ...customer, address: event.target.value })} placeholder={fulfillmentMode === "delivery" ? "العنوان أو المنطقة *" : "العنوان أو المنطقة (اختياري)"} /><Textarea value={customer.note} onChange={event => setCustomer({ ...customer, note: event.target.value })} placeholder="العنوان بالتفصيل (اختياري - في حال التوصيل)" /><Button disabled={createOrder.isPending} onClick={submitOrder} className="w-full bg-orange-600 py-6 text-base font-black hover:bg-orange-700">{createOrder.isPending ? "جارٍ إرسال الطلب..." : `إرسال طلب ${fulfillmentLabel}`}<Check className="mr-2 h-5 w-5" /></Button><p className="text-center text-[11px] leading-5 text-slate-500">بإرسال الطلب، سيتواصل معك إدارة أبو رغوة لتأكيد توفر المنتجات والسعر وطريقة الاستلام.</p></div></div>}</aside></div>}
      {loyaltyOpen && <div className="fixed inset-0 z-50 bg-slate-950/45" onClick={() => setLoyaltyOpen(false)}><aside onClick={event => event.stopPropagation()} className="absolute left-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl sm:left-auto sm:right-0" dir="rtl"><div className="flex items-center justify-between border-b pb-4"><div><p className="text-xs font-bold text-amber-600">مكافآتك من أبو رغوة</p><h2 className="text-xl font-black">نقاطي</h2></div><Button variant="ghost" size="icon" onClick={() => setLoyaltyOpen(false)}><X /></Button></div><div className="space-y-4 pt-5"><label className="text-xs font-black text-slate-600">كود الولاء أو رقم الهاتف</label><div className="grid gap-2 sm:grid-cols-2"><Input value={loyaltyCode} onChange={event => setLoyaltyCode(event.target.value)} placeholder="كود الولاء AR-..." className="text-left" dir="ltr" /><Input value={loyaltyPhone} onChange={event => setLoyaltyPhone(event.target.value)} type="tel" placeholder="رقم الهاتف (اختياري)" /></div>{loyaltyProfileQuery.isLoading ? <p className="py-8 text-center text-sm text-slate-500">جارٍ تحميل رصيدك...</p> : !loyaltyLookupEnabled ? <p className="rounded-2xl bg-amber-50 p-4 text-center text-sm leading-6 text-amber-900">اكتب كود الولاء لعرض نقاطك، ورقم الهاتف اختياري.</p> : !loyaltyProfile ? <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm leading-6 text-slate-600">لا يوجد رصيد مسجل بهذا الكود أو الرقم حتى الآن. سجّل في عرض أو أرسل طلبًا من الكتالوج ليبدأ حسابك.</p> : <><div className="rounded-3xl bg-gradient-to-l from-amber-500 to-orange-500 p-5 text-white shadow-lg"><p className="text-sm font-bold text-amber-50">أهلًا {loyaltyProfile.name}</p><p className="mt-1 text-4xl font-black">{loyaltyProfile.points} <span className="text-base">نقطة</span></p><p className="mt-2 text-xs text-amber-50">هذا رصيدك الموحد من العروض والكتالوج والكاشير والبيع العادي.</p><p className="mt-2 text-xs text-amber-100">كودك: <strong dir="ltr">{loyaltyProfile.customerCode}</strong></p></div>{(() => { const confirmedRewards = (Array.isArray(rewardLevels) ? rewardLevels : []).filter(level => level.confirmed).sort((a, b) => a.points - b.points); const matched = [...confirmedRewards].reverse().find(level => loyaltyProfile.points >= level.points); const next = confirmedRewards.find(level => loyaltyProfile.points < level.points); return <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4"><p className="font-black text-purple-950">{matched ? `الهدية المستحقة: ${matched.giftName}` : "اجمع نقاطًا أكثر لتحصل على أول هدية"}</p>{next && <p className="mt-1 text-xs leading-5 text-purple-800">متبقي {next.points - loyaltyProfile.points} نقطة للوصول إلى: {next.giftName}</p>}</div>; })()}<div className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><h3 className="font-black text-amber-950">الهدايا المتاحة بالنقاط</h3><p className="mt-1 text-xs leading-5 text-amber-800">كلما وصل رصيدك إلى المستوى المحدد، تصبح الهدية مستحقة ويمكنك طلب استبدالها من إدارة أبو رغوة.</p><div className="mt-3 space-y-2">{(Array.isArray(rewardLevels) ? rewardLevels : []).filter(level => level.confirmed).sort((a, b) => a.points - b.points).map(level => <div key={`${level.points}-${level.giftName}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2"><span className="text-sm font-bold text-slate-800">{level.giftName}</span><span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-800">{level.points} نقطة</span></div>)}</div></div><div><h3 className="font-black text-slate-900">سجل النقاط</h3>{!loyaltyProfile.transactions?.length ? <p className="mt-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">لا توجد حركات مسجلة بعد.</p> : <div className="mt-2 space-y-2">{loyaltyProfile.transactions.slice(0, 50).map(transaction => <div key={transaction.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3"><div><p className="text-sm font-bold text-slate-800">{transaction.description}</p><p className="mt-1 text-[11px] text-slate-500">{transaction.source === "catalog" ? "شراء من الكتالوج" : transaction.source === "offer" ? "كوبون عرض" : transaction.source === "reward" ? "استبدال هدية" : "تعديل إداري"} · {new Date(transaction.createdAt).toLocaleString("ar-EG")}</p></div><strong className={transaction.points >= 0 ? "text-green-600" : "text-red-600"}>{transaction.points > 0 ? "+" : ""}{transaction.points}</strong></div>)}</div>}</div></>}</div></aside></div>}
      {ordersOpen && <div className="fixed inset-0 z-50 bg-slate-950/45" onClick={() => setOrdersOpen(false)}><aside onClick={event => event.stopPropagation()} className="absolute left-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl sm:left-auto sm:right-0"><div className="flex items-center justify-between border-b pb-4"><div><p className="text-xs font-bold text-blue-600">متابعة من نفس الهاتف</p><h2 className="text-xl font-black">طلباتي</h2></div><Button variant="ghost" size="icon" onClick={() => setOrdersOpen(false)}><X /></Button></div>{savedOrders.length === 0 ? <div className="py-16 text-center"><ClipboardList className="mx-auto h-12 w-12 text-blue-200" /><p className="mt-3 font-black">لا توجد طلبات محفوظة على هذا الهاتف</p><p className="mt-1 text-sm text-slate-500">بعد إرسال أول طلب سيظهر هنا تلقائيًا.</p></div> : <div className="space-y-4 pt-5"><div><label className="text-xs font-black text-slate-600">رقم الهاتف الذي استخدمته في الطلب</label><Input value={trackingPhone} onChange={event => setTrackingPhone(event.target.value)} className="mt-2" type="tel" placeholder="رقم الهاتف" /></div>{customerOrdersQuery.isLoading ? <p className="py-8 text-center text-sm text-slate-500">جارٍ تحديث حالة الطلبات...</p> : customerOrders.length === 0 ? <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">اكتب رقم الهاتف المسجل في الطلب لعرض المتابعة.</div> : customerOrders.map(order => { const status = CUSTOMER_STATUS[order.status as keyof typeof CUSTOMER_STATUS] || CUSTOMER_STATUS.new; let items: Array<{ name: string; quantity: number }> = []; try { items = JSON.parse(order.itemsJson); } catch {} return <article key={order.id} className="rounded-3xl border border-blue-100 bg-blue-50/40 p-4"><div className="flex items-start justify-between gap-3"><div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${status.className}`}>{status.label}</span><p className="mt-2 text-sm font-black text-slate-900">طلب #{order.id.slice(-6).toUpperCase()}</p>            <p className="mt-1 text-xs leading-5 text-slate-500">{status.detail}</p>{order.customerCode && <p className="mt-1 text-xs font-black text-purple-700">كود نقاطك: <span dir="ltr">{order.customerCode}</span></p>}</div><Truck className="h-7 w-7 text-blue-600" /></div><div className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-600">{items.map(item => <p key={item.name}>• {item.name} × {item.quantity}</p>)}</div><p className="mt-3 text-xs font-bold text-blue-700">إجمالي تقديري: {order.totalAmount} ج.م</p>{order.status === "delivered" && Number(order.loyaltyPointsAwarded || 0) > 0 && <p className="mt-1 text-xs font-black text-amber-700">أُضيف إلى رصيدك: {order.loyaltyPointsAwarded} نقطة ولاء</p>}</article>; })}</div>}</aside></div>}
      <nav aria-label="تنقل العميل" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-6 py-2 shadow-[0_-8px_30px_rgba(15,23,42,.12)] backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around"><button type="button" onClick={() => { setActiveNav("home"); setShowFavorites(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`flex flex-col items-center gap-1 text-[11px] font-black ${activeNav === "home" ? "text-orange-600" : "text-slate-400"}`}><Home className="h-5 w-5" />الرئيسية</button><button type="button" onClick={() => { setActiveNav("favorites"); setShowFavorites(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`flex flex-col items-center gap-1 text-[11px] font-black ${activeNav === "favorites" ? "text-orange-600" : "text-slate-400"}`}><Heart className="h-5 w-5" />المفضلة</button><button type="button" onClick={() => { setActiveNav("orders"); openMyOrders(); }} className={`relative flex flex-col items-center gap-1 text-[11px] font-black ${activeNav === "orders" ? "text-orange-600" : "text-slate-400"}`}><ClipboardList className="h-5 w-5" />طلباتي{savedOrders.length > 0 && <span className="absolute -left-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-orange-500 px-1 text-[9px] text-white">{savedOrders.length}</span>}</button></div>
      </nav>
    </main>
  );
}
