import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Camera, CheckCircle2, Copy, ExternalLink, Eye, FolderPlus, History, ImagePlus, Package, Phone, Plus, Printer, QrCode, Search, Share2, ShoppingBag, Trash2, TrendingUp, Truck, UserRound } from "lucide-react";
import QRCode from "qrcode";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { type CatalogCategory, type CatalogCompany, type CatalogProduct, type CatalogRecipe, CATALOG_PHONE, getCatalogDiscountPercent, getCatalogPrice, getSafeCatalogDetailsUrl, recipeToCatalogProduct } from "@/lib/catalog";
import { useCloudState } from "@/lib/cloudSync";
import { trpc } from "@/lib/trpc";
import { buildCatalogFulfillmentUrl, normalizeDeliveryMarkupPercent, type CatalogPricingConfig } from "@/lib/catalogPricing";

type CatalogOrder = {
  id: string;
  customerName: string;
  customerPhone: string;
  address: string | null;
  note: string | null;
  itemsJson: string;
  totalAmount: number;
  loyaltyPointsAwarded?: number;
  fulfillmentMethod?: "pickup" | "delivery";
  priceAdjustmentPercent?: number;
  status: "new" | "contacted" | "confirmed" | "preparing" | "delivered" | "cancelled";
  createdAt: Date | string;
};

