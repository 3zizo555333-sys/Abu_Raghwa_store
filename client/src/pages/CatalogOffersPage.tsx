import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, Gift, Share2, Sparkles, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatOfferTimeRemaining, getOfferExpiryInfo } from "@/lib/offerExpiry";
import { listActiveStoreOffers, type CloudStoreOffer } from "@/lib/supabase/storeOffers";
import { trpc } from "@/lib/trpc";

type CatalogOffer = { id: string; title: string; description: string; offerPrice: number; originalPrice: number; discountPercent: number; loyaltyPoints: number; items: Array<{ name: string }>; startAt?: number; endAt?: number };

function mapOffer(row: CloudStoreOffer): CatalogOffer {
  const data = row.offer_data && typeof row.offer_data === "object" && !Array.isArray(row.offer_data) ? row.offer_data as Record<string, unknown> : {};
  const originalPrice = Number(data.originalTotalRetail ?? row.original_price ?? 0) || 0;
  const offerPrice = Number(data.offerPrice ?? row.offer_price ?? 0) || 0;
  const saving = Math.max(0, originalPrice - offerPrice);
  return { id: row.id, title: row.title || String(data.title || "عرض أبو رغوة"), description: String(data.description || row.public_description || row.description || "استفد من السعر الخاص لفترة محدودة."), offerPrice, originalPrice, discountPercent: Number(data.discountPercent ?? (originalPrice > 0 ? saving / originalPrice * 100 : 0)) || 0, loyaltyPoints: Number(data.loyaltyPoints ?? row.points_reward ?? 0) || 0, items: Array.isArray(data.items) ? data.items as Array<{ name: string }> : [], startAt: row.starts_at ? Date.parse(row.starts_at) : Number(data.startAt || 0) || undefined, endAt: row.ends_at ? Date.parse(row.ends_at) : Number(data.endAt || 0) || undefined };
}

