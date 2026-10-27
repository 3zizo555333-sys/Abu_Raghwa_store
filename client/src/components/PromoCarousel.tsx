import { useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CloudStoreOffer } from "@/lib/supabase/storeOffers";
import { getTrustedCatalogImageUrl } from "@/lib/catalog";

type PromoOfferData = {
  title?: string;
  description?: string;
  promoText?: string;
  discountAmount?: number;
  discountPercent?: number;
  savingsAmount?: number;
  savings_amount?: number;
  discount_percent?: number;
  imageUrl?: string;
  image_url?: string;
  bannerImageUrl?: string;
  banner_image_url?: string;
  bannerCustomImage?: string;
  banner_custom_image?: string;
  bgColor?: string;
  bg_color?: string;
  bgGradient?: string;
  bg_gradient?: string;
  backgroundMode?: "solid" | "gradient";
  items?: Array<{ imageUrl?: string; image_url?: string }>;
};
type PromoCarouselProps = { offers: CloudStoreOffer[] };

function getOfferData(offer: CloudStoreOffer): PromoOfferData {
  return (offer.offer_data && typeof offer.offer_data === "object" ? offer.offer_data : {}) as PromoOfferData;
}

function dateValue(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isRenderableOffer(offer: CloudStoreOffer) {
  const data = getOfferData(offer);
  const title = String(offer.title || data.title || offer.banner_title || "").trim();
  const description = String(offer.promo_text || offer.description || offer.public_description || data.promoText || data.description || "").trim();
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

  return <section aria-label="العروض النشطة" className="w-full overflow-hidden px-0 py-2 sm:py-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
    <div className="relative mx-0 w-full max-w-none overflow-hidden rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,.14)]">
      <div className="relative aspect-[2.4/1] min-h-[104px] max-h-[145px] overflow-hidden rounded-2xl sm:max-h-[240px]" style={{ touchAction: "pan-y" }}>
        <div dir="ltr" className="flex h-full w-full min-w-0 overflow-hidden transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
          {visibleOffers.map((offer, index) => {
            const data = getOfferData(offer);
            const title = String(offer.title || data.title || offer.banner_title || "");
            const description = String(offer.promo_text || offer.description || offer.public_description || data.promoText || data.description || "").trim();
            const originalPrice = Number(offer.original_price || 0);
            const offerPrice = Number(offer.offer_price || 0);
            const savings = Number(data.savings_amount ?? data.savingsAmount ?? data.discountAmount ?? Math.max(0, originalPrice - offerPrice));
            const discount = Number(data.discount_percent ?? data.discountPercent ?? (originalPrice > 0 ? Math.round((Math.max(0, originalPrice - offerPrice) / originalPrice) * 100) : 0));
            const bgColor = offer.bg_color || data.bg_color || data.bgColor || "#0c0907";
            const configuredGradient = offer.bg_gradient || data.bg_gradient || data.bgGradient;
            const backgroundMode = data.backgroundMode || (configuredGradient ? "gradient" : "solid");
            const bgGradient = backgroundMode === "solid" ? undefined : configuredGradient;
            const storedImageUrl = String(offer.image_url || data.image_url || data.imageUrl || data.bannerImageUrl || data.banner_image_url || "");
            const legacyAiScene = storedImageUrl.includes("/ai-banner-");
            const backgroundImageUrl = getTrustedCatalogImageUrl(offer.banner_custom_image || data.bannerCustomImage || data.banner_custom_image || (legacyAiScene ? storedImageUrl : ""));
            const itemProductImage = data.items?.find(item => item.imageUrl || item.image_url);
            const productImage = getTrustedCatalogImageUrl(legacyAiScene ? (itemProductImage?.imageUrl || itemProductImage?.image_url || "") : storedImageUrl);
            const offerKey = offer.id.replace(/[^a-zA-Z0-9_-]/g, "");
            const foamGradientId = `offer-foam-${offerKey}`;
            const backgroundImage = backgroundImageUrl
              ? `linear-gradient(90deg, rgba(15,23,42,.28), rgba(15,23,42,.08)), url("${backgroundImageUrl}")`
              : bgGradient;

            return <article
              dir="rtl"
              key={offer.id}
              aria-hidden={index !== activeIndex}
              role="button"
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => window.location.assign(`/public-offer?id=${encodeURIComponent(offer.id)}`)}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") window.location.assign(`/public-offer?id=${encodeURIComponent(offer.id)}`); }}
              className="relative isolate box-border flex h-full w-full min-w-0 max-w-full flex-[0_0_100%] items-center overflow-hidden px-3 py-2 text-white sm:px-5"
            >
              <div className="absolute inset-0 z-0" aria-hidden="true" style={{ backgroundColor: bgColor, backgroundImage, backgroundSize: backgroundImageUrl ? "cover" : undefined, backgroundPosition: "center" }} />
              <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
                <span className="foam-bubble foam-bubble-a" />
                <span className="foam-bubble foam-bubble-b" />
                <span className="foam-bubble foam-bubble-c" />
                <span className="foam-bubble foam-bubble-d" />
              </div>
              <div dir="rtl" className="relative z-20 flex h-full min-h-0 w-full items-center gap-2 sm:gap-4">
                <div className="relative z-50 flex min-w-0 flex-1 flex-col items-start justify-center text-right">
                  <h2 className="line-clamp-1 text-sm font-black leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] sm:text-lg">{title}</h2>
                  {description && <p className="mt-0.5 line-clamp-1 text-[10px] leading-4 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.75)] sm:text-xs">{description}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px] font-black sm:text-[10px]">
                    {discount > 0 && <span className="rounded-full border border-white/20 bg-amber-300 px-2 py-0.5 text-amber-950 shadow-sm">وفر {discount}%</span>}
                    {savings > 0 && <span className="rounded-full border border-white/20 bg-emerald-300 px-2 py-0.5 text-emerald-950 shadow-sm">وفر {savings.toLocaleString("ar-EG")} ج.م</span>}
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  aria-label={title}
                  title={title}
                  onClick={event => { event.stopPropagation(); window.location.assign(`/public-offer?id=${encodeURIComponent(offer.id)}`); }}
                  className="relative z-50 mt-1 h-7 w-8 shrink-0 self-start rounded-full bg-white text-slate-900 shadow-md hover:bg-white/90"
                ><ChevronLeft className="h-4 w-4" /></Button>
                <div dir="ltr" className="relative flex h-full w-[104px] shrink-0 items-end justify-center sm:w-[160px]">
                  <div aria-hidden="true" className="absolute bottom-[9px] left-1/2 z-10 h-2 w-16 -translate-x-1/2 rounded-[50%] bg-black/20 blur-[2px]" style={{ boxShadow: "0 16px 20px -2px rgba(0, 0, 0, 0.45)" }} />
                  {productImage ? <img
                    src={productImage}
                    alt=""
                    onError={event => { event.currentTarget.style.display = "none"; }}
                    className="relative z-20 h-[116px] max-h-full w-auto max-w-full object-contain sm:h-[180px]"
                    style={{ filter: "contrast(1.06) saturate(1.1) drop-shadow(0 10px 15px rgba(0,0,0,0.3))" }}
                  /> : <Gift className="relative z-20 mb-2 h-9 w-9 text-white/80 drop-shadow-md" />}
                  <svg className="pointer-events-none absolute bottom-0 left-1/2 z-30 h-6 w-[112px] -translate-x-1/2 sm:w-[140px]" viewBox="0 0 140 30" fill="none" aria-hidden="true">
                    <defs>
                      <linearGradient id={foamGradientId} x1="70" y1="0" x2="70" y2="30" gradientUnits="userSpaceOnUse">
                        <stop stopColor="white" stopOpacity=".94" />
                        <stop offset="1" stopColor="#dffbff" stopOpacity=".82" />
                      </linearGradient>
                    </defs>
                    <path d="M0 28c5-7 10-7 15-2 2-10 12-13 19-5 4-13 17-16 25-5 4-8 14-10 20-2 7-12 20-10 24 0 8-8 20-4 21 5 8-7 16-1 16 9H0Z" fill={`url(#${foamGradientId})`} stroke="white" strokeOpacity=".82" strokeWidth="1.2" />
                    <circle cx="24" cy="20" r="5" fill="white" fillOpacity=".72" />
                    <circle cx="50" cy="18" r="4" fill="white" fillOpacity=".7" />
                    <circle cx="93" cy="19" r="5" fill="white" fillOpacity=".68" />
                    <circle cx="119" cy="21" r="3.5" fill="white" fillOpacity=".78" />
                  </svg>
                  <span className="foam-bubble absolute left-1 top-[22%] z-40 h-5 w-5" style={{ width: 22, height: 22 }} />
                  <span className="foam-bubble absolute right-1 top-[44%] z-40 h-6 w-6" style={{ width: 27, height: 27, animationDelay: "-2.5s" }} />
                </div>
              </div>
            </article>;
          })}
        </div>
        {visibleOffers.length > 1 && <>
          <button type="button" aria-label="العرض السابق" onClick={() => move(-1)} className="absolute right-1 top-1/2 z-50 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full sm:grid bg-black/25 text-white hover:bg-black/40"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" aria-label="العرض التالي" onClick={() => move(1)} className="absolute left-1 top-1/2 z-50 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full sm:grid bg-black/25 text-white hover:bg-black/40"><ChevronLeft className="h-4 w-4" /></button>
          <div className="absolute bottom-1 left-0 right-0 z-50 flex justify-center gap-1.5">{visibleOffers.map((item, index) => <button type="button" key={item.id} aria-label={`العرض ${index + 1}`} onClick={() => setActiveIndex(index)} className={`h-1 rounded-full transition-all motion-reduce:transition-none ${index === activeIndex ? "w-5 bg-white" : "w-1 bg-white/50"}`} />)}</div>
        </>}
      </div>
    </div>
  </section>;
}