const STATUS_LABELS = {
  new: { label: "طلب جديد", className: "bg-amber-100 text-amber-800 border-amber-200" },
  contacted: { label: "تم التواصل", className: "bg-blue-100 text-blue-800 border-blue-200" },
  confirmed: { label: "مؤكد", className: "bg-green-100 text-green-800 border-green-200" },
  preparing: { label: "جارٍ توفير المنتجات", className: "bg-violet-100 text-violet-800 border-violet-200" },
  delivered: { label: "تم التسليم", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelled: { label: "ملغي", className: "bg-slate-100 text-slate-700 border-slate-200" },
};

export default function CatalogManager() {
  const [, navigate] = useLocation();
  const [products, setProducts] = useCloudState<CatalogProduct[]>("abu_raghwa_products", []);
  const [categories, setCategories] = useCloudState<CatalogCategory[]>("abu_catalog_categories", []);
  const [companies, setCompanies] = useCloudState<CatalogCompany[]>("abu_catalog_companies", []);
  const [recipes, setRecipes] = useCloudState<CatalogRecipe[]>("abu_raghwa_recipes", []);
  const [manualProducts, setManualProducts] = useCloudState<CatalogProduct[]>("abu_catalog_manual_products", []);
  const [pricingConfig, setPricingConfig] = useCloudState<CatalogPricingConfig>("abu_catalog_pricing", { deliveryMarkupPercent: 0 });
  const [newCategory, setNewCategory] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedProductDetailsUrl, setSelectedProductDetailsUrl] = useState("");
  const [manualDraft, setManualDraft] = useState({ name: "", price: "", unit: "قطعة", category: "", company: "", description: "", detailsUrl: "", loyaltyPoints: "" });
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [pickupQrCodeDataUrl, setPickupQrCodeDataUrl] = useState("");
  const [deliveryQrCodeDataUrl, setDeliveryQrCodeDataUrl] = useState("");
  const [catalogSessionReady, setCatalogSessionReady] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => { try { return localStorage.getItem("abu_catalog_order_sound") === "on"; } catch { return false; } });
  const knownOrderIds = useRef<Set<string> | null>(null);
  const hasCatalogAccess = Boolean(sessionStorage.getItem("abu_staff_sync_token"));
  const catalogUrl = typeof window === "undefined" ? "" : `${window.location.origin}/catalog`;
  const pickupCatalogUrl = buildCatalogFulfillmentUrl(typeof window === "undefined" ? "" : window.location.origin, "pickup");
  const deliveryCatalogUrl = buildCatalogFulfillmentUrl(typeof window === "undefined" ? "" : window.location.origin, "delivery");
  const deliveryMarkup = normalizeDeliveryMarkupPercent(pricingConfig.deliveryMarkupPercent);
  const catalogLogin = trpc.catalog.loginWithStaffSession.useMutation({ onSuccess: result => { try { sessionStorage.setItem("abu_catalog_admin_token", result.token); } catch {} setCatalogSessionReady(true); }, onError: () => toast.error("حسابك غير مخول لمتابعة طلبات الكتالوج") });
  const { data: orders = [], isLoading: ordersLoading, error: ordersError, refetch: refetchOrders } = trpc.catalog.listOrders.useQuery(undefined, { enabled: catalogSessionReady, refetchInterval: catalogSessionReady ? 10_000 : false, retry: false });
  const updateOrderStatus = trpc.catalog.updateOrderStatus.useMutation({ onSuccess: () => refetchOrders() });
  const uploadProductImage = trpc.catalog.uploadProductImage.useMutation();
  const [uploadingProductId, setUploadingProductId] = useState<string | null>(null);

  const enableOrderSound = () => {
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
      oscillator.addEventListener("ended", () => void context.close());
      localStorage.setItem("abu_catalog_order_sound", "on");
      setSoundEnabled(true);
      if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
      toast.success("تم تفعيل رنة طلبات الكتالوج على هذا الهاتف");
    } catch {
      toast.error("لم يسمح الهاتف بتفعيل الصوت؛ اضغط الزر مرة أخرى");
    }
  };

  useEffect(() => {
    const currentOrders = (orders as CatalogOrder[]);
    if (!currentOrders.length) return;
    const currentIds = new Set(currentOrders.map(order => order.id));
    if (!knownOrderIds.current) {
      knownOrderIds.current = currentIds;
      return;
    }
    const newOrders = currentOrders.filter(order => !knownOrderIds.current?.has(order.id) && order.status === "new");
    knownOrderIds.current = currentIds;
    if (!newOrders.length) return;
    toast.success(`طلب جديد من ${newOrders[0].customerName}`);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("طلب جديد من كتالوج أبو رغوة", { body: `طلب جديد من ${newOrders[0].customerName} بقيمة ${newOrders[0].totalAmount} ج.م` });
    }
    if (!soundEnabled) return;
    try {
      const context = new AudioContext();
      [0, 0.22, 0.44].forEach(delay => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 880;
        gain.gain.value = 0.1;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(context.currentTime + delay);
        oscillator.stop(context.currentTime + delay + 0.13);
      });
      window.setTimeout(() => void context.close(), 900);
    } catch { /* the visual toast remains available if audio is blocked */ }
  }, [orders, soundEnabled]);

  useEffect(() => {
    if (!catalogUrl) return;
    QRCode.toDataURL(catalogUrl, { width: 420, margin: 4, errorCorrectionLevel: "M" }).then(setQrCodeDataUrl).catch(() => toast.error("تعذر إنشاء QR الكتالوج"));
  }, [catalogUrl]);

  useEffect(() => {
    if (!pickupCatalogUrl || !deliveryCatalogUrl) return;
    Promise.all([
      QRCode.toDataURL(pickupCatalogUrl, { width: 420, margin: 4, errorCorrectionLevel: "M" }),
      QRCode.toDataURL(deliveryCatalogUrl, { width: 420, margin: 4, errorCorrectionLevel: "M" }),
    ]).then(([pickupQr, deliveryQr]) => {
      setPickupQrCodeDataUrl(pickupQr);
      setDeliveryQrCodeDataUrl(deliveryQr);
    }).catch(() => toast.error("تعذر إنشاء رموز QR للاستلام والتوصيل"));
  }, [pickupCatalogUrl, deliveryCatalogUrl]);

  useEffect(() => {
    if (!hasCatalogAccess) return;
    catalogLogin.mutate();
  }, [hasCatalogAccess]);

  useEffect(() => {
    if (!ordersError) return;
    setCatalogSessionReady(false);
    if (hasCatalogAccess && !catalogLogin.isPending) catalogLogin.mutate();
  }, [ordersError, hasCatalogAccess]);

  const safeProducts = useMemo(() => Array.isArray(products) ? products.filter(Boolean) : [], [products]);
  const safeManualProducts = useMemo(() => Array.isArray(manualProducts) ? manualProducts.filter(Boolean) : [], [manualProducts]);
  const safeRecipes = useMemo(() => Array.isArray(recipes) ? recipes.filter(Boolean) : [], [recipes]);
  const safeCategories = useMemo(() => Array.isArray(categories) ? categories.filter(Boolean) : [], [categories]);
  const safeCompanies = useMemo(() => Array.isArray(companies) ? companies.filter(Boolean) : [], [companies]);
  const managedProducts = useMemo(() => [...safeProducts, ...safeManualProducts], [safeProducts, safeManualProducts]);
  const catalogRecipes = useMemo(() => safeRecipes.map(recipeToCatalogProduct), [safeRecipes]);
  const filteredProducts = useMemo(() => managedProducts.filter(product => `${product.name ?? ""} ${product.category ?? ""} ${product.company ?? ""}`.toLowerCase().includes(search.toLowerCase())), [managedProducts, search]);
  const filteredRecipes = useMemo(() => catalogRecipes.filter(recipe => `${recipe.name ?? ""} ${recipe.category ?? ""} ${recipe.company ?? ""}`.toLowerCase().includes(search.toLowerCase())), [catalogRecipes, search]);
  const visibleProducts = [...managedProducts, ...catalogRecipes].filter(product => product.catalogVisible === true).length;
  const newOrders = (orders as CatalogOrder[]).filter(order => order.status === "new").length;

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    if (safeCategories.some(category => category.name === name)) return toast.error("هذه الفئة موجودة بالفعل");
    setCategories([...safeCategories, { id: `cat_${Date.now()}`, name }]);
    setNewCategory("");
    toast.success("تمت إضافة الفئة للكتالوج");
  };

  const addCompany = () => {
    const name = newCompany.trim();
    if (!name) return;
    if (safeCompanies.some(company => company.name === name)) return toast.error("هذه الشركة موجودة بالفعل");
    setCompanies([...safeCompanies, { id: `company_${Date.now()}`, name }]);
    setNewCompany("");
    toast.success("تمت إضافة الشركة للكتالوج");
  };

  const updateProduct = (id: string, patch: Partial<CatalogProduct>) => {
    if (safeManualProducts.some(product => product.id === id)) {
      setManualProducts(current => (Array.isArray(current) ? current : []).map(product => product.id === id ? { ...product, ...patch } : product));
      return;
    }
    setProducts(current => (Array.isArray(current) ? current : []).map(product => product.id === id ? { ...product, ...patch } : product));
  };

  const updateRecipe = (id: string, patch: Partial<CatalogRecipe>) => setRecipes(current => (Array.isArray(current) ? current : []).map(recipe => recipe.id === id ? { ...recipe, ...patch } : recipe));

  const addRegisteredProduct = () => {
    const product = safeProducts.find(item => item.id === selectedProductId);
    if (!product) return toast.error("اختر منتجاً مسجلاً من القائمة أولاً");
    const catalogDetailsUrl = getSafeCatalogDetailsUrl(selectedProductDetailsUrl);
    if (selectedProductDetailsUrl.trim() && !catalogDetailsUrl) return toast.error("اكتب رابط فيديو أو منشور يبدأ بـ https:// أو http://");
    updateProduct(product.id, { catalogVisible: true, ...(catalogDetailsUrl ? { catalogDetailsUrl } : {}) });
    setSelectedProductId("");
    setSelectedProductDetailsUrl("");
    toast.success(`تمت إضافة ${product.name} إلى الكتالوج`);
  };

  const addManualProduct = () => {
    const name = manualDraft.name.trim();
    const price = Number(manualDraft.price);
    if (!name || !Number.isFinite(price) || price <= 0) return toast.error("اكتب اسم المنتج اليدوي وسعره الصحيح");
    const catalogDetailsUrl = getSafeCatalogDetailsUrl(manualDraft.detailsUrl);
    if (manualDraft.detailsUrl.trim() && !catalogDetailsUrl) return toast.error("اكتب رابط فيديو أو منشور يبدأ بـ https:// أو http://");
    const normalizedName = name.toLocaleLowerCase("ar-EG");
    const existingNames = [...safeProducts, ...safeManualProducts, ...safeRecipes].map(item => String(item.name ?? "").trim().toLocaleLowerCase("ar-EG"));
    if (existingNames.includes(normalizedName)) return toast.error("هذا الاسم موجود بالفعل كمنتج أو تركيبة في الكتالوج");
    setManualProducts(current => [...(Array.isArray(current) ? current : []), { id: `manual_catalog_${Date.now()}`, catalogSource: "manual", name, unit: manualDraft.unit.trim() || "قطعة", wholesaleRetailPrice: price, catalogPrice: price, category: manualDraft.category.trim(), company: manualDraft.company.trim(), catalogDescription: manualDraft.description.trim(), catalogDetailsUrl, catalogVisible: true, loyaltyPoints: Math.max(0, Math.floor(Number(manualDraft.loyaltyPoints) || 0)) }]);
    setManualDraft({ name: "", price: "", unit: "قطعة", category: "", company: "", description: "", detailsUrl: "", loyaltyPoints: "" });
    toast.success("تمت إضافة المنتج اليدوي إلى الكتالوج");
  };

  const deleteManualProduct = (id: string) => {
    setManualProducts(current => (Array.isArray(current) ? current : []).filter(product => product.id !== id));
    toast.success("تم حذف المنتج اليدوي من الكتالوج فقط");
  };

  const handleProductImage = async (file: File | undefined, productId: string) => {
    if (!file) return;
    if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type)) return toast.error("اختر صورة بصيغة JPG أو PNG أو WEBP");
    if (file.size > 6 * 1024 * 1024) return toast.error("حجم الصورة يجب ألا يزيد عن 6 ميجابايت");
    setUploadingProductId(productId);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("invalid image"));
        reader.onerror = () => reject(reader.error || new Error("image read failed"));
        reader.readAsDataURL(file);
      });
      const result = await uploadProductImage.mutateAsync({ productId, fileName: file.name || "product-image", mimeType: file.type as "image/jpeg" | "image/png" | "image/webp", base64: dataUrl });
      updateProduct(productId, { catalogImageUrl: result.url });
      toast.success("تم رفع صورة المنتج وحفظها سحابياً");
    } catch {
      toast.error("تعذر رفع الصورة، حاول مرة أخرى");
    } finally {
      setUploadingProductId(null);
    }
  };

  const handleRecipeImage = async (file: File | undefined, recipeId: string) => {
    if (!file) return;
    if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type)) return toast.error("اختر صورة بصيغة JPG أو PNG أو WEBP");
    if (file.size > 6 * 1024 * 1024) return toast.error("حجم الصورة يجب ألا يزيد عن 6 ميجابايت");
    const uploadId = `recipe_${recipeId}`;
    setUploadingProductId(uploadId);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("invalid image"));
        reader.onerror = () => reject(reader.error || new Error("image read failed"));
        reader.readAsDataURL(file);
      });
      const result = await uploadProductImage.mutateAsync({ productId: uploadId, fileName: file.name || "recipe-image", mimeType: file.type as "image/jpeg" | "image/png" | "image/webp", base64: dataUrl });
      updateRecipe(recipeId, { catalogImageUrl: result.url });
      toast.success("تم رفع صورة التركيبة وحفظها سحابياً");
    } catch {
      toast.error("تعذر رفع صورة التركيبة، حاول مرة أخرى");
    } finally {
      setUploadingProductId(null);
    }
  };

  const updateStatus = async (id: string, status: CatalogOrder["status"]) => {
    try {
      await updateOrderStatus.mutateAsync({ id, status });
      toast.success("تم تحديث حالة طلب العميل");
    } catch {
      toast.error("تعذر تحديث الطلب، حاول مرة أخرى");
    }
  };

  const copyCatalogLink = async () => {
    try { await navigator.clipboard.writeText(catalogUrl); toast.success("تم نسخ رابط كتالوج المحل"); } catch { toast.error("تعذر نسخ الرابط تلقائياً"); }
  };

  const downloadQr = () => {
    if (!qrCodeDataUrl) return;
    const link = document.createElement("a");
    link.href = qrCodeDataUrl;
    link.download = "abu-raghwa-store-catalog-qr.png";
    link.click();
  };

  const downloadFulfillmentQr = (dataUrl: string, fileName: string) => {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    link.click();
  };

  const shareCatalog = async () => {
    const message = `تسوق من كتالوج أبو رغوة — أصل الرغوة في مصر\n${catalogUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "كتالوج أبو رغوة", text: message, url: catalogUrl });
      } else {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank");
      }
    } catch {
      // إغلاق نافذة المشاركة من المستخدم لا يحتاج إلى رسالة خطأ.
    }
  };

  const shareOnFacebook = () => {
    const message = "تسوق من كتالوج أبو رغوة — أصل الرغوة في مصر. اختَر منتجاتك وأرسل طلبك بسهولة.";
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(catalogUrl)}&quote=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const printQr = () => {
    if (!qrCodeDataUrl) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return toast.error("اسمح للمتصفح بفتح نافذة الطباعة ثم حاول مرة أخرى");
    printWindow.document.write(`<html dir="rtl"><head><title>QR كتالوج أبو رغوة</title><style>body{font-family:Tahoma;text-align:center;padding:32px;color:#111827}img{width:300px;height:300px;padding:14px;border:3px solid #f97316;border-radius:20px}h1{color:#c2410c}p{font-size:16px}</style></head><body><h1>كتالوج أبو رغوة</h1><p>أصل الرغوة في مصر — هنسيب علامة في بيتك</p><img src="${qrCodeDataUrl}" alt="QR كتالوج أبو رغوة"/><p>${catalogUrl}</p><p>للتواصل: ${CATALOG_PHONE}</p><script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  };

  const printFulfillmentQr = (dataUrl: string, title: string, url: string, description: string) => {
    if (!dataUrl) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return toast.error("اسمح للمتصفح بفتح نافذة الطباعة ثم حاول مرة أخرى");
    printWindow.document.write(`<html dir="rtl"><head><title>${title}</title><style>body{font-family:Tahoma;text-align:center;padding:32px;color:#111827}img{width:300px;height:300px;padding:14px;border:3px solid #0f766e;border-radius:20px}h1{color:#0f766e}p{font-size:16px;max-width:520px;margin:12px auto;word-break:break-word}</style></head><body><h1>${title}</h1><p>${description}</p><img src="${dataUrl}" alt="${title}"/><p>${url}</p><p>أبو رغوة — أصل الرغوة في مصر</p><script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  };

  const copyFulfillmentLink = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`تم نسخ رابط ${label}`);
    } catch {
      toast.error("تعذر نسخ الرابط، انسخه يدويًا من الخانة");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 pb-20" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-3xl bg-gradient-to-l from-orange-600 via-orange-500 to-amber-400 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-orange-100">واجهة البيع العامة بدون دخول إلى الإدارة</p>
              <h1 className="mt-1 text-3xl font-black">كتالوج أبو رغوة وطلبات العملاء</h1>
              <p className="mt-2 max-w-2xl text-sm text-orange-50">رتّب منتجاتك حسب الفئات والشركات، وانشر QR واحدًا يفتح للزبون الكتالوج وعربة الطلب فقط.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => window.open("/catalog", "_blank")} className="bg-white text-orange-700 hover:bg-orange-50"><ExternalLink className="ml-2 h-4 w-4" />معاينة الكتالوج</Button>
              <Button onClick={() => navigate("/advanced-reports")} className="bg-slate-950 text-white hover:bg-slate-800"><TrendingUp className="ml-2 h-4 w-4" />جرد المبيعات والأرباح</Button>
              <Button variant="outline" onClick={() => navigate("/dashboard")} className="border-white/60 bg-white/10 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="ml-2 h-4 w-4" />الرئيسية</Button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 shadow-sm"><CardContent className="flex items-center gap-3 p-5"><span className="rounded-2xl bg-orange-100 p-3 text-orange-700"><Package /></span><div><p className="text-xs text-slate-500">منتجات ظاهرة للزبون</p><p className="text-2xl font-black text-slate-900">{visibleProducts}</p></div></CardContent></Card>
          <Card className="border-0 shadow-sm"><CardContent className="flex items-center gap-3 p-5"><span className="rounded-2xl bg-amber-100 p-3 text-amber-700"><ShoppingBag /></span><div><p className="text-xs text-slate-500">طلبات جديدة تحتاج متابعة</p><p className="text-2xl font-black text-slate-900">{newOrders}</p></div></CardContent></Card>
          <Card className="border-0 shadow-sm"><CardContent className="flex items-center gap-3 p-5"><span className="rounded-2xl bg-blue-100 p-3 text-blue-700"><Phone /></span><div><p className="text-xs text-slate-500">رقم الكتالوج للتواصل</p><p className="text-lg font-black text-slate-900" dir="ltr">{CATALOG_PHONE}</p></div></CardContent></Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><FolderPlus className="text-orange-600" />الفئات والشركات</CardTitle><CardDescription>أضف المسميات التي تناسب محلك مثل مسحوق، ورقيات، مستحضرات تجميل، ثم اربط المنتجات بها.</CardDescription></CardHeader><CardContent className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3"><div className="flex gap-2"><Input value={newCategory} onChange={event => setNewCategory(event.target.value)} placeholder="اسم فئة جديدة" onKeyDown={event => event.key === "Enter" && addCategory()} /><Button onClick={addCategory} className="bg-orange-600 hover:bg-orange-700"><Plus /></Button></div><div className="flex flex-wrap gap-2">{safeCategories.length ? safeCategories.map(category => <span key={category.id} className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-800">{category.name}<button className="mr-2 text-orange-500" onClick={() => setCategories(safeCategories.filter(item => item.id !== category.id))}>×</button></span>) : <p className="text-xs text-slate-500">لم تضف فئات بعد.</p>}</div></div>
            <div className="space-y-3"><div className="flex gap-2"><Input value={newCompany} onChange={event => setNewCompany(event.target.value)} placeholder="اسم شركة جديدة" onKeyDown={event => event.key === "Enter" && addCompany()} /><Button onClick={addCompany} className="bg-blue-600 hover:bg-blue-700"><Plus /></Button></div><div className="flex flex-wrap gap-2">{safeCompanies.length ? safeCompanies.map(company => <span key={company.id} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{company.name}<button className="mr-2 text-blue-500" onClick={() => setCompanies(safeCompanies.filter(item => item.id !== company.id))}>×</button></span>) : <p className="text-xs text-slate-500">لم تضف شركات بعد.</p>}</div></div>
          </CardContent></Card>

          <Card className="border-0 bg-slate-950 text-white shadow-sm"><CardContent className="flex flex-col items-center gap-3 p-6 text-center"><span className="rounded-2xl bg-white/10 p-3"><QrCode className="h-7 w-7 text-amber-300" /></span><h2 className="text-xl font-black">QR ورابط كتالوج المحل</h2><p className="text-xs text-slate-300">استخدم QR للطباعة، أو انشر الرابط الظاهر أدناه في فيسبوك؛ الزبون يضغطه من هاتفه ويدخل الكتالوج فورًا.</p>{qrCodeDataUrl && <img src={qrCodeDataUrl} alt="باركود كتالوج أبو رغوة" className="h-44 w-44 rounded-2xl bg-white p-2" />}<div className="w-full rounded-xl border border-white/15 bg-white/10 p-2 text-right"><p className="mb-1 text-[11px] font-bold text-amber-200">رابط الكتالوج للنشر:</p><Input value={catalogUrl} readOnly dir="ltr" onFocus={event => event.currentTarget.select()} className="h-9 border-white/20 bg-white text-left text-xs text-slate-900" /></div><div className="flex flex-wrap justify-center gap-2"><Button size="sm" onClick={copyCatalogLink} className="bg-white text-slate-950 hover:bg-slate-100"><Copy className="ml-1 h-3.5 w-3.5" />نسخ الرابط</Button><Button size="sm" onClick={shareOnFacebook} className="bg-[#1877F2] text-white hover:bg-[#166FE5]"><span className="ml-1 grid h-4 w-4 place-items-center rounded-sm bg-white text-[10px] font-black text-[#1877F2]">f</span>نشر على Facebook</Button><Button size="sm" onClick={shareCatalog} className="bg-orange-500 text-white hover:bg-orange-600"><Share2 className="ml-1 h-3.5 w-3.5" />مشاركة</Button><Button size="sm" onClick={printQr} variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Printer className="ml-1 h-3.5 w-3.5" />طباعة</Button><Button size="sm" onClick={downloadQr} variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white">تحميل QR</Button></div></CardContent></Card>
        </section>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="text-emerald-600" />سعر ورابط الاستلام والتوصيل</CardTitle><CardDescription>الاستلام من المحل يستخدم سعر الكتالوج المعتاد. رابط التوصيل يزيد سعر كل صنف بالنسبة التي تكتبها هنا، دون تغيير سعر المحل.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="rounded-2xl bg-emerald-50 p-4"><label className="text-sm font-black text-emerald-950">زيادة سعر التوصيل لكل صنف (%)</label><Input type="number" min="0" max="500" step="0.5" value={deliveryMarkup || ""} onChange={event => setPricingConfig({ deliveryMarkupPercent: normalizeDeliveryMarkupPercent(event.target.value) })} placeholder="مثال: 10" className="mt-3 bg-white" /><p className="mt-2 text-xs leading-5 text-emerald-800">مثال: إذا كان سعر المحل 100 ج.م والنسبة 10%، يظهر في رابط التوصيل بسعر 110 ج.م.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                <p className="font-black text-blue-950">رابط وQR الاستلام من المحل</p>
                <p className="mt-1 text-xs text-blue-700">انشره للعميل القريب الذي سيأتي ويستلم بنفسه.</p>
                {pickupQrCodeDataUrl && <img src={pickupQrCodeDataUrl} alt="QR الاستلام من محل أبو رغوة" className="mx-auto mt-3 h-36 w-36 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-blue-100" />}
                <Input value={pickupCatalogUrl} readOnly dir="ltr" onFocus={event => event.currentTarget.select()} className="mt-3 h-9 bg-white text-left text-xs" />
                <div className="mt-3 grid grid-cols-3 gap-2"><Button size="sm" onClick={() => copyFulfillmentLink(pickupCatalogUrl, "الاستلام من المحل")} className="bg-blue-600 hover:bg-blue-700"><Copy className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" onClick={() => downloadFulfillmentQr(pickupQrCodeDataUrl, "abu-raghwa-pickup-qr.png")}><QrCode className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" onClick={() => printFulfillmentQr(pickupQrCodeDataUrl, "QR الاستلام من محل أبو رغوة", pickupCatalogUrl, "امسح الكود لتشاهد أسعار الاستلام من المحل وتطلب بسهولة.")}><Printer className="h-3.5 w-3.5" /></Button></div>
                <p className="mt-2 text-center text-[10px] font-bold text-blue-700">نسخ الرابط · تحميل QR · طباعة QR</p>
              </div>
              <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
                <p className="font-black text-orange-950">رابط وQR التوصيل</p>
                <p className="mt-1 text-xs text-orange-700">انشره للعميل البعيد؛ يظهر السعر بعد إضافة {deliveryMarkup}% لكل صنف.</p>
                {deliveryQrCodeDataUrl && <img src={deliveryQrCodeDataUrl} alt="QR توصيل أبو رغوة" className="mx-auto mt-3 h-36 w-36 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-orange-100" />}
                <Input value={deliveryCatalogUrl} readOnly dir="ltr" onFocus={event => event.currentTarget.select()} className="mt-3 h-9 bg-white text-left text-xs" />
                <div className="mt-3 grid grid-cols-3 gap-2"><Button size="sm" onClick={() => copyFulfillmentLink(deliveryCatalogUrl, "التوصيل")} className="bg-orange-600 hover:bg-orange-700"><Copy className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" onClick={() => downloadFulfillmentQr(deliveryQrCodeDataUrl, "abu-raghwa-delivery-qr.png")}><QrCode className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" onClick={() => printFulfillmentQr(deliveryQrCodeDataUrl, "QR توصيل أبو رغوة", deliveryCatalogUrl, "امسح الكود لتشاهد أسعار التوصيل وتطلب حتى باب البيت.")}><Printer className="h-3.5 w-3.5" /></Button></div>
                <p className="mt-2 text-center text-[10px] font-bold text-orange-700">نسخ الرابط · تحميل QR · طباعة QR</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-5 lg:grid-cols-2">
          <Card className="border border-orange-100 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2"><Package className="text-orange-600" />إضافة منتج مسجل</CardTitle><CardDescription>اختر من جميع منتجات المخزون المسجلة، ثم أضفه للكتالوج مع رابط فيديو أو منشور تعريف اختياري.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <select value={selectedProductId} onChange={event => setSelectedProductId(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">اختر منتجاً من قائمة المنتجات ({safeProducts.length})</option>{safeProducts.map(product => <option key={product.id} value={product.id}>{product.name} — {getCatalogPrice(product)} ج.م</option>)}</select>
              <Input value={selectedProductDetailsUrl} onChange={event => setSelectedProductDetailsUrl(event.target.value)} placeholder="رابط فيديو أو منشور التعريف (اختياري)" dir="ltr" />
              <Button onClick={addRegisteredProduct} className="h-11 bg-orange-600 hover:bg-orange-700"><Plus className="ml-1 h-4 w-4" />إضافة للكتالوج</Button>
            </CardContent>
          </Card>
          <Card className="border border-blue-100 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="text-blue-600" />إضافة منتج يدوي</CardTitle><CardDescription>أنشئ منتجاً خاصاً بالكتالوج دون إضافته إلى مخزون المنتجات الأصلي.</CardDescription></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <Input value={manualDraft.name} onChange={event => setManualDraft({ ...manualDraft, name: event.target.value })} placeholder="اسم المنتج *" />
              <Input type="number" value={manualDraft.price} onChange={event => setManualDraft({ ...manualDraft, price: event.target.value })} placeholder="سعر البيع *" />
              <Input value={manualDraft.unit} onChange={event => setManualDraft({ ...manualDraft, unit: event.target.value })} placeholder="الوحدة" />
              <select value={manualDraft.category} onChange={event => setManualDraft({ ...manualDraft, category: event.target.value })} className="rounded-xl border bg-white px-3 text-sm"><option value="">اختر الفئة</option>{safeCategories.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}</select>
              <select value={manualDraft.company} onChange={event => setManualDraft({ ...manualDraft, company: event.target.value })} className="rounded-xl border bg-white px-3 text-sm"><option value="">اختر الشركة</option>{safeCompanies.map(company => <option key={company.id} value={company.name}>{company.name}</option>)}</select>
              <Input value={manualDraft.description} onChange={event => setManualDraft({ ...manualDraft, description: event.target.value })} placeholder="وصف اختياري" />
              <Input value={manualDraft.detailsUrl} onChange={event => setManualDraft({ ...manualDraft, detailsUrl: event.target.value })} placeholder="رابط فيديو أو منشور التعريف (اختياري)" dir="ltr" className="sm:col-span-2" /><Input type="number" min="0" step="1" value={manualDraft.loyaltyPoints} onChange={event => setManualDraft({ ...manualDraft, loyaltyPoints: event.target.value })} placeholder="نقاط الولاء لكل وحدة (اختياري)" />
              <Button onClick={addManualProduct} className="sm:col-span-2 bg-blue-600 hover:bg-blue-700"><Plus className="ml-1 h-4 w-4" />حفظ المنتج اليدوي في الكتالوج</Button>
            </CardContent>
          </Card>
        </section>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Package className="text-orange-600" />إدارة منتجات الكتالوج</CardTitle>
            <CardDescription>تظهر هنا المنتجات المسجلة واليدوية. فعّل فقط ما تريد عرضه للزبون، ثم أضف الصورة والفئة والشركة والسعر ونقاط الولاء لكل وحدة.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative max-w-md"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} className="pr-9" placeholder="ابحث باسم المنتج أو الفئة أو الشركة" /></div>
            <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
              {filteredProducts.map(product => {
                const price = getCatalogPrice(product);
                const discount = getCatalogDiscountPercent(product);
                const galleryInputId = `catalog-image-gallery-${product.id}`;
                const cameraInputId = `catalog-image-camera-${product.id}`;
                return (
                  <div key={product.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-orange-100 bg-white">
                          {product.catalogImageUrl ? <img src={product.catalogImageUrl} alt={`صورة ${product.name}`} className="h-full w-full object-cover" /> : <Package className="h-9 w-9 text-orange-300" />}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-slate-900">{product.name}</h3>
                          <p className="mt-1 text-xs text-slate-500">الكود: {product.code || "غير مسجل"} · السعر الحالي: {price} ج.م · نقاط الولاء: <strong className="text-amber-700">{Math.max(0, Math.floor(Number(product.loyaltyPoints) || 0))}</strong> {discount > 0 && <span className="mr-1 font-black text-green-700">خصم {discount}%</span>}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <label htmlFor={galleryInputId} className="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-orange-50"><ImagePlus className="ml-1 h-3.5 w-3.5 text-orange-600" />المعرض<input id={galleryInputId} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => handleProductImage(event.target.files?.[0], product.id)} /></label>
                            <label htmlFor={cameraInputId} className="inline-flex cursor-pointer items-center rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-orange-700"><Camera className="ml-1 h-3.5 w-3.5" />الكاميرا<input id={cameraInputId} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={event => handleProductImage(event.target.files?.[0], product.id)} /></label>
                            {uploadingProductId === product.id && <span className="self-center text-xs font-bold text-orange-700">جارٍ رفع الصورة...</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={product.catalogVisible === true} onChange={event => updateProduct(product.id, { catalogVisible: event.target.checked })} />ظاهر في الكتالوج</label>{product.catalogSource === "manual" && <Button size="sm" variant="outline" onClick={() => deleteManualProduct(product.id)} className="border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="ml-1 h-3.5 w-3.5" />حذف اليدوي</Button>}</div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-7">
                      <select value={product.category || ""} onChange={event => updateProduct(product.id, { category: event.target.value })} className="rounded-xl border bg-white p-2 text-sm"><option value="">اختر الفئة</option>{safeCategories.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}</select>
                      <select value={product.company || ""} onChange={event => updateProduct(product.id, { company: event.target.value })} className="rounded-xl border bg-white p-2 text-sm"><option value="">اختر الشركة</option>{safeCompanies.map(company => <option key={company.id} value={company.name}>{company.name}</option>)}</select>
                      <Input type="number" value={product.catalogPrice ?? ""} onChange={event => updateProduct(product.id, { catalogPrice: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder={`سعر الكتالوج ${price}`} />
                      <Input type="number" value={product.catalogOldPrice ?? ""} onChange={event => updateProduct(product.id, { catalogOldPrice: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="السعر القديم" />
                      <Input value={product.catalogDescription ?? ""} onChange={event => updateProduct(product.id, { catalogDescription: event.target.value })} placeholder="وصف مختصر اختياري" />
                      <Input type="number" min="0" step="1" value={product.loyaltyPoints ?? ""} onChange={event => updateProduct(product.id, { loyaltyPoints: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} placeholder="نقاط الولاء لكل وحدة" />
                      <Input value={product.catalogDetailsUrl ?? ""} onChange={event => updateProduct(product.id, { catalogDetailsUrl: event.target.value })} onBlur={event => updateProduct(product.id, { catalogDetailsUrl: getSafeCatalogDetailsUrl(event.target.value) })} placeholder="رابط فيديو أو منشور التعريف" dir="ltr" />
                    </div>
                  </div>
                );
              })}
              {filteredProducts.length === 0 && <p className="py-8 text-center text-sm text-slate-500">لا توجد منتجات مطابقة. أضف المنتجات أولًا من إدارة المنتجات.</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="text-violet-600" />تركيبات الكتالوج</CardTitle>
            <CardDescription>اختر التركيبات التي تريد عرضها للزبون، وضعها داخل الفئة والشركة المناسبة مثل أي منتج آخر.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredRecipes.map(recipe => {
              const recipeId = recipe.sourceId || recipe.id.replace(/^catalog_recipe_/, "");
              const price = getCatalogPrice(recipe);
              const galleryInputId = `catalog-recipe-gallery-${recipeId}`;
              const cameraInputId = `catalog-recipe-camera-${recipeId}`;
              return <div key={recipe.id} className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4"><div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div className="flex gap-3"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-violet-100 bg-white">{recipe.catalogImageUrl ? <img src={recipe.catalogImageUrl} alt={`صورة ${recipe.name}`} className="h-full w-full object-cover" /> : <Building2 className="h-7 w-7 text-violet-300" />}</div><div><div className="flex items-center gap-2"><span className="rounded-lg bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-700">تركيبة</span><h3 className="font-black text-slate-900">{recipe.name}</h3></div><p className="mt-1 text-xs text-slate-500">سعر البيع: {price} ج.م · {recipe.unit || "وحدة"} · نقاط الولاء: <strong className="text-amber-700">{Math.max(0, Math.floor(Number(recipe.loyaltyPoints) || 0))}</strong></p><div className="mt-2 flex flex-wrap gap-2"><label htmlFor={galleryInputId} className="inline-flex cursor-pointer items-center rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-100"><ImagePlus className="ml-1 h-3.5 w-3.5" />المعرض<input id={galleryInputId} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => handleRecipeImage(event.target.files?.[0], recipeId)} /></label><label htmlFor={cameraInputId} className="inline-flex cursor-pointer items-center rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-violet-700"><Camera className="ml-1 h-3.5 w-3.5" />الكاميرا<input id={cameraInputId} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={event => handleRecipeImage(event.target.files?.[0], recipeId)} /></label>{uploadingProductId === `recipe_${recipeId}` && <span className="self-center text-xs font-bold text-violet-700">جارٍ رفع الصورة...</span>}</div></div></div><label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={recipe.catalogVisible === true} onChange={event => updateRecipe(recipeId, { catalogVisible: event.target.checked })} />ظاهر في الكتالوج</label></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-7"><select value={recipe.category || ""} onChange={event => updateRecipe(recipeId, { category: event.target.value })} className="rounded-xl border bg-white p-2 text-sm"><option value="">اختر الفئة</option>{safeCategories.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}</select><select value={recipe.company || ""} onChange={event => updateRecipe(recipeId, { company: event.target.value })} className="rounded-xl border bg-white p-2 text-sm"><option value="">اختر الشركة</option>{safeCompanies.map(company => <option key={company.id} value={company.name}>{company.name}</option>)}</select><Input type="number" value={recipe.catalogPrice ?? ""} onChange={event => updateRecipe(recipeId, { catalogPrice: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder={`سعر الكتالوج ${price}`} /><Input type="number" value={recipe.catalogOldPrice ?? ""} onChange={event => updateRecipe(recipeId, { catalogOldPrice: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="السعر القديم" /><Input value={recipe.catalogDescription ?? ""} onChange={event => updateRecipe(recipeId, { catalogDescription: event.target.value })} placeholder="وصف مختصر للتركيبة" /><Input type="number" min="0" step="1" value={recipe.loyaltyPoints ?? ""} onChange={event => updateRecipe(recipeId, { loyaltyPoints: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} placeholder="نقاط الولاء لكل وحدة" /><Input value={recipe.catalogDetailsUrl ?? ""} onChange={event => updateRecipe(recipeId, { catalogDetailsUrl: event.target.value })} onBlur={event => updateRecipe(recipeId, { catalogDetailsUrl: getSafeCatalogDetailsUrl(event.target.value) })} placeholder="رابط فيديو أو منشور التعريف" dir="ltr" /></div></div>;
            })}
            {filteredRecipes.length === 0 && <p className="py-6 text-center text-sm text-slate-500">لا توجد تركيبات مطابقة. أضف تركيبة أولاً من صفحة التركيبات.</p>}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><History className="text-orange-600" />طلبات الكتالوج</CardTitle><CardDescription>هذه الطلبات تصل عند ضغط العميل «إرسال الطلب»، ثم تواصل معه لتأكيد التجهيز والتوصيل.</CardDescription></div><Button type="button" size="sm" variant={soundEnabled ? "default" : "outline"} onClick={enableOrderSound}>{soundEnabled ? "🔔 الرنة مفعلة" : "تفعيل رنة الطلبات"}</Button></div></CardHeader><CardContent>{ordersLoading ? <p className="py-8 text-center text-sm text-slate-500">جاري تحميل الطلبات...</p> : (orders as CatalogOrder[]).length === 0 ? <p className="py-8 text-center text-sm text-slate-500">لا توجد طلبات من الكتالوج بعد.</p> : <div className="space-y-3">{(orders as CatalogOrder[]).map(order => { let items: Array<{ name: string; quantity: number; price: number; loyaltyPoints?: number }> = []; try { items = JSON.parse(order.itemsJson); } catch {} const status = STATUS_LABELS[order.status]; const isDelivery = order.fulfillmentMethod === "delivery"; return <article key={order.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{order.customerName}</h3><span className={`rounded-full border px-2.5 py-1 text-xs font-black ${status.className}`}>{status.label}</span><span className={`rounded-full px-2.5 py-1 text-xs font-black ${isDelivery ? "bg-orange-100 text-orange-800" : "bg-blue-100 text-blue-800"}`}>{isDelivery ? `توصيل${order.priceAdjustmentPercent ? ` +${order.priceAdjustmentPercent}%` : ""}` : "استلام من المحل"}</span></div><p className="mt-1 text-sm font-bold text-orange-700" dir="ltr">{order.customerPhone}</p><p className="text-xs text-slate-500">{new Date(order.createdAt).toLocaleString("ar-EG")}{order.address ? ` · ${order.address}` : ""}</p>{order.note && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">ملاحظة العميل: {order.note}</p>}</div><div className="text-left"><p className="text-xs text-slate-500">إجمالي الطلب</p><p className="text-xl font-black text-green-700">{order.totalAmount} ج.م</p></div></div><div className="mt-3 rounded-xl bg-orange-50 p-3 text-xs text-slate-700">{items.map(item => <p key={item.name}>• {item.name} × {item.quantity} — {item.price * item.quantity} ج.م {Number(item.loyaltyPoints || 0) > 0 && <span className="font-black text-amber-700">· {Number(item.loyaltyPoints || 0) * item.quantity} نقطة</span>}</p>)}<p className="mt-2 border-t border-orange-200 pt-2 font-black text-amber-700">نقاط الطلب عند التسليم: {Number(order.loyaltyPointsAwarded || 0)} نقطة</p></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => window.open(`https://wa.me/2${order.customerPhone.replace(/^0/, "")}`, "_blank")} className="bg-green-600 hover:bg-green-700"><Phone className="ml-1 h-3.5 w-3.5" />تواصل واتساب</Button>{(["contacted", "confirmed", "cancelled"] as const).map(next => <Button key={next} size="sm" variant="outline" disabled={order.status === next || updateOrderStatus.isPending} onClick={() => updateStatus(order.id, next)}>{STATUS_LABELS[next].label}</Button>)}</div></article>; })}</div>}</CardContent></Card>
        {(orders as CatalogOrder[]).length > 0 && <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="text-blue-600" />تحديث متابعة العميل</CardTitle><CardDescription>غيّر حالة الطلب هنا، وسيظهر التحديث تلقائيًا للعميل في صفحة «طلباتي».</CardDescription></CardHeader><CardContent className="space-y-3">{(orders as CatalogOrder[]).map(order => <div key={`tracking-${order.id}`} className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-900">{order.customerName} <span className="text-xs font-bold text-blue-700">#{order.id.slice(-6).toUpperCase()}</span></p><p className="text-xs text-slate-500">الحالة الحالية: {STATUS_LABELS[order.status].label}</p></div><select value={order.status} disabled={updateOrderStatus.isPending} onChange={event => updateStatus(order.id, event.target.value as CatalogOrder["status"])} className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-900"><option value="new">طلب جديد</option><option value="contacted">تم التواصل</option><option value="confirmed">مؤكد</option><option value="preparing">جارٍ توفير المنتجات</option><option value="delivered">تم التسليم</option><option value="cancelled">ملغي</option></select></div>)}</CardContent></Card>}
      </div>
    </main>
  );
}
