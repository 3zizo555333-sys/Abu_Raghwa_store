import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, Gift, Sparkles, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCloudState } from "@/lib/cloudSync";
import { formatOfferTimeRemaining, getOfferExpiryInfo } from "@/lib/offerExpiry";
import { trpc } from "@/lib/trpc";

type CatalogOffer = {
  id: string;
  title: string;
  strategyName?: string;
  description?: string;
  offerPrice: number;
  originalTotalRetail?: number;
  discountAmount?: number;
  discountPercent?: number;
  items?: Array<{ name: string }>;
  startAt?: number;
  endAt?: number;
  startDate?: string;
  endDate?: string;
  isActivated?: boolean;
};

export default function CatalogOffersPage() {
  const [legacyOffers] = useCloudState<CatalogOffer[]>("abu_raghwa_saved_offers", []);
  const publishedOffersQuery = trpc.offers.list.useQuery(undefined, { staleTime: 0, refetchOnMount: "always", retry: false });
  const publishedOffers = publishedOffersQuery.data as CatalogOffer[] | undefined;
  const offers: CatalogOffer[] = publishedOffers ?? legacyOffers;
  const [now, setNow] = useState(() => Date.now());
  const catalogBackUrl = typeof window === "undefined" ? "/catalog" : `/catalog${window.location.search}`;
  const activeOffers = useMemo(() => (Array.isArray(offers) ? offers : []).filter(offer => offer.isActivated !== false && getOfferExpiryInfo(offer, now).status === "active"), [offers, now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fffaf5] px-4 py-6 text-slate-900" dir="rtl">
      <div className="mx-auto max-w-5xl">
        <a href={catalogBackUrl} className="inline-flex max-w-full items-center gap-2 text-sm font-black text-orange-700 hover:text-orange-800"><ArrowRight className="h-4 w-4 shrink-0" />العودة إلى الكتالوج</a>
        <section className="mt-5 overflow-hidden rounded-[2rem] bg-gradient-to-l from-orange-600 via-amber-500 to-yellow-400 p-6 text-white shadow-xl sm:p-9">
          <div className="flex items-start gap-4"><span className="grid h-15 w-15 shrink-0 place-items-center rounded-3xl bg-white/20 p-4 shadow-lg"><Sparkles className="h-8 w-8" /></span><div><p className="text-sm font-black text-orange-50">عروض أبو رغوة للعملاء</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">عروض وخصومات حصرية</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-orange-50">اختر العرض المناسب، شاهد التوفير والوقت المتبقي، ثم افتح الكوبون للاستفادة منه.</p></div></div>
        </section>

        {publishedOffersQuery.isLoading ? <section className="mt-6 rounded-3xl bg-white p-12 text-center shadow-sm"><Gift className="mx-auto h-12 w-12 animate-pulse text-orange-300" /><p className="mt-4 font-black text-slate-600">جارٍ تحميل العروض...</p></section> : activeOffers.length === 0 ? <section className="mt-6 rounded-3xl border border-dashed border-orange-200 bg-white p-12 text-center shadow-sm"><Gift className="mx-auto h-12 w-12 text-orange-300" /><h2 className="mt-4 text-xl font-black">لا توجد عروض مفعّلة الآن</h2><p className="mt-2 text-sm text-slate-500">ارجع لاحقًا، فالعروض الجديدة تظهر هنا فور تفعيلها من إدارة العروض.</p><a href={catalogBackUrl} className="mt-6 inline-flex"><Button className="bg-orange-600 hover:bg-orange-700">تسوق من الكتالوج</Button></a></section> : <section className="mt-6 grid min-w-0 gap-5 md:grid-cols-2">{activeOffers.map(offer => {
          const expiry = getOfferExpiryInfo(offer, now);
          const originalPrice = Number(offer.originalTotalRetail) || 0;
          const offerPrice = Number(offer.offerPrice) || 0;
          return <article key={offer.id} className="min-w-0 overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-orange-100"><div className="bg-gradient-to-l from-slate-950 to-orange-700 p-5 text-white"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] font-black"><Tag className="h-3.5 w-3.5 shrink-0" />خصم خاص</span><h2 className="mt-3 break-words text-xl font-black">{offer.title || offer.strategyName || "عرض أبو رغوة"}</h2></div><span className="shrink-0 rounded-2xl bg-orange-400 px-3 py-2 text-center text-xs font-black text-orange-950">وفر {Number(offer.discountPercent || 0).toFixed(0)}%</span></div><div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-xl bg-red-500/25 px-3 py-2 text-sm font-black"><Clock3 className="h-4 w-4 shrink-0 text-amber-200" /><span className="min-w-0 break-words">متبقي {formatOfferTimeRemaining(expiry)}</span></div></div><div className="min-w-0 p-5"><p className="min-h-12 break-words text-sm leading-6 text-slate-600">{offer.description || "استفد من السعر الخاص لفترة محدودة."}</p>{offer.items?.length ? <p className="mt-3 break-words text-xs font-bold text-slate-500">يشمل: {offer.items.map(item => item.name).filter(Boolean).join(" · ")}</p> : null}<div className="mt-5 flex min-w-0 items-end justify-between gap-3"><div className="min-w-0"><p className="text-xs text-slate-400">سعر العرض</p><p className="text-3xl font-black text-orange-600">{offerPrice} <span className="text-sm">ج.م</span></p>{originalPrice > offerPrice && <p className="mt-1 text-sm font-bold text-slate-400 line-through">بدلًا من {originalPrice} ج.م</p>}</div><a className="shrink-0" href={`/public-offer?id=${encodeURIComponent(offer.id)}`}><Button className="bg-slate-950 hover:bg-orange-600">افتح الكوبون</Button></a></div></div></article>;
        })}</section>}
      </div>
    </main>
  );
}
