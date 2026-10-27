import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Star, Download, MessageCircle, Share2, ShoppingCart, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { trpc } from "@/lib/trpc";
import { formatOfferTimeRemaining, getOfferExpiryInfo } from "@/lib/offerExpiry";
import { buildLoyaltyPageHref } from "@/lib/loyaltyLookup";
import { LoyaltyRewardProgressCard } from "@/components/LoyaltyRewardProgress";
import { shouldDisableOfferPurchaseButton } from "@/lib/offerPurchaseUi";
import { getPublicStoreOffer, mirrorPublicOfferOrder } from "@/lib/supabase/storeOffers";
import { getSupabaseClient } from "@/lib/supabase/client";

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
  items: Array<{ name: string; retailPrice: number; offerPrice: number; type: "product" | "recipe" }>;
  originalTotalRetail: number;
  offerPrice: number;
  discountAmount: number;
  discountPercent: number;
  description: string;
  type: string;
  startDate: string;
  endDate: string;
  startAt?: number;
  endAt?: number;
  loyaltyPoints?: number;
  isActivated?: boolean;
}

interface CustomerLoyalty {
  name: string;
  customerCode: string;
  phone: string;
  points: number;
  usedCoupons: string[];
  transactions?: Array<{ id: string; points: number; source: string; description: string; createdAt: string }>;
}

