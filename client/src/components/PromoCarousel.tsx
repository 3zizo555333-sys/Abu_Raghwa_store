import { useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Gift, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CloudStoreOffer } from "@/lib/supabase/storeOffers";
import { getTrustedCatalogImageUrl } from "@/lib/catalog";

type PromoItem = { imageUrl?: string; image_url?: string; name?: string };
type PromoOfferData = { title?: string; description?: string; discountAmount?: number; discountPercent?: number; loyaltyPoints?: number; imageUrl?: string; image_url?: string; bannerImageUrl?: string; banner_image_url?: string; items?: PromoItem[] };
type PromoCarouselProps = { offers: CloudStoreOffer[] };

function getOfferData(offer: CloudStoreOffer): PromoOfferData {
  return (offer.offer_data && typeof offer.offer_data === "object" ? offer.offer_data : {}) as PromoOfferData;
}

function getOfferImages(data: PromoOfferData) {
  const itemImages = (Array.isArray(data.items) ? data.items : [])
    .map(item => getTrustedCatalogImageUrl(item.imageUrl || item.image_url || ""))
    .filter(Boolean)
    .slice(0, 3);
  const bannerImage = getTrustedCatalogImageUrl(data.bannerImageUrl || data.banner_image_url || data.imageUrl || data.image_url || "");
  return { bannerImage, itemImages };
}

