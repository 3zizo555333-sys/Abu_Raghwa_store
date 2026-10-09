import { useMemo, useState } from "react";
import { ArrowRight, Gift, History, Loader2, Phone, Star, QrCode } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { shouldLookupLoyaltyProfile } from "@/lib/loyaltyLookup";
import { LoyaltyRewardProgressCard } from "@/components/LoyaltyRewardProgress";

type RewardLevel = { points: number; giftName: string; confirmed?: boolean };
const DEFAULT_REWARDS: RewardLevel[] = [
  { points: 20, giftName: "كيس مسحوق غسيل 1 كيلو", confirmed: true },
  { points: 50, giftName: "جركن صابون سائل 4 لتر", confirmed: true },
  { points: 100, giftName: "باكدج منظفات منزلية", confirmed: true },
  { points: 200, giftName: "هدية كبرى خاصة", confirmed: true },
];

const sourceLabel: Record<string, string> = {
  catalog: "شراء من الكتالوج",
  offer: "كوبون عرض",
  reward: "استبدال هدية",
  sale: "فاتورة كاشير أو بيع عادي",
  manual: "تعديل إداري",
};

export default function LoyaltyPage() {
  const [phone, setPhone] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("phone") || "");
  const [customerCode, setCustomerCode] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("code") || "");
  const rewardLevelsQuery = trpc.catalog.getPublicLoyaltyRewardLevels.useQuery(undefined, { staleTime: 30_000, retry: false });
  const queryInput = useMemo(() => ({ phone: phone.trim() || undefined, customerCode: customerCode.trim().length >= 4 ? customerCode.trim() : undefined }), [phone, customerCode]);
  const hasIdentifier = shouldLookupLoyaltyProfile(phone, customerCode);
  const profileQuery = trpc.catalog.getLoyaltyProfile.useQuery(queryInput, { enabled: hasIdentifier, retry: false });
  const profile = profileQuery.data;
  const confirmedRewards = rewardLevelsQuery.data ?? DEFAULT_REWARDS;

  return (
    <main className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-blue-50 px-4 py-8 text-slate-900" dir="rtl">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="rounded-3xl bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 p-6 text-white shadow-xl">
          <Link href="/catalog" className="inline-flex items-center gap-2 text-sm font-bold text-blue-100 hover:text-white"><ArrowRight className="h-4 w-4" />العودة إلى الكتالوج</Link>
          <div className="mt-8 flex items-center gap-3"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15"><Star className="h-7 w-7 fill-amber-300 text-amber-300" /></span><div><p className="text-sm font-bold text-blue-100">مكافآتك من أبو رغوة</p><h1 className="text-3xl font-black">صفحة نقاطي</h1></div></div>
          <p className="mt-4 max-w-xl text-sm leading-7 text-blue-50">تابع رصيدك الموحد من مشتريات الكتالوج وكوبونات العروض وفواتير الكاشير، واعرف الهدية التي وصلت إليها.</p>
        </header>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center gap-2"><QrCode className="h-5 w-5 text-orange-600" /><h2 className="font-black">ادخل إلى نقاطك</h2></div>
          <p className="mt-1 text-sm leading-6 text-slate-500">أدخل كود الولاء المكوّن من 4 أحرف أو أرقام والموجود على فاتورتك أو بطاقة نقاطك؛ الكود وحده يكفي. رقم الهاتف اختياري.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input value={customerCode} onChange={event => setCustomerCode(event.target.value)} placeholder="كود الولاء (4 خانات)" autoCapitalize="characters" autoComplete="off" className="h-12 rounded-xl text-left" dir="ltr" /><Input value={phone} onChange={event => setPhone(event.target.value)} type="tel" placeholder="رقم الهاتف (اختياري)" className="h-12 rounded-xl" /></div>
        </section>

        {profileQuery.isFetching && <div className="rounded-3xl bg-white p-8 text-center shadow-sm"><Loader2 className="mx-auto h-7 w-7 animate-spin text-orange-600" /><p className="mt-3 text-sm font-bold text-slate-600">جارٍ تحميل رصيدك...</p></div>}
        {!profileQuery.isFetching && hasIdentifier && !profile && <div className="rounded-3xl bg-white p-8 text-center shadow-sm"><Gift className="mx-auto h-10 w-10 text-amber-400" /><h2 className="mt-3 font-black">لم نعثر على بطاقة ولاء بهذا الكود أو الرقم</h2><p className="mt-2 text-sm leading-6 text-slate-500">تأكد من كتابة الكود ذي الأربع خانات كما يظهر على الفاتورة. الهاتف اختياري؛ لا تحتاج إلى إدخاله إذا كان الكود صحيحًا.</p></div>}
        {profile && <>
          <section className="rounded-3xl bg-gradient-to-l from-amber-500 to-orange-500 p-6 text-white shadow-lg"><p className="text-sm font-bold text-amber-50">أهلًا {profile.name}</p><p className="mt-1 text-5xl font-black">{profile.points} <span className="text-lg">نقطة</span></p><p className="mt-2 text-sm text-amber-50">رصيد واحد يجمع العروض والكتالوج والكاشير والبيع العادي.</p><p className="mt-3 text-xs text-amber-100">كودك الخاص: <strong dir="ltr">{profile.customerCode}</strong></p></section>
          <LoyaltyRewardProgressCard points={profile.points} levels={confirmedRewards} isLoading={rewardLevelsQuery.isLoading && rewardLevelsQuery.data === undefined} />
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className="flex items-center gap-2"><History className="h-5 w-5 text-blue-600" /><h2 className="font-black">حركات النقاط</h2></div>{!profile.transactions?.length ? <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">لا توجد حركات مسجلة بعد.</p> : <div className="mt-4 space-y-2">{profile.transactions.map(transaction => <div key={transaction.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 p-3"><div><p className="text-sm font-bold text-slate-800">{transaction.description}</p><p className="mt-1 text-xs text-slate-500">{sourceLabel[transaction.source] || "حركة نقاط"} · {new Date(transaction.createdAt).toLocaleString("ar-EG")}</p></div><strong className={transaction.points >= 0 ? "text-green-600" : "text-red-600"}>{transaction.points > 0 ? "+" : ""}{transaction.points}</strong></div>)}</div>}</section>
        </>}

        <div className="text-center"><Button asChild variant="outline" className="rounded-xl"><Link href="/catalog">تصفح المنتجات واطلب الآن</Link></Button></div>
      </div>
    </main>
  );
}
