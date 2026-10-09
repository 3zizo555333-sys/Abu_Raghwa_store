import { useEffect, useMemo, useState } from "react";
import { Maximize, MonitorPlay, RefreshCw, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestCloudStateRefresh, useCloudState } from "@/lib/cloudSync";
import { DEFAULT_DISPLAY_SETTINGS, normalizeDisplaySettings } from "@/lib/displaySettings";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

type DisplayProduct = { id: string; name: string; category?: string; retailPrice?: number; wholesaleRetailPrice?: number; bulkPrice?: number; catalogImageUrl?: string; imageUrl?: string; catalogVisible?: boolean };
type DisplayOffer = { id?: string; title?: string; name?: string; description?: string; imageUrl?: string; isActivated?: boolean; active?: boolean; price?: number; salePrice?: number };
const priceOf = (product: DisplayProduct) => Number(product.wholesaleRetailPrice) || Number(product.retailPrice) || Number(product.bulkPrice) || 0;

export default function CustomerDisplay() {
  const [displaySettingsData] = useCloudState("abu_raghwa_display_settings", DEFAULT_DISPLAY_SETTINGS);
  const displaySettings = normalizeDisplaySettings(displaySettingsData);
  const [products] = useCloudState<DisplayProduct[]>("abu_raghwa_products", []);
  const [offers] = useCloudState<DisplayOffer[]>("abu_raghwa_global_offers", []);
  const [slide, setSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel("customer-display-live-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => requestCloudStateRefresh("abu_raghwa_products"))
      .on("postgres_changes", { event: "*", schema: "public", table: "offers" }, () => requestCloudStateRefresh("abu_raghwa_global_offers"))
      .subscribe(status => setRealtimeConnected(status === "SUBSCRIBED"));
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const visibleProducts = useMemo(() => (Array.isArray(products) ? products : []).filter(product => product && product.name && product.catalogVisible !== false && priceOf(product) > 0 && (!displaySettings.selectedProductIds.length || displaySettings.selectedProductIds.includes(String(product.id)))).slice(0, 24), [displaySettings.selectedProductIds, products]);
  const visibleOffers = useMemo(() => (Array.isArray(offers) ? offers : []).filter(offer => offer && (offer.isActivated !== false || offer.active === true) && (!displaySettings.selectedOfferIds.length || displaySettings.selectedOfferIds.includes(String(offer.id)))), [displaySettings.selectedOfferIds, offers]);
  const slides = useMemo(() => {
    const pages: Array<{ kind: "products" | "offers"; items: Array<DisplayProduct | DisplayOffer> }> = [];
    if (displaySettings.showProducts) for (let index = 0; index < visibleProducts.length; index += 6) pages.push({ kind: "products", items: visibleProducts.slice(index, index + 6) });
    if (displaySettings.showOffers && visibleOffers.length) pages.unshift({ kind: "offers", items: visibleOffers.slice(0, 4) });
    return pages.length ? pages : [{ kind: "products" as const, items: [] }];
  }, [displaySettings.showOffers, displaySettings.showProducts, visibleOffers, visibleProducts]);

  useEffect(() => {
    const timer = window.setInterval(() => setSlide(current => (current + 1) % slides.length), displaySettings.rotationSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [displaySettings.rotationSeconds, slides.length]);
  useEffect(() => setSlide(current => Math.min(current, Math.max(0, slides.length - 1))), [slides.length]);
  const enterFullscreen = async () => { try { await document.documentElement.requestFullscreen?.(); setIsFullscreen(true); } catch { setIsFullscreen(false); } };
  const current = slides[slide];
  const background = displaySettings.theme === "light" ? "bg-slate-100 text-slate-900" : displaySettings.theme === "dark" ? "bg-slate-950 text-white" : "bg-gradient-to-br from-slate-950 via-orange-950 to-slate-900 text-white";
  const mutedText = displaySettings.theme === "light" ? "text-slate-600" : "text-white/60";
  const cardClass = displaySettings.cardStyle === "solid" ? "bg-white text-slate-900 shadow-xl" : displaySettings.cardStyle === "soft" ? "bg-white/80 text-slate-900 shadow-lg" : "bg-white/10 shadow-xl backdrop-blur";
  const priceClass = displaySettings.theme === "light" || displaySettings.cardStyle !== "glass" ? "text-slate-900" : "text-amber-300";

  return <main dir="rtl" className={`min-h-screen overflow-hidden p-5 ${background}`}>
    <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 border-b border-current/15 pb-5">
      <div className="flex items-center gap-3"><div className="grid h-14 w-14 place-items-center rounded-2xl shadow-lg" style={{ backgroundColor: displaySettings.primaryColor }}><MonitorPlay className="h-7 w-7 text-white" /></div><div><p className="text-sm font-bold" style={{ color: displaySettings.primaryColor }}>{displaySettings.shopName}</p><h1 className="text-2xl font-black sm:text-4xl">{displaySettings.title}</h1><p className={`text-sm ${mutedText}`}>{displaySettings.subtitle}</p></div></div>
      <div className="flex items-center gap-2"><span className={`hidden text-xs sm:inline ${realtimeConnected ? "text-emerald-300" : mutedText}`}>{realtimeConnected ? "مباشر" : "مزامنة تلقائية"}</span><Button variant="outline" onClick={() => { requestCloudStateRefresh("abu_raghwa_products"); requestCloudStateRefresh("abu_raghwa_global_offers"); }} className="border-current/25 bg-white/10 hover:bg-white/20"><RefreshCw className="ml-2 h-4 w-4" />تحديث</Button><Button onClick={enterFullscreen} className="text-white hover:opacity-90" style={{ backgroundColor: displaySettings.primaryColor }}><Maximize className="ml-2 h-4 w-4" />{isFullscreen ? "عرض كامل" : "ملء الشاشة"}</Button></div>
    </header>
    <div key={`${current.kind}-${slide}`} className="animate-in fade-in slide-in-from-left-4 duration-700 motion-reduce:animate-none">
      {current.kind === "offers" ? <section className="mx-auto mt-8 max-w-7xl"><div className="mb-6 flex items-center gap-3"><Tag className="h-8 w-8" style={{ color: displaySettings.primaryColor }} /><h2 className="text-3xl font-black sm:text-5xl">عروض مميزة</h2></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{current.items.map((item, index) => { const offer = item as DisplayOffer; return <article key={offer.id || `${offer.title}-${index}`} className={`overflow-hidden rounded-3xl border border-current/10 ${cardClass}`}><div className="h-44" style={{ backgroundColor: displaySettings.primaryColor }}>{offer.imageUrl && <img src={offer.imageUrl} alt="" className="h-full w-full object-cover" />}</div><div className="p-5"><h3 className="text-2xl font-black">{offer.title || offer.name || "عرض مميز"}</h3><p className={`mt-2 line-clamp-3 text-sm ${mutedText}`}>{offer.description || "اسألنا عن تفاصيل العرض والتوفر."}</p>{displaySettings.showPrices && (offer.salePrice || offer.price) && <p className={`mt-4 text-2xl font-black ${priceClass}`} style={{ color: displaySettings.accentColor }}>{offer.salePrice || offer.price} ج.م</p>}</div></article>; })}</div></section> : <section className="mx-auto mt-8 max-w-7xl"><div className="mb-6 flex items-end justify-between"><div><p className="text-lg font-bold" style={{ color: displaySettings.primaryColor }}>{displaySettings.subtitle}</p><h2 className="text-3xl font-black sm:text-5xl">منتجات متاحة الآن</h2></div><p className={`text-sm ${mutedText}`}>تتحدث الأسعار تلقائيًا</p></div>{current.items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{current.items.map((item, index) => { const product = item as DisplayProduct; return <article key={product.id || index} className={`flex min-h-56 overflow-hidden rounded-3xl border border-current/10 ${cardClass}`}><div className="w-2/5" style={{ backgroundColor: `${displaySettings.primaryColor}55` }}>{(product.imageUrl || product.catalogImageUrl) && <img src={product.imageUrl || product.catalogImageUrl} alt="" className="h-full w-full object-cover" />}</div><div className="flex flex-1 flex-col justify-center p-5"><p className={`text-sm font-bold ${mutedText}`}>{product.category || "منتج مميز"}</p><h3 className="mt-2 text-2xl font-black">{product.name}</h3>{displaySettings.showPrices && <p className={`mt-4 text-3xl font-black ${priceClass}`} style={{ color: displaySettings.accentColor }}>{priceOf(product).toLocaleString("ar-EG")} <span className="text-base">ج.م</span></p>}</div></article>; })}</div> : <div className={`rounded-3xl border border-current/10 p-16 text-center text-xl ${mutedText}`}>أضف منتجات بأسعارها لتظهر هنا على الشاشة.</div>}</section>}
    </div>
    <footer className={`mx-auto mt-10 flex max-w-7xl items-center justify-between text-sm ${mutedText}`}><span>{displaySettings.shopPhone ? `للطلب والاستفسار: ${displaySettings.shopPhone}` : ""}</span><span>صفحة {slide + 1} من {slides.length}</span></footer>
  </main>;
}