export default function PublicOfferPage() {
  const [offerId, setOfferId] = useState<string | null>(null);
  const [offer, setOffer] = useState<SmartOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [referralPhone, setReferralPhone] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [customerRecord, setCustomerRecord] = useState<CustomerLoyalty | null>(null);
  const [purchaseRequestId, setPurchaseRequestId] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const registerOfferCustomer = trpc.catalog.registerOfferCustomer.useMutation();
  const createOfferPurchaseRequest = trpc.catalog.createOfferPurchaseRequest.useMutation();
  const rewardLevelsQuery = trpc.catalog.getPublicLoyaltyRewardLevels.useQuery(undefined, { staleTime: 30_000, retry: false });
  const activeCustomerCode = customerRecord?.customerCode || customerCode.trim();
  const offerPurchaseStatusQuery = trpc.catalog.getOfferPurchaseStatus.useQuery(
    { id: purchaseRequestId || "", customerCode: activeCustomerCode },
    { enabled: Boolean(purchaseRequestId && activeCustomerCode), retry: false, refetchInterval: data => data?.status === "pending" ? 5_000 : false },
  );
  const refreshedCustomerProfileQuery = trpc.catalog.getLoyaltyProfile.useQuery(
    { customerCode: activeCustomerCode },
    { enabled: Boolean(activeCustomerCode && isRegistered && offerPurchaseStatusQuery.data?.status === "approved"), retry: false },
  );

  const couponRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    setOfferId(id);
  }, []);

  useEffect(() => {
    if (!offerId) return;
    let active = true;
    const loadOffer = () => getPublicStoreOffer(offerId).then(row => {
      if (!active) return;
      if (!row) { setOffer(null); setLoading(false); return; }
      const data = row.offer_data && typeof row.offer_data === "object" && !Array.isArray(row.offer_data) ? row.offer_data as Record<string, unknown> : {};
      const offerPrice = Number(data.offerPrice ?? row.offer_price ?? 0) || 0;
      const originalTotalRetail = Number(data.originalTotalRetail ?? data.originalPrice ?? row.original_price ?? 0) || 0;
      const storedBannerUrl = String(data.bannerImageUrl || row.image_url || "");
      const legacyAiScene = storedBannerUrl.includes("/ai-banner-");
      const offerItems = Array.isArray(data.items) ? data.items as Array<{ imageUrl?: string; image_url?: string }> : [];
      const legacyProductImage = offerItems.find(item => item.imageUrl || item.image_url);
      const savedDiscountAmount = Number(data.discountAmount ?? data.savings ?? 0) || 0;
      const discountAmount = savedDiscountAmount > 0 ? savedDiscountAmount : Math.max(0, originalTotalRetail - offerPrice);
      const savedDiscountPercent = Number(data.discountPercent ?? 0) || 0;
      const discountPercent = savedDiscountPercent > 0 ? savedDiscountPercent : originalTotalRetail > 0 ? discountAmount / originalTotalRetail * 100 : 0;
      setOffer({ ...(data as unknown as SmartOffer), id: row.id, title: String(data.title || row.title || "عرض أبو رغوة"), strategyName: String(data.strategyName || row.strategy || "عرض أبو رغوة"), promoText: String(data.promoText || row.promo_text || row.banner_title || ""), bannerImageUrl: (legacyAiScene ? String(legacyProductImage?.imageUrl || legacyProductImage?.image_url || "") : storedBannerUrl) || undefined, bannerCustomImage: String(data.bannerCustomImage || data.banner_custom_image || row.banner_custom_image || (legacyAiScene ? storedBannerUrl : "")) || undefined, bgColor: String(data.bgColor || data.bg_color || row.bg_color || "#0c0907"), bgGradient: String(data.bgGradient || data.bg_gradient || row.bg_gradient || "linear-gradient(135deg, #0c0907 0%, #3b1d0b 52%, #f59e0b 100%)"), backgroundMode: data.backgroundMode === "solid" ? "solid" : "gradient", description: String(data.description || row.public_description || row.description || ""), offerPrice, originalTotalRetail, discountAmount, discountPercent, items: Array.isArray(data.items) ? data.items as SmartOffer["items"] : [], startAt: row.starts_at ? Date.parse(row.starts_at) : Number(data.startAt || 0) || undefined, endAt: row.ends_at ? Date.parse(row.ends_at) : Number(data.endAt || 0) || undefined, startDate: String(data.startDate || row.start_date || ""), endDate: String(data.endDate || row.expires_at || ""), isActivated: row.is_active, loyaltyPoints: Number(data.loyaltyPoints ?? row.points_reward ?? 0), type: "cloud" });
      setLoading(false);
    }).catch(() => { if (active) { setOffer(null); setLoading(false); } });
    void loadOffer();
    const channel = getSupabaseClient().channel(`public-offer-${offerId}`).on("postgres_changes", { event: "*", schema: "public", table: "store_offers", filter: `id=eq.${offerId}` }, () => { void loadOffer(); }).subscribe();
    return () => { active = false; void getSupabaseClient().removeChannel(channel); };
  }, [offerId]);

  useEffect(() => {
    const profile = refreshedCustomerProfileQuery.data;
    if (!profile) return;
    setCustomerRecord(profile as CustomerLoyalty);
    setCustomerName(profile.name);
    setCustomerPhone(profile.phone || "");
    setCustomerCode(profile.customerCode);
  }, [refreshedCustomerProfileQuery.data]);

  useEffect(() => {
    if (!offer) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [offer]);

  const handleRegisterCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (offer && getOfferExpiryInfo(offer, now).status === "expired") {
      toast.error("انتهت صلاحية هذا العرض، ولا يمكن تسجيله أو إضافة نقاط منه.");
      return;
    }
    if (!customerName.trim()) {
      toast.error("⚠️ يرجى إدخال الاسم");
      return;
    }
    try {
      const profile = await registerOfferCustomer.mutateAsync({ name: customerName.trim(), phone: customerPhone.trim() || undefined, customerCode: customerCode.trim() || undefined, referralPhone: referralPhone.trim() || undefined });
      if (!profile) throw new Error("تعذر إنشاء بطاقة الولاء");
      setCustomerName(profile.name);
      setCustomerPhone(profile.phone || "");
      setCustomerCode(profile.customerCode);
      setCustomerRecord(profile);
      setIsRegistered(true);
      toast.success("تم تسجيل بطاقة نقاطك. عند إتمام الشراء اضغط «اطلب العرض الآن» حتى يصل طلبك للمحل وتُضاف النقاط بعد التأكيد.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("كود نقاط الولاء غير صحيح")) {
        toast.error("هذا الكود غير مسجل. إذا كانت هذه أول مرة، امسح الكود واترك الخانة فارغة ليُنشئ النظام كودًا جديدًا لك.");
        return;
      }
      toast.error("تعذر حفظ بطاقة نقاط الولاء الآن، حاول مرة أخرى.");
    }
  };

  const handleOfferPurchase = async () => {
    const code = customerRecord?.customerCode || customerCode.trim();
    if (!offer || !code) {
      toast.error("سجّل بطاقة نقاطك أولًا حتى يرتبط طلب العرض بكودك.");
      return;
    }
    if (getOfferExpiryInfo(offer, now).status === "expired") {
      toast.error("انتهت صلاحية هذا العرض.");
      return;
    }
    try {
      const request = await createOfferPurchaseRequest.mutateAsync({ offerId: offer.id, customerCode: code, customerNote: customerNote.trim() || undefined });
      try {
        await mirrorPublicOfferOrder({ id: request.id, offerId: offer.id, customerName: customerRecord?.name || customerName, customerCode: code, customerPhone: customerRecord?.phone || customerPhone, pointsCost: offer.loyaltyPoints });
      } catch {
        toast.warning("تم إرسال الطلب للمحل، لكن تعذر إنشاء النسخة السحابية الثانوية.");
      }
      setPurchaseRequestId(request.id);
      toast.success("وصل طلب شراء العرض إلى المحل. ستُضاف النقاط بعد تأكيد إتمام الشراء.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال طلب شراء العرض الآن.");
    }
  };

  const handleDownloadCouponImage = async () => {
    if (!couponRef.current) return;
    try {
      toast.info("⏳ جاري تجهيز وتحميل صورة الكوبون...");
      const canvas = await html2canvas(couponRef.current, { scale: 2, useCORS: true });
      const image = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = image;
      a.download = `abu_raghwa_coupon_${offer?.id || "offer"}.png`;
      a.click();
      toast.success("📥 تم تحميل صورة الكوبون بجودة عالية بنجاح!");
    } catch (error) {
      toast.error("⚠️ حدث خطأ أثناء تحميل الصورة، يرجى التقاط لقطة شاشة (Screen Shot)");
    }
  };

  const handleShareWhatsApp = () => {
    if (!offer) return;
    const publicUrl = window.location.href;
    const msg = `🎁 *عرض حصري من محلات أبو رغوة للمنظفات* 🎁\n\n✨ *${offer.title}*\n📌 نوع العرض: ${offer.strategyName}\n📝 ${offer.description}\n\n💰 السعر القطاعي: ${offer.originalTotalRetail} ج.م\n🔥 *سعر العرض الحصري: ${offer.offerPrice} ج.م*\n📉 التوفير: ${offer.discountAmount} ج.م (${offer.discountPercent}% خصم)\n\n🔗 *افتح الكوبون واكتسب نقاط ولاء:*\n${publicUrl}\n\n📞 للتواصل: 01069035599\n🎁 هنسيب علامة في بيتك!`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handleShareOffer = async () => {
    if (!offer) return;
    const url = window.location.href;
    const text = `🎁 ${offer.title} من أبو رغوة\nوفر ${offer.discountAmount} ج.م واحصل على ${offer.loyaltyPoints} نقطة. افتح العرض من هنا:`;
    if (navigator.share) {
      try { await navigator.share({ title: offer.title, text, url }); } catch { /* أغلق المستخدم نافذة المشاركة */ }
    } else {
      await navigator.clipboard?.writeText(`${text}\n${url}`);
      toast.success("تم نسخ رابط العرض لمشاركته مع أصدقائك");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4" dir="rtl">
        <div className="text-center space-y-3">
          <Sparkles className="w-10 h-10 text-orange-600 animate-spin mx-auto" />
          <p className="text-gray-700 font-bold">جاري تحميل كوبون العرض من الخادم...</p>
        </div>
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4" dir="rtl" style={{ textAlign: "right" }}>
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-4 border-2 border-orange-200">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto font-black text-2xl">⚠️</div>
          <h2 className="text-xl font-black text-gray-900">عذراً، هذا العرض غير متوفر</h2>
          <p className="text-xs text-gray-500">يرجى التأكد من رابط العرض أو التواصل مع محلات أبو رغوة للمنظفات.</p>
        </div>
      </div>
    );
  }

  const currentPoints = Math.max(0, Math.trunc(Number(customerRecord?.points) || 0));
  const activeRewardLevels = rewardLevelsQuery.data ?? [];
  const expiryInfo = getOfferExpiryInfo(offer, now);
  const isExpired = expiryInfo.status === "expired";
  const strategyLabel = /bogo|buy.?one|get.?one|1\s*\+\s*1|واحد.*مجان|اشتر.*مجان/i.test(offer.strategyName) ? "BOGO 1+1" : offer.strategyName;
  const purchaseButtonDisabled = shouldDisableOfferPurchaseButton({
    isExpired,
    isSubmitting: createOfferPurchaseRequest.isLoading,
    requestId: purchaseRequestId,
    isStatusFetching: offerPurchaseStatusQuery.isFetching,
    status: offerPurchaseStatusQuery.data?.status,
  });
  const handleStickyPurchase = () => {
    if (isExpired) return;
    if (!isRegistered) {
      document.getElementById("offer-customer-registration")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!purchaseButtonDisabled) void handleOfferPurchase();
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-50 pb-28 text-slate-900" dir="rtl" style={{ textAlign: "right" }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true"><span className="foam-bubble foam-bubble-a" /><span className="foam-bubble foam-bubble-b" /><span className="foam-bubble foam-bubble-c" /><span className="foam-bubble foam-bubble-d" /><span className="foam-bubble foam-bubble-e" /></div>

      <main className="relative z-10 mx-auto w-full max-w-5xl">
        <div ref={couponRef} className="overflow-hidden bg-white shadow-xl sm:my-5 sm:rounded-3xl">
          <section aria-label={`بانر العرض ${offer.title}`} className="relative isolate aspect-[2/1] max-h-[420px] min-h-[170px] w-full overflow-hidden bg-slate-900 sm:aspect-[2.2/1]">
            <div className="absolute inset-0 z-0" style={{ backgroundColor: offer.bgColor || "#0c0907", backgroundImage: offer.bannerCustomImage ? `linear-gradient(90deg,rgba(15,23,42,.32),rgba(15,23,42,.05)),url("${offer.bannerCustomImage}")` : offer.backgroundMode === "solid" ? undefined : offer.bgGradient || undefined, backgroundSize: offer.bannerCustomImage ? "cover" : undefined, backgroundPosition: "center" }} />
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true"><span className="foam-bubble foam-bubble-a" /><span className="foam-bubble foam-bubble-b" /><span className="foam-bubble foam-bubble-c" /></div>
            {offer.bannerImageUrl && <img src={offer.bannerImageUrl} alt={`صورة المنتج في ${offer.title}`} crossOrigin="anonymous" className="absolute bottom-2 left-3 z-20 h-[88%] max-w-[38%] object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,.4)] sm:left-8" />}
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-30 h-8 bg-gradient-to-t from-white/35 to-transparent" aria-hidden="true" />
            <svg className="pointer-events-none absolute bottom-0 left-1/2 z-30 h-8 w-44 -translate-x-1/2 sm:w-64" viewBox="0 0 256 48" fill="none" aria-hidden="true"><path d="M0 46c10-16 20-14 29-4 4-18 22-25 34-8 8-24 31-28 43-8 8-15 25-18 37-3 12-22 35-18 42 1 14-15 31-8 34 7 12-12 26-3 37 15H0Z" fill="white" fillOpacity=".9"/><circle cx="44" cy="31" r="7" fill="white" fillOpacity=".72"/><circle cx="107" cy="30" r="5" fill="white" fillOpacity=".78"/><circle cx="184" cy="29" r="7" fill="white" fillOpacity=".74"/></svg>
          </section>

          <section className="mx-auto w-full max-w-3xl space-y-3 px-3 py-4 sm:px-6 sm:py-6">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {offer.discountPercent > 0 && <span className="rounded-full border border-white/50 bg-emerald-600 px-3 py-1 text-xs font-black text-white shadow">وفر {offer.discountPercent.toLocaleString("ar-EG", { maximumFractionDigits: 1 })}%</span>}
              {strategyLabel && <span className="rounded-full border border-orange-200 bg-orange-100 px-3 py-1 text-xs font-black text-orange-900 shadow-sm">{strategyLabel}</span>}
              {Number(offer.loyaltyPoints || 0) > 0 && <span className="rounded-full border border-violet-200 bg-violet-100 px-3 py-1 text-xs font-black text-violet-900">⭐ {Math.trunc(Number(offer.loyaltyPoints))} نقطة بعد اعتماد الشراء</span>}
            </div>

            <header className="space-y-1 text-center">
              <p className="text-xs font-black text-orange-700">محلات أبو رغوة للمنظفات</p>
              <h1 className="text-2xl font-black leading-tight text-slate-950 sm:text-3xl">{offer.title}</h1>
              {offer.promoText && <p className="text-sm font-bold leading-6 text-orange-800">{offer.promoText}</p>}
            </header>

            <div className="grid grid-cols-1 items-center gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-br from-green-50 to-emerald-50 p-3 shadow-sm sm:grid-cols-[1fr_auto] sm:p-4">
              <div className="flex items-center justify-between gap-3 sm:justify-start sm:gap-5">
                <div><p className="text-[11px] font-bold text-slate-600">السعر قبل الخصم</p><p className="text-sm font-bold text-slate-500 line-through">{offer.originalTotalRetail.toLocaleString("ar-EG")} ج.م</p></div>
                <div><p className="text-[11px] font-bold text-emerald-800">سعر العرض</p><p className="text-3xl font-black leading-none text-emerald-700 sm:text-4xl">{offer.offerPrice.toLocaleString("ar-EG")} <span className="text-sm">ج.م</span></p></div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-center text-sm font-black text-emerald-800">وفّر {offer.discountAmount.toLocaleString("ar-EG")} جنيه</div>
            </div>

            <div className="space-y-2 text-sm leading-6 text-slate-700">
              {offer.description && <p className="line-clamp-3">{offer.description}</p>}
              {offer.items?.length > 0 && <div className="space-y-1.5">{offer.items.slice(0, 4).map((item, idx) => <div key={`${item.name}-${idx}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="font-bold text-slate-800">{item.name}</span><span className="shrink-0 font-black text-slate-800">{Number(item.offerPrice).toLocaleString("ar-EG")} ج.م <span className="mr-1 text-slate-400 line-through">{Number(item.retailPrice).toLocaleString("ar-EG")}</span></span></div>)}</div>}
              {offer.items && offer.items.length > 4 && <p className="text-center text-[11px] font-bold text-slate-500">و{offer.items.length - 4} منتجات أخرى ضمن العرض</p>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] font-bold text-slate-600"><span className={`rounded-full px-3 py-1 ${isExpired ? "bg-red-100 text-red-700" : "bg-orange-50 text-orange-800"}`}>{isExpired ? "انتهت صلاحية العرض" : formatOfferTimeRemaining(expiryInfo)}</span><span>📞 الدعم: 01069035599</span></div>
            </div>
          </section>
        </div>

        <section id="offer-customer-registration" className="mx-auto mt-4 w-full max-w-3xl scroll-mt-24 px-3 sm:px-6">
          <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-black text-violet-950"><Star className="h-4 w-4 fill-yellow-400 text-yellow-500" /> بطاقة الولاء والطلب</h2>{isRegistered && <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-800">{currentPoints.toLocaleString("ar-EG")} نقطة</span>}</div>

            {!isRegistered ? (
              <form onSubmit={handleRegisterCustomer} className="space-y-2.5">
                <p className="text-[11px] leading-5 text-slate-600">سجّل بياناتك لإرسال طلب العرض وربط نقاط الولاء. الهاتف وكود الإحالة اختياريان.</p>
                <Input value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="اسمك الكريم" required className="bg-white text-xs font-bold text-right" style={{ direction: "rtl" }} />
                <Input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="رقم الهاتف (اختياري)" type="tel" className="bg-white text-xs font-bold text-right" style={{ direction: "rtl" }} />
                <Input value={customerCode} onChange={event => setCustomerCode(event.target.value)} placeholder="كود نقاطك (4 خانات، اختياري)" className="bg-white text-xs font-bold text-left" style={{ direction: "ltr" }} />
                <Input value={referralPhone} onChange={event => setReferralPhone(event.target.value)} placeholder="هاتف الصديق الذي دعاك (اختياري)" type="tel" className="bg-white text-xs font-bold text-right" style={{ direction: "rtl" }} />
                <Button type="submit" disabled={isExpired || registerOfferCustomer.isLoading} className="w-full rounded-xl bg-violet-700 py-2 text-xs font-black text-white hover:bg-violet-800 disabled:bg-slate-400">{isExpired ? "انتهت صلاحية العرض" : registerOfferCustomer.isLoading ? "جارٍ التسجيل…" : "سجّل بياناتك للطلب وكسب النقاط"}</Button>
              </form>
            ) : (
              <div className="space-y-2 text-center">
                <p className="text-xs font-extrabold text-slate-900">أهلاً بك يا {customerName} 🌟</p>
                <p className="text-[11px] text-violet-700">كود نقاطك: <strong dir="ltr">{customerRecord?.customerCode || customerCode}</strong></p>
                <LoyaltyRewardProgressCard points={currentPoints} levels={activeRewardLevels} compact isLoading={rewardLevelsQuery.isLoading && activeRewardLevels.length === 0} />
              </div>
            )}

            {isRegistered && <div className="mt-3 space-y-2">
              <Textarea value={customerNote} onChange={event => setCustomerNote(event.target.value)} maxLength={1000} placeholder="ملاحظات اختيارية: توصيل أو استلام من المحل" className="bg-white text-xs" />
              {offerPurchaseStatusQuery.data?.status === "pending" && <div className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-center text-[11px] font-bold text-amber-900">وصل طلبك إلى المحل وبانتظار تأكيد إتمام الشراء. ستضاف النقاط بعد الموافقة.</div>}
              {offerPurchaseStatusQuery.data?.status === "approved" && <div className="rounded-xl border border-green-300 bg-green-50 p-2 text-center text-[11px] font-bold text-green-800"><CheckCircle2 className="ml-1 inline h-4 w-4" /> تم تأكيد الشراء وإضافة {offerPurchaseStatusQuery.data.loyaltyPointsAwarded} نقطة.</div>}
              {offerPurchaseStatusQuery.data?.status === "cancelled" && <div className="rounded-xl border border-slate-300 bg-slate-50 p-2 text-center text-[11px] font-bold text-slate-700">أُلغي الطلب السابق ولم تُضف نقاط؛ يمكنك تقديم طلب جديد.</div>}
              <p className="text-center text-[10px] leading-5 text-slate-500">طلبك يصل للمحل للمراجعة، وليس دفعاً إلكترونياً. وتُضاف النقاط بعد اعتماد إتمام الشراء.</p>
              <a href={buildLoyaltyPageHref(customerRecord?.customerCode || customerCode, customerPhone || customerRecord?.phone)} className="block text-center text-[11px] font-black text-violet-700 underline hover:text-violet-900">متابعة نقاطك وسجل حركاتك</a>
            </div>}
          </div>
        </section>

        <section className="mx-auto mt-4 flex w-full max-w-3xl flex-col gap-2 px-3 pb-5 sm:px-6">
          <Button onClick={handleDownloadCouponImage} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 py-3 font-black text-white shadow"><Download className="h-4 w-4" /> حفظ تفاصيل العرض كصورة</Button>
          <div className="grid grid-cols-2 gap-2"><Button onClick={() => void handleShareOffer()} className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-black text-white hover:bg-slate-800"><Share2 className="h-4 w-4" /> مشاركة العرض</Button><Button onClick={handleShareWhatsApp} className="flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-xs font-black text-white hover:bg-green-700"><MessageCircle className="h-4 w-4" /> واتساب</Button></div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 shadow-[0_-6px_24px_rgba(15,23,42,.12)] backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 pt-2" style={{ paddingBottom: "max(.5rem, env(safe-area-inset-bottom))" }}>
          <div className="min-w-[92px] shrink-0"><p className="text-[10px] font-bold text-slate-500">إجمالي العرض</p><p className="text-lg font-black leading-tight text-emerald-700">{offer.offerPrice.toLocaleString("ar-EG")} <span className="text-xs">ج.م</span></p></div>
          <Button type="button" onClick={handleStickyPurchase} disabled={isExpired || (isRegistered && purchaseButtonDisabled)} className="min-h-12 flex-1 rounded-xl bg-orange-600 px-3 text-sm font-black text-white shadow-md hover:bg-orange-700 disabled:bg-slate-400">{isExpired ? "انتهت صلاحية العرض" : isRegistered && offerPurchaseStatusQuery.data?.status === "pending" ? "طلبك بانتظار موافقة المحل" : <><ShoppingCart className="ml-2 inline h-5 w-5" />{isRegistered ? "اطلب العرض الآن" : "اطلب الآن"}</>}</Button>
        </div>
      </div>
    </div>
  );
}
