import { browserState } from "@/lib/browserState";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import QRCode from "qrcode";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, Eye, History, Pencil, QrCode, RefreshCw, Share2, Sparkles, Trash2, X, XCircle, LoaderCircle } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatOfferTimeRemaining, getOfferExpiryInfo } from "@/lib/offerExpiry";
import { deleteStoreOffer, getPublishedOfferImage, listStoreOffers, type CloudStoreOffer } from "@/lib/supabase/storeOffers";
import { generateCatalogOfferBanner, uploadCatalogOfferImage } from "@/lib/supabase/offerImages";
import { OfferProductStager, OfferProductStagerBoundary } from "@/components/OfferProductStager";

interface SmartOffer {
  id: string;
  title: string;
  strategyName: string;
  promoText?: string;
  bannerImageUrl?: string;
  bannerCustomImage?: string;
  bgColor?: string;
  bgGradient?: string;
  backgroundMode?: "solid" | "gradient";
  items: Array<{ name: string; costPrice: number; retailPrice: number; offerPrice: number; type: "product" | "recipe" }>;
  originalTotalRetail: number;
  totalCostPrice: number;
  offerPrice: number;
  discountAmount: number;
  discountPercent: number;
  description: string;
  startDate: string;
  endDate: string;
  startAt?: number;
  endAt?: number;
  cloudStatus?: "draft" | "active" | "paused" | "expired";
  qrCodeData?: string;
}

type OffersTab = "active" | "expired";

