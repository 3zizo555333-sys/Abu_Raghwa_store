import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { 
  ArrowRight, Brain, Gift, Play, RefreshCw, Save, Ticket, Users, 
  Upload, Sparkles, Image as ImageIcon, Trash2, Check, Edit
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import * as communityModule from "@/lib/supabase/communityDraws";
import { 
  listManagedCommunityEvents, 
  savePurchaseRaffle, 
  saveTriviaContest, 
  deletePurchaseRaffle,
  deleteTriviaContest,
  startCommunityDraw, 
  subscribeManagedCommunityChanges 
} from "@/lib/supabase/communityDraws";
import { CommunityLiveWinner } from "@/components/CommunityLiveWinner";
import { uploadCommunityImage } from "@/lib/supabase/communityImages";
import { OfferProductStager, OfferProductStagerBoundary } from "@/components/OfferProductStager";

type AdminData = Awaited<ReturnType<typeof listManagedCommunityEvents>>;

interface RaffleRuleConfig {
  minAmount: number;
  ticketPerAmount: number;
  allowMultipleEntries: boolean;
  minParticipants: number;
  drawConditionType: "count" | "date" | "both";
}

interface SocialTasksConfig {
  requireFacebookShare: boolean;
  facebookPageUrl: string;
  facebookPostUrl: string;
  requireWhatsappShare: boolean;
  whatsappShareText: string;
  requireInstagramFollow: boolean;
  instagramUrl: string;
  requireTiktokFollow: boolean;
  tiktokUrl: string;
}

const defaultRaffleRules: RaffleRuleConfig = {
  minAmount: 100,
  ticketPerAmount: 50,
  allowMultipleEntries: true,
  minParticipants: 10,
  drawConditionType: "count"
};

const defaultSocialTasks: SocialTasksConfig = {
  requireFacebookShare: true,
  facebookPageUrl: "",
  facebookPostUrl: "",
  requireWhatsappShare: true,
  whatsappShareText: "ادخل مسابقة متجر رجوة واكسب جوائز فورية!",
  requireInstagramFollow: false,
  instagramUrl: "",
  requireTiktokFollow: false,
  tiktokUrl: ""
};

const blankRaffle = () => ({
  title: "",
  description: "",
  banner_image_url: "",
  prize_name: "",
  prize_image_url: "",
  prize_description: "",
  min_purchase_amount: "100",
  ends_at: toIso(new Date(Date.now() + 7 * 86400000)),
  rules_config: { ...defaultRaffleRules }
});

const blankTrivia = () => ({
  title: "",
  question: "",
  question_image_url: "",
  options: ["", "", "", ""],
  correct_option_index: "0",
  prize_title: "",
  prize_image_url: "",
  banner_image_url: "",
  prize_description: "",
  ends_at: toIso(new Date(Date.now() + 3 * 86400000)),
  social_tasks: { ...defaultSocialTasks }
});

function toLocalInput(value: string) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toIso(value: string | Date) {
  return value ? new Date(value).toISOString() : "";
}

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("duplicate") ? "هذا العنصر مسجل مسبقاً" : message;
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("تعذر قراءة صورة الجائزة."));
    reader.readAsDataURL(file);
  });
}