export default function CatalogOffersPage() {
  const [offers, setOffers] = useState<CatalogOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [selectedOffer, setSelectedOffer] = useState<CatalogOffer | null>(null);
  const [customer, setCustomer] = useState({ name: "", phone: "", note: "" });
  const [submitted, setSubmitted] = useState(false);
  const registerCustomer = trpc.catalog.registerOfferCustomer.useMutation();
  const createPurchase = trpc.catalog.createOfferPurchaseRequest.useMutation();

  const loadOffers = async () => {
    setLoading(true); setLoadError("");
    try { setOffers((await listActiveStoreOffers()).map(mapOffer)); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "تعذر جلب العروض من السحابة"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadOffers(); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const activeOffers = useMemo(() => offers.filter(offer => getOfferExpiryInfo(offer, now).status === "active"), [offers, now]);

  const submitOfferRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedOffer) return;
    if (customer.name.trim().length < 2 || customer.phone.trim().length < 7) { toast.error("اكتب الاسم ورقم الهاتف بشكل صحيح"); return; }
    try {
      const profile = await registerCustomer.mutateAsync({ name: customer.name.trim(), phone: customer.phone.trim() });
      if (!profile?.customerCode) throw new Error("تعذر إنشاء بطاقة نقاط العميل");
      await createPurchase.mutateAsync({ offerId: selectedOffer.id, customerCode: profile.customerCode, customerNote: customer.note.trim() || undefined });
      setSubmitted(true);
      toast.success("تم تسجيل طلبك بنجاح! سيتم التواصل معك لتسليم العرض واحتساب نقاط ولائك");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تسجيل الطلب الآن"); }
  };

  const shareOffer = async (offer: CatalogOffer) => {
    const url = `${window.location.origin}/public-offer?id=${encodeURIComponent(offer.id)}`;
    const text = `🎁 ${offer.title} من أبو رغوة — خصم ${offer.discountPercent.toFixed(0)}%`;
    if (navigator.share) {
      try { await navigator.share({ title: offer.title, text, url }); } catch { /* ألغى العميل المشاركة */ }
    } else {
      await navigator.clipboard?.writeText(`${text}\n${url}`);
      toast.success("تم نسخ رابط العرض");
    }
  };

  const catalogBackUrl = typeof window === "undefined" ? "/catalog" : `/catalog${window.location.search}`;
      return <main className="min-h-screen overflow-x-hidden bg-[#fffaf5] px-4 py-6 text-slate-900" dir="rtl"><div className="mx-auto max-w-5xl"><a href={catalogBackUrl} className="inline-flex items-center gap-2 text-sm font-black text-orange-700"><ArrowRight className="h-4 w-4" />العودة إلى الكتالوج</a><section className="mt-5 overflow-hidden rounded-[2rem] bg-gradient-to-l from-orange-600 via-amber-500 to-yellow-400 p-6 text-white shadow-xl sm:p-9"><div className="flex items-start gap-4"><span className="grid h-15 w-15 shrink-0 place-items-center rounded-3xl bg-white/20 p-4"><Sparkles className="h-8 w-8" /></span><div><p className="text-sm font-black text-orange-50">عروض أبو رغوة للعملاء</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">عروض وخصومات حصرية</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-orange-50">عروض حية من السحابة، مع السعر والتوفير والوقت المتبقي. اطلب عرضك الآن وسيتواصل معك فريق أبو رغوة.</p></div></div></section>{loading ? <section className="mt-6 rounded-3xl bg-white p-12 text-center shadow-sm"><Gift className="mx-auto h-12 w-12 animate-pulse text-orange-300" /><p className="mt-4 font-black text-slate-600">جارٍ تحميل العروض من السحابة...</p></section> : loadError ? <section className="mt-6 rounded-3xl bg-white p-12 text-center shadow-sm"><p className="font-black text-red-700">تعذر تحميل العروض</p><p className="mt-2 text-sm text-red-600">{loadError}</p><Button className="mt-4 bg-orange-600" onClick={() => void loadOffers()}>إعادة المحاولة</Button></section> : activeOffers.length === 0 ? <section className="mt-6 rounded-3xl border border-dashed border-orange-200 bg-white p-12 text-center shadow-sm"><Gift className="mx-auto h-12 w-12 text-orange-300" /><h2 className="mt-4 text-xl font-black">لا توجد عروض مفعّلة الآن</h2><p className="mt-2 text-sm text-slate-500">ارجع لاحقًا، فالعروض الجديدة تظهر هنا فور تفعيلها.</p></section> : <section className="mt-6 grid min-w-0 gap-5 md:grid-cols-2">{activeOffers.map(offer => { const expiry = getOfferExpiryInfo(offer, now); const saving = Math.max(0, offer.originalPrice - offer.offerPrice); return <article key={offer.id} className="overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-orange-100"><div className="bg-gradient-to-l from-slate-950 to-orange-700 p-5 text-white"><div className="flex items-start justify-between gap-3"><div><span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] font-black"><Tag className="h-3.5 w-3.5" />خصم خاص</span><h2 className="mt-3 text-xl font-black">{offer.title}</h2></div><span className="rounded-2xl bg-orange-400 px-3 py-2 text-xs font-black text-orange-950">وفر {offer.discountPercent.toFixed(0)}%</span></div><div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-500/25 px-3 py-2 text-sm font-black"><Clock3 className="h-4 w-4 text-amber-200" />متبقي {formatOfferTimeRemaining(expiry)}</div></div><div className="p-5"><p className="min-h-12 text-sm leading-6 text-slate-600">{offer.description}</p>{offer.items.length > 0 && <p className="mt-3 text-xs font-bold text-slate-500">يشمل: {offer.items.map(item => item.name).filter(Boolean).join(" · ")}</p>}<div className="mt-5 flex items-end justify-between gap-3"><div><p className="text-xs text-slate-400">السعر بعد الخصم</p><p className="text-3xl font-black text-orange-600">{offer.offerPrice} <span className="text-sm">ج.م</span></p>{offer.originalPrice > offer.offerPrice && <><p className="text-sm font-bold text-slate-400 line-through">بدلًا من {offer.originalPrice} ج.م</p><p className="text-xs font-black text-green-600">وفّر {saving} ج.م</p></>}</div><Button onClick={() => { setSelectedOffer(offer); setSubmitted(false); }} className="bg-orange-600 font-black hover:bg-green-600">🎁 طلب العرض الآن</Button></div>{offer.loyaltyPoints > 0 && <p className="mt-3 text-xs font-black text-purple-700">⭐ اكسب {offer.loyaltyPoints} نقطة بعد اعتماد الشراء</p>}</div></article>; })}</section>}{selectedOffer && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onClick={() => setSelectedOffer(null)}><div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>{submitted ? <div className="py-8 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-3xl">✓</div><h2 className="mt-4 text-xl font-black text-green-700">تم تسجيل طلبك بنجاح!</h2><p className="mt-3 text-sm leading-7 text-slate-600">سيتم التواصل معك لتسليم العرض واحتساب نقاط ولائك.</p><Button className="mt-5 bg-green-600" onClick={() => setSelectedOffer(null)}>إغلاق</Button></div> : <><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold text-orange-600">طلب العرض</p><h2 className="text-xl font-black">{selectedOffer.title}</h2></div><div className="flex items-center gap-1"><Button variant="ghost" size="icon" onClick={() => void shareOffer(selectedOffer)} aria-label="مشاركة العرض"><Share2 className="h-4 w-4 text-orange-600" /></Button><Button variant="ghost" size="icon" onClick={() => setSelectedOffer(null)}><X /></Button></div></div><form className="space-y-3" onSubmit={submitOfferRequest}><Input required minLength={2} value={customer.name} onChange={event => setCustomer({ ...customer, name: event.target.value })} placeholder="الاسم *" /><Input required minLength={7} value={customer.phone} onChange={event => setCustomer({ ...customer, phone: event.target.value })} placeholder="رقم الهاتف *" type="tel" /><Textarea maxLength={1000} value={customer.note} onChange={event => setCustomer({ ...customer, note: event.target.value })} placeholder="ملاحظات اختيارية: توصيل أو استلام من المحل" /><Button disabled={registerCustomer.isLoading || createPurchase.isLoading} className="w-full bg-orange-600 py-6 font-black hover:bg-green-600">{registerCustomer.isLoading || createPurchase.isLoading ? "جارٍ تسجيل الطلب..." : "تأكيد طلب العرض"}</Button><p className="text-center text-[11px] text-slate-500">سيتم إنشاء أو ربط بطاقة الولاء برقم هاتفك، وتضاف النقاط بعد اعتماد الطلب من الإدارة.</p></form></>}</div></div>}</div></main>;
}
