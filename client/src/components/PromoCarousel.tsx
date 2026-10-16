import { useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Gift, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CloudStoreOffer } from "@/lib/supabase/storeOffers";

type PromoOfferData = { title?: string; description?: string; offerPrice?: number; originalTotalRetail?: number; discountAmount?: number; discountPercent?: number; loyaltyPoints?: number };

type PromoCarouselProps = { offers: CloudStoreOffer[] };

function getOfferData(offer: CloudStoreOffer): PromoOfferData {
  return (offer.offer_data && typeof offer.offer_data === "object" ? offer.offer_data : {}) as PromoOfferData;
}

export function PromoCarousel({ offers }: PromoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const visibleOffers = useMemo(() => offers.filter(offer => offer.status === "active" && !offer.deleted_at), [offers]);

  useEffect(() => {
    if (activeIndex >= visibleOffers.length) setActiveIndex(0);
  }, [activeIndex, visibleOffers.length]);

  useEffect(() => {
    if (visibleOffers.length < 2) return;
    const timer = window.setInterval(() => setActiveIndex(index => (index + 1) % visibleOffers.length), 4000);
    return () => window.clearInterval(timer);
  }, [visibleOffers.length]);

  if (!visibleOffers.length) return null;
  const offer = visibleOffers[activeIndex] || visibleOffers[0];
  const data = getOfferData(offer);
  const savings = Number(data.discountAmount || 0);
  const discount = Number(data.discountPercent || 0);
  const points = Number(data.loyaltyPoints || 0);
  const goToOffer = () => { window.location.assign(`/public-offer?id=${encodeURIComponent(offer.id)}`); };
  const move = (direction: -1 | 1) => setActiveIndex(index => (index + direction + visibleOffers.length) % visibleOffers.length);
  const onTouchStart = (event: TouchEvent) => { touchStartX.current = event.touches[0]?.clientX ?? null; };
  const onTouchEnd = (event: TouchEvent) => {
    if (touchStartX.current == null) return;
    const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) > 40) move(delta > 0 ? -1 : 1);
  };

  return <section aria-label="العروض النشطة" className="mx-auto max-w-7xl px-4 pt-5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-l from-orange-600 via-amber-500 to-yellow-300 p-1 shadow-xl">
      <div className="relative min-h-[190px] overflow-hidden rounded-[1.8rem] bg-gradient-to-l from-slate-950/95 via-orange-950/90 to-orange-700/75 px-5 py-6 text-white sm:min-h-[220px] sm:px-9 sm:py-8">
        <div className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full bg-yellow-300/20 blur-2xl" />
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] font-black text-amber-100"><Sparkles className="h-3.5 w-3.5" /> عروض أبو رغوة الحالية</span>
          <h2 className="mt-3 text-2xl font-black leading-tight sm:text-3xl">{offer.banner_title || data.title || offer.title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-orange-50">{offer.public_description || data.description || "وفّر أكثر مع عروضنا المختارة لفترة محدودة."}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-black">
            {savings > 0 && <span className="rounded-xl bg-white/15 px-3 py-2">وفّر {savings.toLocaleString("ar-EG")} ج.م</span>}
            {discount > 0 && <span className="rounded-xl bg-green-400/90 px-3 py-2 text-green-950">خصم {discount}%</span>}
            {points > 0 && <span className="rounded-xl bg-purple-300/90 px-3 py-2 text-purple-950"><Gift className="ml-1 inline h-3.5 w-3.5" /> +{points} نقطة</span>}
            <Button type="button" size="sm" onClick={goToOffer} className="rounded-xl bg-white px-4 font-black text-orange-700 hover:bg-orange-50">تفاصيل العرض</Button>
          </div>
        </div>
        {visibleOffers.length > 1 && <><button type="button" aria-label="العرض السابق" onClick={() => move(-1)} className="absolute right-3 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/20 text-white hover:bg-black/35"><ChevronRight className="h-5 w-5" /></button><button type="button" aria-label="العرض التالي" onClick={() => move(1)} className="absolute left-3 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/20 text-white hover:bg-black/35"><ChevronLeft className="h-5 w-5" /></button></>}
        {visibleOffers.length > 1 && <div className="absolute bottom-3 left-0 right-0 z-20 flex justify-center gap-1.5">{visibleOffers.map((item, index) => <button type="button" key={item.id} aria-label={`العرض ${index + 1}`} onClick={() => setActiveIndex(index)} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? "w-7 bg-white" : "w-1.5 bg-white/50"}`} />)}</div>}
      </div>
    </div>
  </section>;
}