export default function CommunityAdminPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"raffles" | "trivia">("raffles");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [activeWinnerModal, setActiveWinnerModal] = useState<any | null>(null);
  const [stagingPrize, setStagingPrize] = useState<{ kind: "raffle" | "trivia"; title: string } | null>(null);

  const [editingRaffle, setEditingRaffle] = useState<{ id: string } | null>(null);
  const [raffle, setRaffle] = useState(blankRaffle());

  const [editingTrivia, setEditingTrivia] = useState<{ id: string } | null>(null);
  const [trivia, setTrivia] = useState(blankTrivia());

  const questionFileInputRef = useRef<HTMLInputElement>(null);

  const adminData = data as any;

  const refresh = useCallback(async () => {
    try {
      const next = await listManagedCommunityEvents();
      setData(next);
      setError("");
    } catch (e: any) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [refresh, refreshKey]);

  useEffect(() => {
    if (!adminData?.shopId) return;
    return subscribeManagedCommunityChanges(adminData.shopId, () => void refresh());
  }, [adminData?.shopId, refresh]);

  const updateRaffle = (key: string, value: any) => {
    setRaffle((current) => ({ ...current, [key]: value }));
  };

  const updateRaffleRule = (key: keyof RaffleRuleConfig, value: any) => {
    setRaffle((current) => ({
      ...current,
      rules_config: { ...current.rules_config, [key]: value },
      ...(key === "minAmount" ? { min_purchase_amount: String(value) } : {})
    }));
  };

  const updateTrivia = (key: string, value: any) => {
    setTrivia((current) => ({ ...current, [key]: value }));
  };

  const updateSocialTask = (key: keyof SocialTasksConfig, value: any) => {
    setTrivia((current) => ({
      ...current,
      social_tasks: { ...current.social_tasks, [key]: value }
    }));
  };

  const updateTriviaOption = (index: number, val: string) => {
    setTrivia((current) => {
      const opts = [...current.options];
      opts[index] = val;
      return { ...current, options: opts };
    });
  };

  const saveStagedPrizeImage = async (file: File, kind: "raffle" | "trivia") => {
    const dataUrl = await fileAsDataUrl(file);
    const imageUrl = await uploadCommunityImage(dataUrl, "prize");
    if (kind === "raffle") updateRaffle("prize_image_url", imageUrl);
    else updateTrivia("prize_image_url", imageUrl);
    toast.success("تم تفريغ صورة الجائزة وحفظها، وتم تحديث المعاينة فوراً.");
  };

  const handleEditRaffle = (item: any) => {
    setActiveTab("raffles");
    setEditingRaffle({ id: item.id });
    const storedRules = item.required_products_rules || item.rules || {};
    const storedMinimum = item.min_invoice_total ?? storedRules.min_invoice_total ?? storedRules.minAmount;
    setRaffle({
      title: item.title || "",
      description: item.description || "",
      banner_image_url: item.banner_image_url || "",
      prize_name: item.prize_name || "",
      prize_image_url: item.prize_image_url || "",
      prize_description: item.prize_description || "",
      min_purchase_amount: String(storedMinimum == null ? 100 : storedMinimum),
      ends_at: item.ends_at || "",
      rules_config: {
        minAmount: Number(storedMinimum == null ? 100 : storedMinimum),
        ticketPerAmount: Number(storedRules.extra_ticket_price ?? storedRules.ticketPerAmount ?? 50),
        allowMultipleEntries: storedRules.allowMultipleEntries ?? true,
        minParticipants: Number(storedRules.target_participants ?? storedRules.minParticipants ?? 10),
        drawConditionType: storedRules.drawConditionType ?? "count"
      }
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info("تم تحميل بيانات السحب في النموذج للتعديل");
  };

  const handleDeleteRaffle = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا السحب نهائياً؟")) return;
    const raffleId = String(id || "").trim();
    if (!raffleId) { toast.error("معرف السحب غير صالح."); return; }
    setBusy(`delete_raffle_${raffleId}`);
    try {
      await deletePurchaseRaffle(raffleId);
      toast.success("تم حذف السحب بنجاح");
      await refresh();
    } catch (err: any) {
      toast.error(errorText(err));
    } finally {
      setBusy("");
    }
  };

  const handleEditTrivia = (item: any) => {
    setActiveTab("trivia");
    setEditingTrivia({ id: item.id });
    setTrivia({
      title: item.title || "",
      question: item.question || "",
      question_image_url: item.question_image_url || "",
      options: Array.isArray(item.options) && item.options.length === 4 ? item.options : (item.options || ["", "", "", ""]),
      correct_option_index: String(item.correct_option_index ?? "0"),
      prize_title: item.prize_title || "",
      prize_image_url: item.prize_image_url || "",
      banner_image_url: item.banner_image_url || "",
      prize_description: item.prize_description || "",
      ends_at: item.ends_at || "",
      social_tasks: {
        requireFacebookShare: item.rules?.social_tasks?.requireFacebookShare ?? true,
        facebookPageUrl: item.rules?.social_tasks?.facebookPageUrl || "",
        facebookPostUrl: item.rules?.social_tasks?.facebookPostUrl || "",
        requireWhatsappShare: item.rules?.social_tasks?.requireWhatsappShare ?? true,
        whatsappShareText: item.rules?.social_tasks?.whatsappShareText || "ادخل مسابقة متجر رجوة واكسب جوائز فورية!",
        requireInstagramFollow: item.rules?.social_tasks?.requireInstagramFollow ?? false,
        instagramUrl: item.rules?.social_tasks?.instagramUrl || "",
        requireTiktokFollow: item.rules?.social_tasks?.requireTiktokFollow ?? false,
        tiktokUrl: item.rules?.social_tasks?.tiktokUrl || ""
      }
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info("تم تحميل بيانات المسابقة في النموذج للتعديل");
  };

  const handleDeleteTrivia = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه المسابقة نهائياً؟")) return;
    const contestId = String(id || "").trim();
    if (!contestId) { toast.error("معرف المسابقة غير صالح."); return; }
    setBusy(`delete_trivia_${contestId}`);
    try {
      await deleteTriviaContest(contestId);
      toast.success("تم حذف المسابقة بنجاح");
      await refresh();
    } catch (err: any) {
      toast.error(errorText(err));
    } finally {
      setBusy("");
    }
  };

  const saveRaffleForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!String(raffle.title || "").trim()) return toast.error("يرجى إدخال اسم السحب");
    if (!raffle.ends_at) return toast.error("حدد موعد انتهاء السحب");

    const payload = {
      ...(editingRaffle ? { id: editingRaffle.id } : {}),
      title: raffle.title,
      description: raffle.description,
      banner_image_url: raffle.banner_image_url,
      prize_name: raffle.prize_name,
      prize_image_url: raffle.prize_image_url,
      prize_description: raffle.prize_description,
      min_invoice_total: Number(raffle.min_purchase_amount),
      ends_at: raffle.ends_at,
      required_products_rules: {
        ...raffle.rules_config,
        min_invoice_total: Number(raffle.min_purchase_amount),
        extra_ticket_price: Number(raffle.rules_config.ticketPerAmount),
        target_participants: Number(raffle.rules_config.minParticipants),
      }
    };

    setBusy("save_raffle");
    try {
      if (String(payload.prize_image_url).startsWith("data:")) payload.prize_image_url = await uploadCommunityImage(String(payload.prize_image_url), "prize");
      if (String(payload.banner_image_url).startsWith("data:")) payload.banner_image_url = await uploadCommunityImage(String(payload.banner_image_url), "banner");
      await (savePurchaseRaffle as any)(payload);
      toast.success(editingRaffle ? "تم حفظ التعديلات بنجاح" : "تم إطلاق سحب المشتريات بنجاح!");
      setEditingRaffle(null);
      setRaffle(blankRaffle());
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast.error(errorText(err));
    } finally {
      setBusy("");
    }
  };

  const saveTriviaForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!String(trivia.title || "").trim()) return toast.error("أدخل عنوان المسابقة");
    if (!String(trivia.question || "").trim()) return toast.error("أدخل سؤال المسابقة");
    if (!Array.isArray(trivia.options) || trivia.options.some((o) => !String(o || "").trim())) return toast.error("يرجى ملء جميع الخيارات الأربعة");
    if (!trivia.ends_at) return toast.error("حدد موعد انتهاء المسابقة");

    const payload = {
      ...(editingTrivia ? { id: editingTrivia.id } : {}),
      title: trivia.title,
      question: trivia.question,
      question_image_url: trivia.question_image_url,
      options: trivia.options,
      correct_option_index: Number(trivia.correct_option_index) || 0,
      prize_title: trivia.prize_title || "هدية مجانية",
      prize_image_url: trivia.prize_image_url,
      prize_description: trivia.prize_description,
      banner_image_url: trivia.banner_image_url,
      ends_at: trivia.ends_at,
      rules: {
        social_tasks: trivia.social_tasks
      }
    };

    setBusy("save_trivia");
    try {
      if (String(payload.question_image_url).startsWith("data:")) payload.question_image_url = await uploadCommunityImage(String(payload.question_image_url), "question");
      if (String(payload.prize_image_url).startsWith("data:")) payload.prize_image_url = await uploadCommunityImage(String(payload.prize_image_url), "prize");
      if (String(payload.banner_image_url).startsWith("data:")) payload.banner_image_url = await uploadCommunityImage(String(payload.banner_image_url), "banner");
      await (saveTriviaContest as any)(payload);
      toast.success(editingTrivia ? "تم حفظ تعديلات المسابقة بنجاح" : "تم نشر المسابقة بنجاح!");
      setEditingTrivia(null);
      setTrivia(blankTrivia());
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast.error(errorText(err));
    } finally {
      setBusy("");
    }
  };

  const currentPrizeImg = activeTab === "raffles" ? raffle.prize_image_url : trivia.prize_image_url;
  return (
    <main dir="rtl" className="min-h-screen bg-slate-900 text-slate-100 pb-16">
      <header className="bg-slate-950 border-b border-indigo-900/50 px-4 py-4 shadow-lg sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-slate-300">
              <ArrowRight className="h-5 w-5 ml-1" /> المتجر
            </Button>
            <h1 className="text-lg md:text-xl font-bold text-amber-400 flex items-center gap-2">
              <Gift className="h-5 w-5" /> إدارة السحوبات والمسابقات
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)} className="border-indigo-700 text-indigo-200">
            <RefreshCw className="h-3.5 w-3.5 ml-1" /> تحديث
          </Button>
        </div>

        <div className="max-w-4xl mx-auto flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => setActiveTab("raffles")}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold flex items-center justify-center gap-2 transition-all border ${activeTab === "raffles" ? "bg-amber-500 border-amber-400 text-slate-950 shadow-md" : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"}`}
          >
            <Ticket className="h-4 w-4" /> 1. سحوبات المشتريات (الفواتير واكتمال العدد)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("trivia")}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold flex items-center justify-center gap-2 transition-all border ${activeTab === "trivia" ? "bg-emerald-500 border-emerald-400 text-slate-950 shadow-md" : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"}`}
          >
            <Brain className="h-4 w-4" /> 2. مسابقات وتحديات الأسئلة
          </button>
        </div>
      </header>


      <div className="max-w-4xl mx-auto p-4 space-y-6 mt-2">
        {error && <div className="p-3 bg-red-950/80 border border-red-700 text-red-200 rounded-xl text-sm">{error}</div>}

        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-violet-400/40 bg-slate-800/90 p-4 shadow-xl">
          {currentPrizeImg ? <img src={currentPrizeImg} alt="معاينة صورة الجائزة" className="h-20 w-20 rounded-xl bg-white/10 object-contain p-1" /> : <div className="grid h-20 w-20 place-items-center rounded-xl bg-slate-950 text-amber-400"><Gift className="h-8 w-8" /></div>}
          <div className="min-w-0 flex-1"><p className="text-sm font-black text-white">صورة الجائزة</p><p className="mt-1 text-xs leading-5 text-slate-300">استخدم استوديو التفريغ الموحد المعتمد في الكتالوج لمعالجة الصورة وخلفيتها الشفافة.</p></div>
          <Button type="button" onClick={() => setStagingPrize({ kind: activeTab === "raffles" ? "raffle" : "trivia", title: (activeTab === "raffles" ? raffle.prize_name : trivia.prize_title) || "جائزة السحب" })} className="bg-violet-700 font-black text-white hover:bg-violet-600"><Sparkles className="ml-2 h-4 w-4" />استوديو صورة الجائزة</Button>
        </section>
        {/* نموذج سحوبات المشتريات */}
        {activeTab === "raffles" && (
          <section className="bg-slate-800/95 rounded-2xl border border-indigo-500/30 p-5 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Ticket className="h-5 w-5 text-amber-400" />
                {editingRaffle ? "تعديل سحب المشتريات" : "إنشاء سحب مشتريات جديد"}
              </h2>
              {editingRaffle && (
                <Button variant="ghost" size="sm" onClick={() => { setEditingRaffle(null); setRaffle(blankRaffle()); }}>
                  إلغاء التعديل
                </Button>
              )}
            </div>

            <form onSubmit={saveRaffleForm} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">عنوان السحب *</label>
                  <Input
                    placeholder="مثال: سحب العيد الكبير"
                    value={raffle.title}
                    onChange={(e) => updateRaffle("title", e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">اسم الجائزة *</label>
                  <Input
                    placeholder="مثال: برميل صابون / غسالة أوتوماتيك"
                    value={raffle.prize_name}
                    onChange={(e) => updateRaffle("prize_name", e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">تفاصيل وشروط السحب</label>
                <Textarea
                  placeholder="اكتب تعليمات وشروط استلام الجائزة..."
                  value={raffle.description}
                  onChange={(e) => updateRaffle("description", e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white"
                  rows={2}
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-indigo-900/60 space-y-3">
                <h3 className="text-xs font-bold text-emerald-400">
                  شروط الفواتير واكتمال النصاب (تأمين تكلفة الجائزة)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold mb-1 text-slate-300">الحد الأدنى للفاتورة (ج.م) *</label>
                    <Input
                      type="number" min="1" value={raffle.rules_config.minAmount}
                      onChange={(e) => updateRaffleRule("minAmount", Number(e.target.value))}
                      className="bg-slate-900 border-slate-700 text-white" required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1 text-slate-300">تذكرة إضافية لكل (ج.م)</label>
                    <Input
                      type="number" min="1" value={raffle.rules_config.ticketPerAmount}
                      onChange={(e) => updateRaffleRule("ticketPerAmount", Number(e.target.value))}
                      className="bg-slate-900 border-slate-700 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1 text-emerald-300">
                      تارجت المشتركين المطلوب *
                    </label>
                    <Input
                      type="number" min="1" value={raffle.rules_config.minParticipants}
                      onChange={(e) => updateRaffleRule("minParticipants", Number(e.target.value))}
                      className="bg-slate-900 border-emerald-600/60 text-emerald-200 font-bold" required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1 text-slate-300">موعد نهاية السحب *</label>
                    <Input
                      type="datetime-local" value={toLocalInput(raffle.ends_at)}
                      onChange={(e) => updateRaffle("ends_at", toIso(e.target.value))}
                      className="bg-slate-900 border-slate-700 text-white" required
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-4 text-xs">
                  <span className="text-slate-400">نظام بدء السحب:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                    <input
                      type="radio" name="drawCondition"
                      checked={raffle.rules_config.drawConditionType === "count"}
                      onChange={() => updateRaffleRule("drawConditionType", "count")}
                      className="accent-emerald-500"
                    />
                    فور اكتمال العدد المطلوب ({raffle.rules_config.minParticipants} مشترك)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                    <input
                      type="radio" name="drawCondition"
                      checked={raffle.rules_config.drawConditionType === "date"}
                      onChange={() => updateRaffleRule("drawConditionType", "date")}
                      className="accent-emerald-500"
                    />
                    في التاريخ المحدد فقط
                  </label>
                </div>
              </div>

              <Button
                type="submit"
                disabled={busy === "save_raffle"}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-bold py-2.5"
              >
                <Save className="h-4 w-4 ml-2" />
                {busy === "save_raffle" ? "جاري الحفظ..." : (editingRaffle ? "تحديث وحفظ التعديلات" : "حفظ وإطلاق سحب المشتريات")}
              </Button>
            </form>
          </section>
        )}

        {/* نموذج مسابقات وتحديات الأسئلة */}
        {activeTab === "trivia" && (
          <section className="bg-slate-800/95 rounded-2xl border border-emerald-500/30 p-5 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Brain className="h-5 w-5 text-emerald-400" />
                {editingTrivia ? "تعديل المسابقة" : "إنشاء مسابقة وتحدي جديد"}
              </h2>
              {editingTrivia && (
                <Button variant="ghost" size="sm" onClick={() => { setEditingTrivia(null); setTrivia(blankTrivia()); }}>
                  إلغاء التعديل
                </Button>
              )}
            </div>

            <form onSubmit={saveTriviaForm} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">عنوان المسابقة والتحدي *</label>
                  <Input
                    placeholder="مثال: مسابقة الجمعة التفاعلية"
                    value={trivia.title}
                    onChange={(e) => updateTrivia("title", e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">الجائزة المقدمة *</label>
                  <Input
                    placeholder="مثال: عبوة منظف هدية / كود خصم 50%"
                    value={trivia.prize_title}
                    onChange={(e) => updateTrivia("prize_title", e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">السؤال التفاعلي *</label>
                <Input
                  placeholder="مثال: ما هو المكون الأساسي لصناعة الصابون السائل عالي الجودة؟"
                  value={trivia.question}
                  onChange={(e) => updateTrivia("question", e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white"
                  required
                />
              </div>

              {/* رفع صورة توضيحية للسؤال */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">صورة توضيحية للسؤال (اختياري)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    ref={questionFileInputRef}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        updateTrivia("question_image_url", ev.target?.result as string);
                        toast.success("تم إرفاق صورة السؤال بنجاح");
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => questionFileInputRef.current?.click()}
                    className="border-slate-700 text-slate-300 text-xs"
                  >
                    <Upload className="h-3.5 w-3.5 ml-1 text-blue-400" /> اختيار صورة للسؤال
                  </Button>
                  {trivia.question_image_url && (
                    <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                      <img src={trivia.question_image_url} alt="سؤال" className="h-8 w-8 object-cover rounded" />
                      <span className="text-[11px] text-slate-300">تم تحديد الصورة</span>
                      <button 
                        type="button" 
                        onClick={() => updateTrivia("question_image_url", "")} 
                        className="p-1 text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-700 space-y-3">
                <label className="block text-xs font-bold text-sky-400">خيارات الإجابة (حدد الدائرة بجانب الإجابة الصحيحة):</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {trivia.options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
                      <input
                        type="radio"
                        name="correct_option"
                        checked={Number(trivia.correct_option_index) === idx}
                        onChange={() => updateTrivia("correct_option_index", String(idx))}
                        className="accent-emerald-500 h-4 w-4"
                      />
                      <Input
                        placeholder={`الخيار رقم ${idx + 1}`}
                        value={opt}
                        onChange={(e) => updateTriviaOption(idx, e.target.value)}
                        className="bg-transparent border-0 text-white h-7 text-xs focus-visible:ring-0"
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-emerald-900/70 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-xs font-bold text-amber-400">
                    شروط السوشيال ميديا الإلزامية لدخول المسابقة
                  </h3>
                  <span className="text-[10px] text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-800">
                    نشر وتفاعل مجاني للصفحة
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-blue-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={trivia.social_tasks.requireFacebookShare}
                        onChange={(e) => updateSocialTask("requireFacebookShare", e.target.checked)}
                        className="accent-blue-500"
                      />
                      متابعة صفحة الفيسبوك والتفاعل مع المنشور
                    </label>
                    <Input
                      placeholder="رابط صفحة المتجر على فيسبوك"
                      value={trivia.social_tasks.facebookPageUrl}
                      onChange={(e) => updateSocialTask("facebookPageUrl", e.target.value)}
                      className="bg-slate-950 border-slate-700 text-xs text-white"
                    />
                    <Input
                      placeholder="رابط بوست المسابقة (لايك وكومنت وشير)"
                      value={trivia.social_tasks.facebookPostUrl}
                      onChange={(e) => updateSocialTask("facebookPostUrl", e.target.value)}
                      className="bg-slate-950 border-slate-700 text-xs text-white"
                    />
                  </div>

                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-emerald-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={trivia.social_tasks.requireWhatsappShare}
                        onChange={(e) => updateSocialTask("requireWhatsappShare", e.target.checked)}
                        className="accent-emerald-500"
                      />
                      مشاركة المسابقة على واتساب (حالة / جروبات)
                    </label>
                    <Input
                      placeholder="رسالة المشاركة التلقائية على واتساب"
                      value={trivia.social_tasks.whatsappShareText}
                      onChange={(e) => updateSocialTask("whatsappShareText", e.target.value)}
                      className="bg-slate-950 border-slate-700 text-xs text-white"
                    />
                  </div>

                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-pink-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={trivia.social_tasks.requireInstagramFollow}
                        onChange={(e) => updateSocialTask("requireInstagramFollow", e.target.checked)}
                        className="accent-pink-500"
                      />
                      متابعة حساب الإنستجرام (اختياري)
                    </label>
                    <Input
                      placeholder="رابط حساب إنستجرام الخاص بالمتجر"
                      value={trivia.social_tasks.instagramUrl}
                      onChange={(e) => updateSocialTask("instagramUrl", e.target.value)}
                      className="bg-slate-950 border-slate-700 text-xs text-white"
                    />
                  </div>

                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-cyan-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={trivia.social_tasks.requireTiktokFollow}
                        onChange={(e) => updateSocialTask("requireTiktokFollow", e.target.checked)}
                        className="accent-cyan-500"
                      />
                      متابعة حساب تيك توك (اختياري)
                    </label>
                    <Input
                      placeholder="رابط حساب تيك توك"
                      value={trivia.social_tasks.tiktokUrl}
                      onChange={(e) => updateSocialTask("tiktokUrl", e.target.value)}
                      className="bg-slate-950 border-slate-700 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">موعد انتهاء المسابقة *</label>
                <Input
                  type="datetime-local"
                  value={toLocalInput(trivia.ends_at)}
                  onChange={(e) => updateTrivia("ends_at", toIso(e.target.value))}
                  className="bg-slate-900 border-slate-700 text-white"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={busy === "save_trivia"}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-bold py-2.5"
              >
                <Save className="h-4 w-4 ml-2" />
                {busy === "save_trivia" ? "جاري الحفظ..." : (editingTrivia ? "تحديث وحفظ التعديلات" : "حفظ ونشر المسابقة")}
              </Button>
            </form>
          </section>
        )}

        {/* عرض السحوبات والمسابقات مع أزرار التعديل والحذف وسحب الفائز */}
        <section className="space-y-4">
          <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-400" />
            {activeTab === "raffles" ? "سحوبات المشتريات المفتوحة" : "مسابقات الأسئلة النشطة"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeTab === "raffles" ? (
              adminData?.raffles?.map((item: any) => {
                const rules = item.required_products_rules || item.rules || {};
                const targetCount = Number(rules.target_participants ?? rules.minParticipants ?? 10);
                const minimumPurchase = item.min_invoice_total ?? rules.min_invoice_total ?? rules.minAmount ?? 0;
                const participantsCount = item.entries_count || 0;
                const isCountMet = participantsCount >= targetCount;
                const isDatePassed = new Date(item.ends_at).getTime() <= clock;
                const canDraw = rules.drawConditionType === "count" ? isCountMet : isDatePassed;

                return (
                  <div key={item.id} className="p-4 rounded-xl bg-slate-800/90 border border-slate-700 shadow-md flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-white text-sm">{item.title}</h3>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${canDraw ? "bg-emerald-950 text-emerald-300 border border-emerald-600" : "bg-amber-950 text-amber-300 border border-amber-600"}`}>
                          {canDraw ? "جاهز للسحب" : "قيد جمع المشتركين"}
                        </span>
                      </div>
                      <p className="text-xs text-amber-400 font-bold mt-1">🎁 {item.prize_name}</p>
                      <p className="text-xs text-slate-300 mt-1">الحد الأدنى: {Number(minimumPurchase).toLocaleString("ar-EG")} ج.م | التارجت: {targetCount} مشترك</p>

                      <div className="mt-2.5">
                        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                          <span>المشتركون: {participantsCount}</span>
                          <span>المطلوب: {targetCount}</span>
                        </div>
                        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-700">
                          <div 
                            className="bg-emerald-500 h-2 transition-all duration-500" 
                            style={{ width: `${Math.min(100, (participantsCount / targetCount) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-700 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>ينتهي: {new Date(item.ends_at).toLocaleDateString("ar-EG")}</span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditRaffle(item)}
                            className="h-7 px-2 border-slate-600 text-slate-200 hover:bg-slate-700 text-xs"
                          >
                            <Edit className="h-3 w-3 ml-1 text-sky-400" /> تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteRaffle(item.id)}
                            disabled={busy === `delete_raffle_${item.id}`}
                            className="h-7 px-2 border-red-900/60 text-red-300 hover:bg-red-950 text-xs"
                          >
                            <Trash2 className="h-3 w-3 ml-1" /> حذف
                          </Button>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!canDraw && !confirm("تنبيه: لم يكتمل العدد المطلوب بعد لتغطية تكلفة الجائزة! هل أنت متأكد من إجراء السحب؟")) return;
                          setBusy(`draw_${item.id}`);
                          try {
                            const res = await (communityModule as any).startCommunityDraw("purchase", item.id);
                            setActiveWinnerModal(res);
                            toast.success("تم إجراء السحب وإعلان الفائز بنجاح!");
                          } catch (err: any) {
                            toast.error(errorText(err));
                          } finally {
                            setBusy("");
                          }
                        }}
                        disabled={busy === `draw_${item.id}`}
                        className={`${canDraw ? "bg-emerald-600 hover:bg-emerald-500" : "bg-slate-700 hover:bg-slate-600"} text-white font-bold text-xs w-full h-8`}
                      >
                        <Play className="h-3 w-3 ml-1" /> سحب الفائز الآن
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              adminData?.contests?.map((contest: any) => (
                <div key={contest.id} className="p-4 rounded-xl bg-slate-800/90 border border-slate-700 shadow-md flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-white text-sm">{contest.title}</h3>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-emerald-950 text-emerald-300 border border-emerald-600">
                        مسابقة تفاعلية
                      </span>
                    </div>
                    <p className="text-xs text-amber-400 font-bold mt-1">🎁 {contest.prize_title}</p>
                    <p className="text-xs text-slate-300 mt-1 line-clamp-1">❓ {contest.question}</p>
                    {contest.question_image_url && (
                      <div className="mt-2 h-20 w-32 rounded-lg overflow-hidden border border-slate-700">
                        <img src={contest.question_image_url} alt="سؤال" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <p className="text-[11px] text-slate-400 mt-1">الإجابات الصحيحة: {contest.correct_count || 0}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-700 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>ينتهي: {new Date(contest.ends_at).toLocaleDateString("ar-EG")}</span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditTrivia(contest)}
                          className="h-7 px-2 border-slate-600 text-slate-200 hover:bg-slate-700 text-xs"
                        >
                          <Edit className="h-3 w-3 ml-1 text-sky-400" /> تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteTrivia(contest.id)}
                          disabled={busy === `delete_trivia_${contest.id}`}
                          className="h-7 px-2 border-red-900/60 text-red-300 hover:bg-red-950 text-xs"
                        >
                          <Trash2 className="h-3 w-3 ml-1" /> حذف
                        </Button>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={async () => {
                        setBusy(`draw_${contest.id}`);
                        try {
                          const res = await (communityModule as any).startCommunityDraw("trivia", contest.id);
                          setActiveWinnerModal(res);
                          toast.success("تم السحب من بين أصحاب الإجابات الصحيحة!");
                        } catch (err: any) {
                          toast.error(errorText(err));
                        } finally {
                          setBusy("");
                        }
                      }}
                      disabled={busy === `draw_${contest.id}`}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs w-full h-8"
                    >
                      <Play className="h-3 w-3 ml-1" /> سحب فائز المسابقة
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {stagingPrize && <OfferProductStagerBoundary key={stagingPrize.kind} onClose={() => setStagingPrize(null)}>
        <OfferProductStager
          variant="product"
          open
          offer={{ id: `community-${stagingPrize.kind}`, title: stagingPrize.title, promoText: "صورة جائزة بخلفية شفافة", bgColor: "transparent", backgroundMode: "solid", offerPrice: 0, discountPercent: 0 }}
          onOpenChange={open => { if (!open) setStagingPrize(null); }}
          onSave={file => saveStagedPrizeImage(file, stagingPrize.kind)}
        />
      </OfferProductStagerBoundary>}

      {activeWinnerModal && (
        <CommunityLiveWinner stage={activeWinnerModal} />
      )}
    </main>
  );
}
