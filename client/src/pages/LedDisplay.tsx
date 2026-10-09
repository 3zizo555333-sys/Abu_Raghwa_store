import { useEffect, useMemo, useState } from "react";
import { Maximize, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestCloudStateRefresh, useCloudState } from "@/lib/cloudSync";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

type LedOffer = { id?: string; title?: string; name?: string; description?: string; price?: number; salePrice?: number; isActivated?: boolean; active?: boolean; startDate?: string; endDate?: string };

export default function LedDisplay() {
  const [offers] = useCloudState<LedOffer[]>("abu_raghwa_global_offers", []);
  const [connected, setConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseClient();
    const channel = supabase.channel("led-display-live-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "offers" }, () => requestCloudStateRefresh("abu_raghwa_global_offers"))
      .subscribe(status => setConnected(status === "SUBSCRIBED"));
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const activeOffers = useMemo(() => (Array.isArray(offers) ? offers : []).filter(offer => {
    if (!offer || (offer.isActivated === false && offer.active !== true)) return false;
    if (offer.startDate && offer.startDate.slice(0, 10) > today) return false;
    if (offer.endDate && offer.endDate.slice(0, 10) < today) return false;
    return Boolean(offer.title || offer.name || offer.description);
  }), [offers, today]);
  const messages = activeOffers.length ? activeOffers.map(offer => `${offer.title || offer.name || "عرض اليوم"}${offer.description ? ` — ${offer.description}` : ""}${offer.salePrice || offer.price ? ` — ${offer.salePrice || offer.price} ج.م` : ""}`) : ["تابعوا عروض أبو رغوة اليومية — اسأل الكاشير عن أحدث الأسعار"];
  const marqueeText = messages.join("　 •　");
  const enterFullscreen = async () => { try { await document.documentElement.requestFullscreen?.(); setIsFullscreen(true); } catch { setIsFullscreen(false); } };

  return <main dir="rtl" className="min-h-screen overflow-hidden bg-black text-red-500">
    <style>{`@keyframes abu-led-marquee { from { transform: translateX(100%); } to { transform: translateX(-100%); } } .abu-led-track { animation: abu-led-marquee ${Math.max(18, messages.join(" ").length * 0.32)}s linear infinite; } @media (prefers-reduced-motion: reduce) { .abu-led-track { animation-play-state: paused; transform: none; } }`}</style>
    <header className="flex items-center justify-between border-b border-red-900/60 px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-[0.35em] text-red-700">ABU RAGHWA LED</p><h1 className="text-2xl font-black sm:text-4xl">عروض اليوم</h1></div><div className="flex items-center gap-2"><span className="hidden items-center gap-1 text-xs text-red-700 sm:flex">{connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{connected ? "مباشر" : "مزامنة تلقائية"}</span><Button size="icon" variant="outline" onClick={() => requestCloudStateRefresh("abu_raghwa_global_offers")} className="border-red-900 bg-black text-red-500 hover:bg-red-950" aria-label="تحديث العروض"><RefreshCw className="h-4 w-4" /></Button><Button size="icon" onClick={enterFullscreen} className="bg-red-700 text-black hover:bg-red-600" aria-label="ملء الشاشة"><Maximize className="h-4 w-4" /></Button></div></header>
    <section className="flex min-h-[calc(100vh-82px)] flex-col justify-center gap-10 py-12"><div className="overflow-hidden whitespace-nowrap border-y-4 border-red-700/80 py-8 shadow-[0_0_40px_rgba(220,38,38,0.25)]"><div className="abu-led-track inline-block min-w-full text-center text-4xl font-black leading-tight tracking-wide sm:text-6xl lg:text-8xl">{marqueeText}</div></div><div className="text-center text-lg font-bold text-red-800 sm:text-2xl">{activeOffers.length ? `${activeOffers.length} عرض نشط` : "سيتم تحديث العروض تلقائياً"}</div></section>
  </main>;
}