function dateValue(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isRenderableOffer(offer: CloudStoreOffer) {
  const data = getOfferData(offer);
  const title = String(offer.banner_title || data.title || offer.title || "").trim();
  const description = String(offer.public_description || data.description || "").trim();
  const offerPrice = Number(offer.offer_price ?? 0);
  const now = Date.now();
  const startsAt = dateValue(offer.starts_at);
  const endsAt = dateValue(offer.ends_at);
  return Boolean(offer.id && title && (description || offerPrice > 0) && Number.isFinite(offerPrice) && offerPrice > 0
    && (!startsAt || startsAt <= now) && (!endsAt || endsAt > now));
}

export function PromoCarousel({ offers }: PromoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const visibleOffers = useMemo(() => offers.filter(offer => offer.status === "active" && !offer.deleted_at && isRenderableOffer(offer)), [offers]);

  useEffect(() => {
    if (activeIndex >= visibleOffers.length) setActiveIndex(0);
  }, [activeIndex, visibleOffers.length]);
  useEffect(() => {
    if (visibleOffers.length < 2 || isPaused) return;
    const timer = window.setInterval(() => setActiveIndex(index => (index + 1) % visibleOffers.length), 2000);
    return () => window.clearInterval(timer);
  }, [isPaused, visibleOffers.length]);

  if (!visibleOffers.length) return null;
  const move = (direction: -1 | 1) => setActiveIndex(index => (index + direction + visibleOffers.length) % visibleOffers.length);
  const onTouchStart = (event: TouchEvent) => { setIsPaused(true); touchStartX.current = event.touches[0]?.clientX ?? null; };
  const onTouchEnd = (event: TouchEvent) => {
    if (touchStartX.current != null) {
      const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
      if (Math.abs(delta) > 40) move(delta > 0 ? -1 : 1);
    }
    touchStartX.current = null;
    setIsPaused(false);
  };

  return <section aria-label="العروض النشطة" className="w-full px-3 py-3 sm:px-5 sm:py-4" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
    <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border-2 border-amber-500 bg-[#0c0907] p-1 shadow-[0_12px_36px_rgba(245,158,11,.24)]">
      <div className="relative overflow-hidden rounded-[1.35rem] bg-[radial-gradient(circle_at_top_left,#2b1404_0%,#0c0907_60%,#000_100%)]" style={{ touchAction: "pan-y" }}>
        <div dir="ltr" className="flex w-full transition-transform duration-500 ease-out" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
          {visibleOffers.map((offer, index) => {
            const data = getOfferData(offer);
            const { bannerImage, itemImages } = getOfferImages(data);
            const savings = Number(data.discountAmount || 0);
            const discount = Number(data.discountPercent || 0);
            const points = Number(data.loyaltyPoints || 0);
            const title = offer.banner_title || data.title || offer.title;
            const description = offer.public_description || data.description || "وفّر أكثر مع عروضنا المختارة لفترة محدودة.";
            return <article dir="rtl" key={offer.id} aria-hidden={index !== activeIndex} className="relative min-w-full flex-[0_0_100%] h-[176px] overflow-hidden bg-[radial-gradient(circle_at_top_left,#2b1404_0%,#0c0907_60%,#000_100%)] px-4 py-4 text-white sm:h-[190px] sm:px-8 sm:py-5">
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true"><span className="foam-bubble foam-bubble-a" /><span className="foam-bubble foam-bubble-b" /><span className="foam-bubble foam-bubble-c" /><span className="foam-bubble foam-bubble-d" /></div>
              <div className="relative z-10 flex h-full items-center gap-2 sm:gap-6">
                <div className="min-w-0 flex-1 sm:max-w-[58%]"><span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-black/35 px-2.5 py-1 text-[10px] font-black text-amber-100"><Sparkles className="h-3 w-3 text-amber-300" /> عروض أبو رغوة الحالية</span><h2 className="mt-2 line-clamp-1 text-xl font-black leading-tight text-white sm:text-3xl">{title}</h2><p className="mt-1 line-clamp-2 text-xs leading-5 text-amber-50 sm:text-sm">{description}</p><div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-black sm:mt-3 sm:gap-2 sm:text-xs">{savings > 0 && <span className="rounded-lg bg-white/10 px-2 py-1.5">وفّر {savings.toLocaleString("ar-EG")} ج.م</span>}{discount > 0 && <span className="rounded-lg bg-amber-400 px-2 py-1.5 text-amber-950">وفر {discount}%</span>}{points > 0 && <span className="rounded-lg bg-purple-300 px-2 py-1.5 text-purple-950"><Gift className="ml-1 inline h-3 w-3" />+{points}</span>}<Button type="button" size="sm" onClick={() => window.location.assign(`/public-offer?id=${encodeURIComponent(offer.id)}`)} className="h-8 rounded-lg bg-amber-400 px-3 text-xs font-black text-amber-950 hover:bg-amber-300">اطلب دلوقتي</Button></div></div>
                <div className="relative flex h-full w-[34%] shrink-0 items-center justify-center sm:w-[36%]">{bannerImage ? <img src={bannerImage} alt="" onError={event => { event.currentTarget.style.display = "none"; }} className="max-h-[150px] max-w-full object-contain drop-shadow-[0_12px_10px_rgba(0,0,0,.35)]" /> : itemImages.length ? <div className="flex items-end justify-center gap-0.5 sm:gap-2">{itemImages.map((image, imageIndex) => <img key={`${offer.id}-${imageIndex}`} src={image} alt="" onError={event => { event.currentTarget.style.display = "none"; }} className="h-20 w-16 object-contain drop-shadow-[0_10px_8px_rgba(0,0,0,.35)] sm:h-32 sm:w-24" />)}</div> : <Gift className="h-16 w-16 text-amber-200/70" />}</div>
              </div>
            </article>;
          })}
        </div>
        {visibleOffers.length > 1 && <><button type="button" aria-label="العرض السابق" onClick={() => move(-1)} className="absolute right-2 top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-white hover:bg-black/40"><ChevronRight className="h-4 w-4" /></button><button type="button" aria-label="العرض التالي" onClick={() => move(1)} className="absolute left-2 top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-white hover:bg-black/40"><ChevronLeft className="h-4 w-4" /></button><div className="absolute bottom-2 left-0 right-0 z-20 flex justify-center gap-1.5">{visibleOffers.map((item, index) => <button type="button" key={item.id} aria-label={`العرض ${index + 1}`} onClick={() => setActiveIndex(index)} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? "w-6 bg-white" : "w-1.5 bg-white/50"}`} />)}</div></>}
      </div>
    </div>
  </section>;
}