export default function SmartOffersList() {
  const [, navigate] = useLocation();
  const [savedOffers, setSavedOffers] = useState<SmartOffer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OffersTab>("active");
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedOffer, setSelectedOffer] = useState<SmartOffer | null>(null);
  const [stagingOffer, setStagingOffer] = useState<SmartOffer | null>(null);
  const [selectedQr, setSelectedQr] = useState("");
  const posterRef = useRef<HTMLDivElement>(null);
  const [uploadingOfferId, setUploadingOfferId] = useState<string | null>(null);
  const [generatingOfferId, setGeneratingOfferId] = useState<string | null>(null);
  const offerImageBusy = uploadingOfferId !== null || generatingOfferId !== null;
  const deleteOfferMutation = trpc.offers.delete.useMutation();
  const trpcUtils = trpc.useUtils();

  const fromCloudOffer = (row: CloudStoreOffer): SmartOffer => {
    const data = row.offer_data && typeof row.offer_data === "object" && !Array.isArray(row.offer_data) ? row.offer_data as Record<string, unknown> : {};
    const items = Array.isArray(data.items) ? data.items : [];
    const storedImageUrl = String(row.image_url || data.bannerImageUrl || "");
    const isLegacyAiScene = storedImageUrl.includes("/ai-banner-");
    const legacyProduct = items.find((item: { imageUrl?: string; image_url?: string }) => item.imageUrl || item.image_url);
    const itemProductUrl = String(legacyProduct?.imageUrl || legacyProduct?.image_url || "");
    const productImageUrl = getPublishedOfferImage(row) || (isLegacyAiScene ? itemProductUrl : storedImageUrl || itemProductUrl);
    return {
      ...(data as unknown as SmartOffer),
      id: row.id,
      title: row.title,
      strategyName: String(data.strategyName || row.strategy || "عرض محفوظ"),
      promoText: String(data.promoText || row.promo_text || row.banner_title || ""),
      bannerImageUrl: productImageUrl || undefined,
      bannerCustomImage: String(row.banner_custom_image || data.bannerCustomImage || (isLegacyAiScene ? storedImageUrl : "")) || undefined,
      bgColor: String(data.bgColor || row.bg_color || "#ea580c"),
      bgGradient: String(data.bgGradient || data.bg_gradient || row.bg_gradient || "") || undefined,
      backgroundMode: data.backgroundMode === "solid" ? "solid" : "gradient",
      items: items as SmartOffer["items"],
      description: String(data.description || row.public_description || row.description || ""),
      startDate: String(data.startDate || row.start_date || ""),
      endDate: String(data.endDate || row.ends_at || row.expires_at || ""),
      startAt: row.starts_at ? Date.parse(row.starts_at) : Number(data.startAt || 0) || undefined,
      endAt: row.ends_at ? Date.parse(row.ends_at) : Number(data.endAt || 0) || undefined,
      cloudStatus: row.status,
      qrCodeData: row.qr_code_data || `${window.location.origin}/public-offer?id=${encodeURIComponent(row.id)}`,
    };
  };

  const loadOffers = useCallback(async (manual = false) => {
    manual ? setIsRefreshing(true) : setIsLoading(true);
    setLoadError(null);
    try {
      const rows = await listStoreOffers();
      setSavedOffers(rows.map(fromCloudOffer));
      if (manual) toast.success("تم تحديث العروض من السحابة بنجاح");
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر جلب العروض من السحابة.";
      setLoadError(message);
      toast.error(`تعذر تحميل العروض: ${message}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOffers();
    const timer = window.setInterval(() => void loadOffers(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadOffers]);

  const openOfferCard = async (offer: SmartOffer) => {
    const target = offer.qrCodeData || `${window.location.origin}/public-offer?id=${encodeURIComponent(offer.id)}`;
    try {
      setSelectedQr(await QRCode.toDataURL(target, { width: 720, margin: 4, errorCorrectionLevel: "H" }));
      setSelectedOffer(offer);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء QR العرض");
    }
  };

  const handleOfferImage = async (offer: SmartOffer, file?: File) => {
    if (!file) return;
    setUploadingOfferId(offer.id);
    try {
      const { publicUrl } = await uploadCatalogOfferImage(offer.id, file);
      const update = (item: SmartOffer) => item.id === offer.id ? { ...item, bannerImageUrl: publicUrl } : item;
      setSavedOffers(previous => previous.map(update));
      setSelectedOffer(previous => previous?.id === offer.id ? { ...previous, bannerImageUrl: publicUrl } : previous);
      toast.success("تم رفع صورة العرض وحفظها بنجاح.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع صورة العرض. أعد المحاولة.");
    } finally {
      setUploadingOfferId(null);
      const cameraInput = document.getElementById(`offer-camera-${offer.id}`) as HTMLInputElement | null;
      const galleryInput = document.getElementById(`offer-gallery-${offer.id}`) as HTMLInputElement | null;
      if (cameraInput) cameraInput.value = "";
      if (galleryInput) galleryInput.value = "";
    }
  };

  const handleStagedProductImage = async (offer: SmartOffer, file: File) => {
    setUploadingOfferId(offer.id);
    try {
      const { publicUrl } = await uploadCatalogOfferImage(offer.id, file);
      const update = (item: SmartOffer) => item.id === offer.id ? { ...item, bannerImageUrl: publicUrl } : item;
      setSavedOffers(previous => previous.map(update));
      setSelectedOffer(previous => previous?.id === offer.id ? { ...previous, bannerImageUrl: publicUrl } : previous);
      toast.success("تم حفظ صورة المنتجات الشفافة وربطها بالعرض بنجاح.");
    } finally {
      setUploadingOfferId(null);
    }
  };

  const handleGenerateOfferBanner = async (offer: SmartOffer) => {
    setGeneratingOfferId(offer.id);
    try {
      const { publicUrl } = await generateCatalogOfferBanner(offer.id);
      const update = (item: SmartOffer) => item.id === offer.id ? { ...item, bannerCustomImage: publicUrl } : item;
      setSavedOffers(previous => previous.map(update));
      setSelectedOffer(previous => previous?.id === offer.id ? { ...previous, bannerCustomImage: publicUrl } : previous);
      toast.success("تم توليد خلفية البانر وحفظها للعرض.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر توليد البانر. أعد المحاولة.");
    } finally {
      setGeneratingOfferId(null);
    }
  };

  const downloadQr = () => {
    if (!selectedQr || !selectedOffer) return;
    const link = document.createElement("a");
    link.href = selectedQr;
    link.download = `abu-raghwa-offer-qr-${selectedOffer.id}.png`;
    link.click();
  };

  const exportPoster = async () => {
    if (!posterRef.current || !selectedOffer) return;
    try {
      const canvas = await html2canvas(posterRef.current, { scale: 3, backgroundColor: "#ffffff", useCORS: true });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `abu-raghwa-offer-card-${selectedOffer.id}.png`;
      link.click();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تصدير بطاقة العرض");
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const { activeOffers, expiredOffers } = useMemo(() => {
    const activeOffers: SmartOffer[] = [];
    const expiredOffers: SmartOffer[] = [];
    savedOffers.forEach((offer) => {
      if (offer.cloudStatus === "active" && getOfferExpiryInfo(offer, now).status === "active") activeOffers.push(offer);
      else expiredOffers.push(offer);
    });
    return { activeOffers, expiredOffers };
  }, [now, savedOffers]);

  const visibleOffers = activeTab === "active" ? activeOffers : expiredOffers;

  const handleDeleteOffer = async (offer: SmartOffer) => {
    const confirmed = window.confirm(`هل تريد حذف عرض «${offer.title}» نهائيًا؟\nسيتم إيقاف رابط الكوبون والـ QR الخاص به.`);
    if (!confirmed) return;

    try {
      await deleteStoreOffer(offer.id);
      try { await deleteOfferMutation.mutateAsync({ id: offer.id }); } catch { toast.warning("تم حذف العرض السحابي، لكن تعذر حذف النسخة القديمة."); }
      setSavedOffers(previous => previous.filter((item) => item.id !== offer.id));
      await trpcUtils.offers.list.invalidate();

      try {
        const globalOffers = JSON.parse(browserState.get("abu_raghwa_global_offers") || "{}");
        delete globalOffers[offer.id];
        browserState.set("abu_raghwa_global_offers", JSON.stringify(globalOffers));
      } catch {
        browserState.remove("abu_raghwa_global_offers");
      }

      if (expandedOfferId === offer.id) setExpandedOfferId(null);
      toast.success("تم حذف العرض وإيقاف رابط الكوبون الخاص به.");
    } catch {
      toast.error("تعذر حذف العرض من الخادم. أعد المحاولة بعد التأكد من تسجيل الدخول.");
    }
  };

  const renderOfferCard = (offer: SmartOffer) => {
    const expiry = getOfferExpiryInfo(offer, now);
    const isActive = offer.cloudStatus === "active" && expiry.status === "active";
    const isExpanded = expandedOfferId === offer.id;

    return (
      <Card key={offer.id} className={`overflow-hidden border-2 ${isActive ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50"}`}>
        <CardHeader className="space-y-3 pb-3">
          <div className="relative h-40 overflow-hidden rounded-2xl p-3 text-white shadow-sm" style={{ backgroundColor: offer.bgColor || "#ea580c", backgroundImage: offer.bannerCustomImage ? `linear-gradient(90deg,rgba(15,23,42,.44),rgba(15,23,42,.16)),url("${offer.bannerCustomImage}")` : offer.backgroundMode === "solid" ? undefined : offer.bgGradient || undefined, backgroundSize: offer.bannerCustomImage ? "cover" : undefined, backgroundPosition: "center" }}>
            <span className={`absolute right-3 top-3 z-20 rounded-full px-3 py-1 text-xs font-black shadow ${isActive ? "bg-emerald-700 text-white" : "bg-slate-800 text-white"}`}>{isActive ? "متاح الآن" : "منتهي"}</span>
            {offer.bannerImageUrl && <div className="absolute bottom-0 left-0 z-20 flex h-full w-[38%] items-end justify-center p-1"><img src={offer.bannerImageUrl} alt={`صورة المنتج في ${offer.title}`} className="h-full w-full object-contain" style={{ filter: "drop-shadow(0 12px 16px rgba(0,0,0,0.45))" }} /></div>}
            <div className="relative z-30 mr-auto w-[58%] space-y-1 pt-8 text-right [text-shadow:0_1px_3px_rgba(0,0,0,.8)]">
              <h3 className="line-clamp-2 text-lg font-black leading-tight">{offer.title}</h3>
              <p className="line-clamp-1 text-xs font-bold text-white">{offer.strategyName}</p>
              {offer.promoText && <p className="line-clamp-2 text-xs font-black text-white">{offer.promoText}</p>}
              <div className="flex flex-wrap items-center gap-1 pt-1 text-[10px] font-black">{offer.discountPercent > 0 && <span className="rounded-full border border-white/25 bg-amber-300 px-2 py-0.5 text-amber-950">وفر {offer.discountPercent}%</span>}<span className="rounded-full border border-white/25 bg-white/90 px-2 py-0.5 text-slate-900">{offer.offerPrice} ج.م</span></div>
            </div>
            <svg className="pointer-events-none absolute bottom-0 left-[19%] z-30 h-5 w-[38%] -translate-x-1/2" viewBox="0 0 144 24" fill="none" aria-hidden="true"><path d="M0 23c9-10 17-9 24-2 3-12 14-15 22-5 7-15 18-17 26-5 6-9 16-9 21 0 9-12 19-9 23 0 8-7 19-3 28 12H0Z" fill="white" fillOpacity=".82"/></svg>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input id={`offer-camera-${offer.id}`} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" aria-label="التقاط صورة العرض بالكاميرا" onChange={event => void handleOfferImage(offer, event.currentTarget.files?.[0])} />
            <input id={`offer-gallery-${offer.id}`} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="اختيار صورة العرض من المعرض" onChange={event => void handleOfferImage(offer, event.currentTarget.files?.[0])} />
            <Button type="button" variant="outline" disabled={offerImageBusy} onClick={() => document.getElementById(`offer-camera-${offer.id}`)?.click()} className="min-h-11 w-full whitespace-normal border-orange-200 px-1 text-[11px] leading-tight text-orange-800 hover:bg-orange-50">📷 التقاط بالكاميرا</Button>
            <Button type="button" variant="outline" disabled={offerImageBusy} onClick={() => document.getElementById(`offer-gallery-${offer.id}`)?.click()} className="min-h-11 w-full whitespace-normal border-orange-200 px-1 text-[11px] leading-tight text-orange-800 hover:bg-orange-50">📷 إضافة / تغيير صورة العرض</Button>
            <Button type="button" variant="outline" disabled={offerImageBusy} onClick={() => void handleGenerateOfferBanner(offer)} className="min-h-11 w-full whitespace-normal border-violet-300 bg-violet-50 px-1 text-[10px] font-black leading-tight text-violet-900 hover:bg-violet-100">{generatingOfferId === offer.id ? <LoaderCircle className="ml-1 h-4 w-4 animate-spin" /> : null}🪄 توليد بانر 3D بالذكاء الاصطناعي</Button>
            <Button type="button" variant="outline" disabled={offerImageBusy} onClick={() => setStagingOffer(offer)} className="min-h-11 w-full whitespace-normal border-fuchsia-300 bg-fuchsia-50 px-1 text-[10px] font-black leading-tight text-fuchsia-900 hover:bg-fuchsia-100"><Sparkles className="ml-1 h-4 w-4 shrink-0" />✨ استوديو تفريغ وتركيب حتى 4 صور</Button>
          </div>
          {generatingOfferId === offer.id && <p className="flex items-center justify-center gap-2 text-center text-xs font-bold text-violet-700"><LoaderCircle className="h-4 w-4 animate-spin" /> جاري توليد البانر سحابياً...</p>}{uploadingOfferId === offer.id && <p className="text-center text-xs font-bold text-slate-600">جارٍ رفع الصورة...</p>}
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-black/5 bg-white/85 p-3 text-xs">
            <div>
              <p className="text-slate-500">تاريخ الانتهاء</p>
              <p className="mt-1 font-bold text-slate-900">{offer.endDate}</p>
            </div>
            <div>
              <p className="text-slate-500">حالة المدة</p>
              <p className={`mt-1 font-black ${isActive ? "text-emerald-700" : "text-slate-600"}`}>{formatOfferTimeRemaining(expiry)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-sm">
            <span className="text-slate-600">سعر العرض</span>
            <span className="font-black text-orange-700">{offer.offerPrice} ج.م</span>
          </div>

          {isExpanded && (
            <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-sm">
              <p className="font-bold leading-6 text-slate-800">{offer.description || "لا يوجد وصف إضافي لهذا العرض."}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <p className="rounded-lg bg-white p-2 text-slate-700">السعر قبل العرض: <strong>{offer.originalTotalRetail} ج.م</strong></p>
                <p className="rounded-lg bg-white p-2 text-slate-700">التوفير: <strong>{offer.discountAmount} ج.م ({offer.discountPercent}%)</strong></p>
              </div>
              <div className="rounded-lg bg-white p-3">
                <p className="mb-2 text-xs font-black text-slate-700">الأصناف داخل العرض</p>
                <ul className="space-y-1 text-xs text-slate-700">
                  {offer.items.map((item, index) => <li key={`${offer.id}-${index}`}>• {item.name} — سعر العرض {item.offerPrice} ج.م</li>)}
                </ul>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Button type="button" variant="outline" onClick={() => setExpandedOfferId(isExpanded ? null : offer.id)} className="border-blue-200 text-blue-700 hover:bg-blue-50">
              <Eye className="ml-1 h-4 w-4" /> {isExpanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
            </Button>
            <Button type="button" size="icon" variant="outline" aria-label="فتح QR العرض" onClick={() => void openOfferCard(offer)} className="border-violet-200 text-violet-700 hover:bg-violet-50"><QrCode className="h-4 w-4" /></Button>
            <Button type="button" variant="outline" onClick={() => navigate(`/smart-offers?edit=${encodeURIComponent(offer.id)}`)} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
              <Pencil className="ml-1 h-4 w-4" /> تعديل يدوي
            </Button>
            <Button type="button" variant="outline" disabled={deleteOfferMutation.isPending} onClick={() => handleDeleteOffer(offer)} className="border-red-200 text-red-700 hover:bg-red-50">
              <Trash2 className="ml-1 h-4 w-4" /> حذف العرض
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 pb-16" dir="rtl">
      {stagingOffer && <OfferProductStagerBoundary key={stagingOffer.id} onClose={() => setStagingOffer(null)}>
        <OfferProductStager open offer={stagingOffer} onOpenChange={open => { if (!open) setStagingOffer(null); }} onSave={file => handleStagedProductImage(stagingOffer, file)} />
      </OfferProductStagerBoundary>}
      <main className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><History className="h-6 w-6 text-orange-600" /> قائمة العروض الذكية</h1>
            <p className="mt-1 text-sm text-slate-600">راجع العروض المتاحة والمنتهية، وافتح التفاصيل أو احذف ما لم تعد تحتاجه.</p>
          </div>
              <Button type="button" variant="outline" onClick={() => void loadOffers(true)} disabled={isRefreshing} className="border-slate-300 bg-white">
                <RefreshCw className={`ml-1 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} /> تحديث يدوي
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate("/smart-offers")} className="border-slate-300 bg-white">
            <ArrowLeft className="ml-1 h-4 w-4" /> العودة للعروض الذكية
          </Button>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setActiveTab("active")} className={`rounded-2xl border-2 p-4 text-right transition ${activeTab === "active" ? "border-emerald-500 bg-emerald-600 text-white shadow-md" : "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"}`}>
            <span className="flex items-center gap-2 text-sm font-black"><CheckCircle2 className="h-5 w-5" /> العروض المتاحة</span>
            <strong className="mt-2 block text-3xl">{activeOffers.length}</strong>
          </button>
          <button type="button" onClick={() => setActiveTab("expired")} className={`rounded-2xl border-2 p-4 text-right transition ${activeTab === "expired" ? "border-slate-600 bg-slate-700 text-white shadow-md" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
            <span className="flex items-center gap-2 text-sm font-black"><XCircle className="h-5 w-5" /> العروض المنتهية</span>
            <strong className="mt-2 block text-3xl">{expiredOffers.length}</strong>
          </button>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3 border-b pb-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><CalendarClock className="h-5 w-5 text-orange-600" /> {activeTab === "active" ? "العروض المتاحة الآن" : "العروض التي انتهت"}</h2>
              <p className="mt-1 text-xs text-slate-500">{activeTab === "active" ? "تابع مدة العرض المتبقية وافتح تفاصيله." : "احذف العرض المنتهي لتبقى القائمة مرتبة."}</p>
            </div>
            <Clock3 className="h-5 w-5 text-slate-400" />
          </div>

          {isLoading ? (
            <div className="py-14 text-center text-slate-500">جارٍ جلب العروض من السحابة...</div>
          ) : loadError ? (
            <div className="py-14 text-center"><p className="font-bold text-red-700">تعذر تحميل العروض من السحابة.</p><p className="mt-2 text-sm text-red-600">{loadError}</p><Button type="button" className="mt-4" onClick={() => void loadOffers(true)}>إعادة المحاولة</Button></div>
          ) : visibleOffers.length === 0 ? (
            <div className="py-14 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-orange-300" />
              <p className="mt-3 font-bold text-slate-700">{activeTab === "active" ? "لا توجد عروض متاحة حاليًا." : "لا توجد عروض منتهية حاليًا."}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{visibleOffers.map(renderOfferCard)}</div>
          )}
        </section>
        {selectedOffer && selectedQr && <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" onClick={() => setSelectedOffer(null)}><div className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl" dir="rtl" onClick={event => event.stopPropagation()}><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black">بطاقة العرض الترويجي</h2><Button type="button" variant="ghost" size="icon" onClick={() => setSelectedOffer(null)} aria-label="إغلاق"><X className="h-5 w-5" /></Button></div><div ref={posterRef} className="overflow-hidden rounded-3xl p-5 text-white" style={{ backgroundColor: selectedOffer.bgColor || "#ea580c", backgroundImage: selectedOffer.backgroundMode === "solid" ? undefined : selectedOffer.bgGradient || undefined }}><p className="text-sm font-bold text-white">أبو رغوة للمنظفات</p>{selectedOffer.bannerImageUrl && <img src={selectedOffer.bannerImageUrl} alt="صورة العرض" crossOrigin="anonymous" className="mt-3 h-32 w-full rounded-xl bg-white object-contain p-1" />}{selectedOffer.promoText && <p className="mt-3 rounded-xl bg-black/25 px-3 py-2 text-center font-black text-white">{selectedOffer.promoText}</p>}<h3 className="mt-2 text-3xl font-black">{selectedOffer.title}</h3><p className="mt-2 leading-7 text-white">{selectedOffer.description || "عرض حصري لفترة محدودة"}</p><div className="mt-4 rounded-2xl bg-white p-4 text-center"><img src={selectedQr} alt={`QR للعرض ${selectedOffer.title}`} className="mx-auto h-56 w-56" /><p className="mt-2 text-xs font-bold text-slate-700">امسح الكود لفتح العرض وطلبه</p></div><div className="mt-4 flex items-end justify-between"><div><p className="text-xs text-white">سعر العرض</p><p className="text-3xl font-black">{selectedOffer.offerPrice} ج.م</p></div><div className="rounded-xl bg-white/15 px-3 py-2 text-left text-xs">العرض #{selectedOffer.id.slice(0, 8)}</div></div></div><div className="mt-4 grid grid-cols-2 gap-2"><Button type="button" onClick={downloadQr} className="bg-violet-700 hover:bg-violet-800"><QrCode className="ml-1 h-4 w-4" />تحميل الباركود مباشر</Button><Button type="button" variant="outline" onClick={() => void exportPoster()}><Share2 className="ml-1 h-4 w-4" />تصدير/حفظ الكارت</Button></div></div></div>}
      </main>
    </div>
  );
}
