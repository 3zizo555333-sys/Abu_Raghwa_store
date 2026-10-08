import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Gift, Star, Clock, Download, MessageCircle, ShoppingCart, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { trpc } from "@/lib/trpc";
import { formatOfferTimeRemaining, getOfferExpiryInfo } from "@/lib/offerExpiry";
import { buildLoyaltyPageHref } from "@/lib/loyaltyLookup";
import { LoyaltyRewardProgressCard } from "@/components/LoyaltyRewardProgress";
import { shouldDisableOfferPurchaseButton } from "@/lib/offerPurchaseUi";

interface SmartOffer {
  id: string;
  title: string;
  strategyName: string;
  items: Array<{ name: string; costPrice: number; retailPrice: number; offerPrice: number; type: "product" | "recipe" }>;
  originalTotalRetail: number;
  totalCostPrice: number;
  offerPrice: number;
  discountAmount: number;
  discountPercent: number;
  description: string;
  type: string;
  startDate: string;
  endDate: string;
  startAt?: number;
  endAt?: number;
  qrCodeDataUrl?: string;
  loyaltyPoints?: number;
}

interface RewardLevel {
  points: number;
  giftName: string;
  confirmed?: boolean;
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
  const [customerCode, setCustomerCode] = useState("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [customerRecord, setCustomerRecord] = useState<CustomerLoyalty | null>(null);
  const [purchaseRequestId, setPurchaseRequestId] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [rewardLevels, setRewardLevels] = useState<RewardLevel[]>([]);
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

  // استعلام تريكس لجلب العرض من الخادم السحابي
  const { data: serverOfferJson, isLoading: serverLoading, isSuccess: serverOfferLookupSucceeded } = trpc.offers.get.useQuery(
    { id: offerId || "" },
    { enabled: !!offerId }
  );

  useEffect(() => {
    if (serverLoading) return;

    if (serverOfferJson) {
      try {
        const parsed = JSON.parse(serverOfferJson);
        setOffer(parsed);
        setLoading(false);
        return;
      } catch (e) {}
    }

    // A successful server miss means the manager deliberately removed this
    // coupon; do not resurrect it from a customer's stale local cache.
    if (serverOfferLookupSucceeded) {
      setOffer(null);
      setLoading(false);
      return;
    }

    // fallback محلي للتخزين المحلي إن وجد
    if (offerId) {
      try {
        const globalOffers = JSON.parse(localStorage.getItem("abu_raghwa_global_offers") || "{}");
        if (globalOffers[offerId]) {
          setOffer(globalOffers[offerId]);
          setLoading(false);
          return;
        }

        const savedOffers = JSON.parse(localStorage.getItem("abu_raghwa_saved_offers") || "[]");
        const found = savedOffers.find((o: SmartOffer) => o.id === offerId);
        if (found) {
          setOffer(found);
          setLoading(false);
          return;
        }
      } catch (e) {}
    }

    setLoading(false);
  }, [serverOfferJson, serverLoading, serverOfferLookupSucceeded, offerId]);

  useEffect(() => {
    // تحميل مستويات المكافآت المؤكدة
    const savedRewards = localStorage.getItem("abu_reward_levels");
    if (savedRewards) {
      try {
        const parsed = JSON.parse(savedRewards);
        setRewardLevels(parsed.filter((r: RewardLevel) => r.confirmed));
      } catch (e) {
        setRewardLevels([
          { points: 20, giftName: "كيس مسحوق غسيل 1 كيلو هدية 🎁", confirmed: true },
          { points: 50, giftName: "جركن صابون سائل 4 لتر مميز 🧴", confirmed: true },
          { points: 100, giftName: "باكدج منظفات منزلية شاملة 🌟", confirmed: true },
          { points: 200, giftName: "هدية كبرى خاصة (100 ج أو تيشيرت أو فرخة) ⭐", confirmed: true }
        ]);
      }
    } else {
      setRewardLevels([
        { points: 20, giftName: "كيس مسحوق غسيل 1 كيلو هدية 🎁", confirmed: true },
        { points: 50, giftName: "جركن صابون سائل 4 لتر مميز 🧴", confirmed: true },
        { points: 100, giftName: "باكدج منظفات منزلية شاملة 🌟", confirmed: true },
        { points: 200, giftName: "هدية كبرى خاصة (100 ج أو تيشيرت أو فرخة) ⭐", confirmed: true }
      ]);
    }

    const savedUserPhone = localStorage.getItem("abu_active_customer_phone");
    const savedUserCode = localStorage.getItem("abu_active_customer_code");
    if (savedUserPhone || savedUserCode) {
      const allCustomers: CustomerLoyalty[] = JSON.parse(localStorage.getItem("abu_raghwa_customers") || "[]");
      const foundCust = allCustomers.find(c => (savedUserCode && c.customerCode === savedUserCode) || (savedUserPhone && c.phone === savedUserPhone));
      if (foundCust) {
        setCustomerName(foundCust.name);
        setCustomerPhone(foundCust.phone || "");
        setCustomerCode(foundCust.customerCode);
        setCustomerRecord(foundCust);
        setIsRegistered(true);
      }
    }

  }, []);

  useEffect(() => {
    if (!offerId || !activeCustomerCode) return;
    try {
      setPurchaseRequestId(localStorage.getItem(`abu_offer_purchase_${offerId}_${activeCustomerCode}`) || "");
    } catch {
      setPurchaseRequestId("");
    }
  }, [offerId, activeCustomerCode]);

  useEffect(() => {
    const profile = refreshedCustomerProfileQuery.data;
    if (!profile) return;
    setCustomerRecord(profile as CustomerLoyalty);
    setCustomerName(profile.name);
    setCustomerPhone(profile.phone || "");
    setCustomerCode(profile.customerCode);
    try {
      localStorage.setItem("abu_active_customer_code", profile.customerCode);
      if (profile.phone) localStorage.setItem("abu_active_customer_phone", profile.phone);
      localStorage.setItem("abu_raghwa_customers", JSON.stringify([{ ...profile, usedCoupons: profile.usedCoupons || [] }]));
    } catch {}
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
      const profile = await registerOfferCustomer.mutateAsync({ name: customerName.trim(), phone: customerPhone.trim() || undefined, customerCode: customerCode.trim() || undefined });
      if (!profile) throw new Error("تعذر إنشاء بطاقة الولاء");
      if (profile.phone) localStorage.setItem("abu_active_customer_phone", profile.phone);
      localStorage.setItem("abu_active_customer_code", profile.customerCode);
      localStorage.setItem("abu_raghwa_customers", JSON.stringify([{ ...profile, usedCoupons: profile.usedCoupons || [] }]));
      setCustomerName(profile.name);
      setCustomerPhone(profile.phone || "");
      setCustomerCode(profile.customerCode);
      setCustomerRecord(profile);
      setIsRegistered(true);
      toast.success("تم تسجيل بطاقة نقاطك. عند إتمام الشراء اضغط «شراء العرض» حتى يصل طلبك للمحل وتُضاف النقاط بعد التأكيد.");
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
      const request = await createOfferPurchaseRequest.mutateAsync({ offerId: offer.id, customerCode: code });
      setPurchaseRequestId(request.id);
      try { localStorage.setItem(`abu_offer_purchase_${offer.id}_${code}`, request.id); } catch {}
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

  if (loading || serverLoading) {
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
          <p className="text-xs text-gray-500">يرجى التأكد من مسح رمز الـ QR الصحيح الخاص بالعرض من داخل محلات أبو رغوة للمنظفات.</p>
        </div>
      </div>
    );
  }

  const currentPoints = Math.max(0, Math.trunc(Number(customerRecord?.points) || 0));
  const activeRewardLevels = rewardLevelsQuery.data ?? rewardLevels;
  const expiryInfo = getOfferExpiryInfo(offer, now);
  const isExpired = expiryInfo.status === "expired";

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100 py-8 px-4 flex flex-col items-center justify-center" dir="rtl" style={{ textAlign: "right" }}>
      
      <div className="w-full max-w-md space-y-4">
        
        {/* بطاقة الكوبون القابلة للتنزيل - تصميم مظبوط 100% عربي */}
        <div
          ref={couponRef}
          className="bg-white p-6 rounded-[2.5rem] border-4 border-orange-400 space-y-4 shadow-2xl relative overflow-hidden"
          style={{ direction: "rtl", textAlign: "right" }}
        >
          <div className="absolute top-0 left-0 w-24 h-24 bg-orange-200 rounded-br-full opacity-30 pointer-events-none"></div>

          {/* رأس الكوبون */}
          <div className="relative z-10 text-center space-y-1">
            <div className="flex justify-center items-center gap-1.5 text-orange-600 mb-1">
              <Gift className="w-6 h-6 animate-bounce" />
              <Sparkles className="w-6 h-6 text-yellow-600" />
            </div>
            <h1 className="text-2xl font-black text-orange-700 tracking-wide">محلات أبو رغوة للمنظفات</h1>
            <p className="text-xs font-bold text-gray-700">للمنظفات والعطور • أصل الرغوة في مصر</p>
            <span className="inline-block bg-orange-100 text-orange-800 text-[11px] px-3 py-0.5 rounded-full font-extrabold mt-1 shadow-sm">
              {Number(offer.loyaltyPoints || 0) > 0 ? `⭐ اكسب ${Math.trunc(Number(offer.loyaltyPoints))} نقطة عند شراء العرض واعتماده ⭐` : "⭐ كوبون عرض حصري — لا يمنح نقاط شراء إضافية ⭐"}
            </span>
          </div>

          {/* محتوى العرض */}
          <div className="border-t-2 border-b-2 border-orange-200 py-4 my-2 space-y-3 relative z-10">
            <div className="text-center">
              <span className="bg-gradient-to-r from-orange-600 to-red-600 text-white text-xs px-3.5 py-1 rounded-full font-black inline-block shadow">
                🎉 {offer.strategyName}
              </span>
            </div>
            
            <h2 className="text-lg font-black text-gray-900 text-center">{offer.title}</h2>
            <p className="text-xs text-gray-600 font-medium text-center">{offer.description}</p>
            {isExpired && <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-center text-xs font-black text-red-700">انتهت صلاحية هذا العرض ولا يمكن استخدام الكوبون الآن.</p>}

            <div className="space-y-2 pt-1">
              {offer.items && offer.items.map((item, idx) => (
                <div key={idx} className="bg-orange-50/70 p-3 rounded-2xl border border-orange-200 flex justify-between items-center text-xs">
                  <span className="font-extrabold text-gray-900">{item.name}</span>
                  <span className="font-black text-blue-700">{item.offerPrice} ج.م <span className="line-through text-gray-400 text-[10px] mr-1">{item.retailPrice} ج.م</span></span>
                </div>
              ))}
            </div>

            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-2xl border-2 border-green-300 text-center space-y-1 shadow-inner">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-gray-700">السعر الأصلي:</span>
                <span className="line-through text-gray-400 font-bold">{offer.originalTotalRetail} ج.م</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-extrabold text-gray-900 text-sm">سعر العرض الحصري:</span>
                <span className="font-black text-green-700 text-xl bg-white px-3 py-1 rounded-xl border border-green-300 shadow-sm">{offer.offerPrice} ج.م</span>
              </div>
              <p className="text-xs text-green-800 font-black pt-1">
                ✨ وفّر {offer.discountAmount} جنيه ({offer.discountPercent}% خصم فوري)
              </p>
            </div>
          </div>

          {/* قسم نقاط الولاء والهدية للعميل داخل الكوبون */}
          <div className="bg-purple-50 p-4 rounded-2xl border-2 border-purple-200 space-y-2 relative z-10">
            <h3 className="font-black text-xs text-purple-900 flex items-center gap-1.5 justify-end">
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /> رصيد نقاط الولاء وهديتك المستحقة:
            </h3>

            {!isRegistered ? (
              <form onSubmit={handleRegisterCustomer} className="space-y-2.5 pt-1">
                <p className="text-[11px] text-gray-600 text-center font-medium">أدخل اسمك. إن كان لديك حساب فاكتب كودك ذي الأربع خانات لربط النقاط به؛ الهاتف اختياري. وإن كنت جديدًا فاترك الكود فارغًا وسيُنشئه النظام لك.</p>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="اسمك الكريم (مثلاً: أحمد محمد)"
                  required
                  className="bg-white text-xs font-bold text-right"
                  style={{ direction: "rtl" }}
                />
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="رقم الهاتف (اختياري)"
                  type="tel"
                  className="bg-white text-xs font-bold text-right"
                  style={{ direction: "rtl" }}
                />
                <Input
                  value={customerCode}
                  onChange={(e) => setCustomerCode(e.target.value)}
                  placeholder="كود نقاطك (4 خانات، اختياري)"
                  className="bg-white text-xs font-bold text-left"
                  style={{ direction: "ltr" }}
                />
                <Button type="submit" disabled={isExpired || registerOfferCustomer.isLoading} className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-black py-2 rounded-xl shadow disabled:bg-gray-400">
                  {isExpired ? "انتهت صلاحية العرض" : "سجّل/اربط بطاقة نقاطك للشراء"}
                </Button>
              </form>
            ) : (
              <div className="space-y-2 text-center bg-white p-3 rounded-xl border border-purple-200">
                <p className="text-xs font-extrabold text-gray-900">أهلاً بك يا {customerName} 🌟</p>
                <p className="text-[11px] text-purple-700">كود نقاطك: <strong dir="ltr">{customerRecord?.customerCode || customerCode}</strong></p>
                <LoyaltyRewardProgressCard points={currentPoints} levels={activeRewardLevels} compact isLoading={rewardLevelsQuery.isLoading && rewardLevels.length === 0} />
              </div>
            )}
            {isRegistered && (
              <div className="space-y-2 pt-1">
                {offerPurchaseStatusQuery.data?.status === "pending" && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-center text-[11px] font-bold text-amber-900">
                    طلبك وصل إلى المحل وبانتظار تأكيد إتمام الشراء. ستضاف النقاط إلى كودك بعد الموافقة.
                  </div>
                )}
                {offerPurchaseStatusQuery.data?.status === "approved" && (
                  <div className="rounded-xl border border-green-300 bg-green-50 p-2 text-center text-[11px] font-bold text-green-800">
                    <CheckCircle2 className="ml-1 inline h-4 w-4" /> تم تأكيد شراء العرض وإضافة {offerPurchaseStatusQuery.data.loyaltyPointsAwarded} نقطة. رصيدك يُحدّث الآن.
                  </div>
                )}
                {offerPurchaseStatusQuery.data?.status === "cancelled" && (
                  <div className="rounded-xl border border-gray-300 bg-gray-50 p-2 text-center text-[11px] font-bold text-gray-700">أُلغي الطلب السابق ولم تُضف نقاط؛ يمكنك تسجيل طلب جديد إذا رغبت.</div>
                )}
                <Button
                  type="button"
                  onClick={handleOfferPurchase}
                  disabled={shouldDisableOfferPurchaseButton({
                    isExpired,
                    isSubmitting: createOfferPurchaseRequest.isLoading,
                    requestId: purchaseRequestId,
                    isStatusFetching: offerPurchaseStatusQuery.isFetching,
                    status: offerPurchaseStatusQuery.data?.status,
                  })}
                  className="w-full bg-orange-600 py-3 text-sm font-black text-white shadow-lg hover:bg-orange-700 disabled:bg-gray-400"
                >
                  <ShoppingCart className="ml-2 h-5 w-5" />
                  {isExpired ? "انتهت صلاحية العرض" : createOfferPurchaseRequest.isLoading ? "جارٍ إرسال طلبك…" : offerPurchaseStatusQuery.data?.status === "pending" ? "طلبك بانتظار موافقة المحل" : offerPurchaseStatusQuery.data?.status === "approved" ? "شراء العرض مرة أخرى" : "شراء العرض وإرسال الطلب للمحل"}
                </Button>
                <p className="text-center text-[10px] text-gray-600">اضغط عند شراء العرض فعلًا؛ سيراجع المحل الطلب ويضيف {Math.max(0, Math.trunc(Number(offer.loyaltyPoints) || 0))} نقطة إلى بطاقتك بعد التأكيد.</p>
              </div>
            )}
            <a href={buildLoyaltyPageHref(customerRecord?.customerCode || customerCode, customerPhone || customerRecord?.phone)} className="block text-center text-[11px] font-black text-purple-700 underline hover:text-purple-900">افتح صفحة متابعة نقاطك وسجل حركاتك</a>
          </div>

          {/* عداد تنازلي وعنوان التواصل */}
          <div className="text-[11px] text-gray-600 pt-2 border-t border-orange-200 relative z-10 space-y-1 text-center">
            <div className="flex justify-center items-center gap-3 font-bold text-orange-700 bg-orange-50 py-1.5 rounded-xl border border-orange-200">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatOfferTimeRemaining(expiryInfo)}</span>
            </div>
            <p className="font-extrabold text-gray-900 pt-1">📞 للتواصل والدعم: 01069035599</p>
            <p className="text-[9px] text-gray-400">هنسيب علامة في بيتك • أصل الرغوة في مصر</p>
          </div>
        </div>

        {/* أزرار تفاعلية تحت الكوبون (تحميل ومشاركة) */}
        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={handleDownloadCouponImage}
            className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 text-base"
          >
            <Download className="w-5 h-5" /> تحميل الكوبون كصورة PNG على هاتفك 📥
          </Button>
          <Button
            onClick={handleShareWhatsApp}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-2xl shadow-md flex items-center justify-center gap-2 text-sm"
          >
            <MessageCircle className="w-4 h-4" /> مشاركة العرض عبر واتساب 📱
          </Button>
        </div>

      </div>
    </div>
  );
}
