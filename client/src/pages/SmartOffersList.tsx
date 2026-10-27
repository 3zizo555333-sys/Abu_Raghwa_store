import { browserState } from "@/lib/browserState";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import QRCode from "qrcode";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, Eye, History, Pencil, QrCode, RefreshCw, Share2, Sparkles, Trash2, X, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatOfferTimeRemaining, getOfferExpiryInfo } from "@/lib/offerExpiry";
import { deleteStoreOffer, listStoreOffers, type CloudStoreOffer } from "@/lib/supabase/storeOffers";

interface SmartOffer {
  id: string;
  title: string;
  strategyName: string;
  promoText?: string;
  bannerImageUrl?: string;
  bgColor?: string;
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
  const [selectedQr, setSelectedQr] = useState("");
  const posterRef = useRef<HTMLDivElement>(null);
  const deleteOfferMutation = trpc.offers.delete.useMutation();
  const trpcUtils = trpc.useUtils();

  const fromCloudOffer = (row: CloudStoreOffer): SmartOffer => {
    const data = row.offer_data && typeof row.offer_data === "object" && !Array.isArray(row.offer_data) ? row.offer_data as Record<string, unknown> : {};
    const items = Array.isArray(data.items) ? data.items : [];
    return {
      ...(data as unknown as SmartOffer),
      id: row.id,
      title: row.title,
      strategyName: String(data.strategyName || row.strategy || "عرض محفوظ"),
      promoText: String(data.promoText || row.promo_text || row.banner_title || ""),
      bannerImageUrl: String(data.bannerImageUrl || row.image_url || row.banner_custom_image || "") || undefined,
      bgColor: String(data.bgColor || row.bg_color || "#ea580c"),
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
          <CardHeader className="pb-3" style={{ backgroundColor: offer.bgColor || undefined }}>
            {offer.bannerImageUrl && <img src={offer.bannerImageUrl} alt="صورة بانر العرض" className="mb-3 h-28 w-full rounded-xl bg-white object-contain p-1" />}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate text-base text-slate-900">{offer.title}</CardTitle>
              <CardDescription className="mt-1 truncate">{offer.strategyName}</CardDescription>
              {offer.promoText && <p className="mt-1 text-xs font-black text-white/90">{offer.promoText}</p>}
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${isActive ? "bg-emerald-600 text-white" : "bg-slate-600 text-white"}`}>
              {isActive ? "متاح الآن" : "منتهي"}
            </span>
          </div>
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
            <Button type="button" variant="outline" onClick={() => void openOfferCard(offer)} className="border-blue-200 text-blue-700 hover:bg-blue-50">
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
        {selectedOffer && selectedQr && <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" onClick={() => setSelectedOffer(null)}><div className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl" dir="rtl" onClick={event => event.stopPropagation()}><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black">بطاقة العرض الترويجي</h2><Button type="button" variant="ghost" size="icon" onClick={() => setSelectedOffer(null)} aria-label="إغلاق"><X className="h-5 w-5" /></Button></div><div ref={posterRef} className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-600 to-violet-700 p-5 text-white"><p className="text-sm font-bold text-cyan-100">أبو رغوة للمنظفات</p><h3 className="mt-2 text-3xl font-black">{selectedOffer.title}</h3><p className="mt-2 leading-7 text-blue-50">{selectedOffer.description || "عرض حصري لفترة محدودة"}</p><div className="mt-4 rounded-2xl bg-white p-4 text-center"><img src={selectedQr} alt={`QR للعرض ${selectedOffer.title}`} className="mx-auto h-56 w-56" /><p className="mt-2 text-xs font-bold text-slate-700">امسح الكود لفتح العرض وطلبه</p></div><div className="mt-4 flex items-end justify-between"><div><p className="text-xs text-blue-100">سعر العرض</p><p className="text-3xl font-black">{selectedOffer.offerPrice} ج.م</p></div><div className="rounded-xl bg-white/15 px-3 py-2 text-left text-xs">العرض #{selectedOffer.id.slice(0, 8)}</div></div></div><div className="mt-4 grid grid-cols-2 gap-2"><Button type="button" onClick={downloadQr} className="bg-violet-700 hover:bg-violet-800"><QrCode className="ml-1 h-4 w-4" />تحميل الباركود مباشر</Button><Button type="button" variant="outline" onClick={() => void exportPoster()}><Share2 className="ml-1 h-4 w-4" />تصدير/حفظ الكارت</Button></div></div></div>}
      </main>
    </div>
  );
}
