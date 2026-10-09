import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, Eye, History, Sparkles, Trash2, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useCloudState } from "@/lib/cloudSync";
import { formatOfferTimeRemaining, getOfferExpiryInfo } from "@/lib/offerExpiry";

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
  startDate: string;
  endDate: string;
  startAt?: number;
  endAt?: number;
}

type OffersTab = "active" | "expired";

export default function SmartOffersList() {
  const [, navigate] = useLocation();
  const [legacySavedOffers, setLegacySavedOffers] = useCloudState<SmartOffer[]>("abu_raghwa_saved_offers", []);
  const savedOffersQuery = trpc.offers.list.useQuery(undefined, { staleTime: 0, refetchOnMount: "always", refetchInterval: 30_000, retry: false });
  const savedOffers = (savedOffersQuery.data as SmartOffer[] | null | undefined) ?? legacySavedOffers;
  const [activeTab, setActiveTab] = useState<OffersTab>("active");
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const deleteOfferMutation = trpc.offers.delete.useMutation();
  const trpcUtils = trpc.useUtils();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const { activeOffers, expiredOffers } = useMemo(() => {
    const activeOffers: SmartOffer[] = [];
    const expiredOffers: SmartOffer[] = [];
    savedOffers.forEach((offer) => {
      if (getOfferExpiryInfo(offer, now).status === "active") activeOffers.push(offer);
      else expiredOffers.push(offer);
    });
    return { activeOffers, expiredOffers };
  }, [now, savedOffers]);

  const visibleOffers = activeTab === "active" ? activeOffers : expiredOffers;

  const handleDeleteOffer = async (offer: SmartOffer) => {
    const confirmed = window.confirm(`هل تريد حذف عرض «${offer.title}» نهائيًا؟\nسيتم إيقاف رابط الكوبون والـ QR الخاص به.`);
    if (!confirmed) return;

    try {
      await deleteOfferMutation.mutateAsync({ id: offer.id });
      setLegacySavedOffers(previous => previous.filter((item) => item.id !== offer.id));
      await trpcUtils.offers.list.invalidate();

      try {
        const globalOffers = JSON.parse(localStorage.getItem("abu_raghwa_global_offers") || "{}");
        delete globalOffers[offer.id];
        localStorage.setItem("abu_raghwa_global_offers", JSON.stringify(globalOffers));
      } catch {
        localStorage.removeItem("abu_raghwa_global_offers");
      }

      if (expandedOfferId === offer.id) setExpandedOfferId(null);
      toast.success("تم حذف العرض وإيقاف رابط الكوبون الخاص به.");
    } catch {
      toast.error("تعذر حذف العرض من الخادم. أعد المحاولة بعد التأكد من تسجيل الدخول.");
    }
  };

  const renderOfferCard = (offer: SmartOffer) => {
    const expiry = getOfferExpiryInfo(offer, now);
    const isActive = expiry.status === "active";
    const isExpanded = expandedOfferId === offer.id;

    return (
      <Card key={offer.id} className={`overflow-hidden border-2 ${isActive ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50"}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate text-base text-slate-900">{offer.title}</CardTitle>
              <CardDescription className="mt-1 truncate">{offer.strategyName}</CardDescription>
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

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setExpandedOfferId(isExpanded ? null : offer.id)} className="border-blue-200 text-blue-700 hover:bg-blue-50">
              <Eye className="ml-1 h-4 w-4" /> {isExpanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
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

          {visibleOffers.length === 0 ? (
            <div className="py-14 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-orange-300" />
              <p className="mt-3 font-bold text-slate-700">{activeTab === "active" ? "لا توجد عروض متاحة حاليًا." : "لا توجد عروض منتهية حاليًا."}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{visibleOffers.map(renderOfferCard)}</div>
          )}
        </section>
      </main>
    </div>
  );
}
