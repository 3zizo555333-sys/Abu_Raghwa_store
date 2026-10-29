import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { 
  ArrowRight, Brain, Gift, Play, RefreshCw, Save, Ticket, Users, 
  Upload, Sparkles, Image as ImageIcon, Trash2, Check 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  listManagedCommunityEvents, 
  savePurchaseRaffle, 
  saveTriviaContest, 
  startCommunityDraw, 
  subscribeManagedCommunityChanges 
} from "@/lib/supabase/communityDraws";
import { CommunityLiveWinner } from "@/components/CommunityLiveWinner";

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

function toIso(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("duplicate") ? "هذا العنصر مسجل مسبقاً" : message;
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

  const [editingRaffle, setEditingRaffle] = useState<{ id: string } | null>(null);
  const [raffle, setRaffle] = useState(blankRaffle());

  const [editingTrivia, setEditingTrivia] = useState<{ id: string } | null>(null);
  const [trivia, setTrivia] = useState(blankTrivia());

  // زووم وتحريك الصورة (100% إلى 400%)
  const [imgZoom, setImgZoom] = useState(100);
  const [imgPosX, setImgPosX] = useState(0);
  const [imgPosY, setImgPosY] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const res = e.target?.result as string;
      if (activeTab === "raffles") {
        updateRaffle("prize_image_url", res);
      } else {
        updateTrivia("prize_image_url", res);
      }
      setImgZoom(100);
      setImgPosX(0);
      setImgPosY(0);
      toast.success("تم رفع الصورة، اضبط الموضع واضغط توليد البانر");
    };
    reader.readAsDataURL(file);
  };

  const renderCanvasBanner = () => {
    const title = activeTab === "raffles" ? raffle.title : trivia.title;
    const prize = activeTab === "raffles" ? raffle.prize_name : trivia.prize_title;
    const imgSrc = activeTab === "raffles" ? raffle.prize_image_url : trivia.prize_image_url;

    if (!title || !prize) {
      toast.error("يرجى إدخال عنوان الفعالية واسم الجائزة أولاً");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 960;
    canvas.height = 480;

    const bgGradient = ctx.createLinearGradient(0, 0, 960, 480);
    bgGradient.addColorStop(0, "#090d16");
    bgGradient.addColorStop(0.5, "#0f172a");
    bgGradient.addColorStop(1, activeTab === "raffles" ? "#1e1b4b" : "#14332b");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 960, 480);

    ctx.strokeStyle = "rgba(245, 158, 11, 0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(15, 15, 930, 450);

    const boxX = 50;
    const boxY = 60;
    const boxW = 360;
    const boxH = 360;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(boxX, boxY, boxW, boxH);

    ctx.textAlign = "right";
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(activeTab === "raffles" ? "🎁 سحب متجر رجوة للمنظفات" : "🧠 مسابقات وتحديات متجر رجوة", 910, 85);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 38px sans-serif";
    ctx.fillText(title, 910, 145);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 30px sans-serif";
    ctx.fillText(`الجائزة: ${prize}`, 910, 205);

    if (activeTab === "raffles") {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "22px sans-serif";
      ctx.fillText(`• الحد الأدنى للفاتورة: ${raffle.min_purchase_amount} ج.م`, 910, 265);
      ctx.fillText(`• فرصة سحب إضافية لكل: ${raffle.rules_config.ticketPerAmount} ج.م`, 910, 310);

      ctx.fillStyle = "#34d399";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText(`🎯 السحب يبدأ فور اكتمال: ${raffle.rules_config.minParticipants} مشتركين`, 910, 375);
    } else {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "22px sans-serif";
      ctx.fillText(`• أجب عن السؤال لتدخل السحب على الجائزة`, 910, 265);
      ctx.fillText(`• شرط الدخول: متابعة صفحتنا ومشاركة المسابقة`, 910, 310);

      ctx.fillStyle = "#34d399";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText(`📣 شارك المسابقة واكسب الجائزة مجاناً!`, 910, 375);
    }

    if (imgSrc) {
      const img = new Image();
      img.onload = () => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(boxX, boxY, boxW, boxH);
        ctx.clip();

        const scale = imgZoom / 100;
        const drawW = boxW * scale;
        const drawH = boxH * scale;
        const drawX = boxX + (boxW - drawW) / 2 + imgPosX;
        const drawY = boxY + (boxH - drawH) / 2 + imgPosY;

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();

        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 4;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        if (activeTab === "raffles") updateRaffle("banner_image_url", dataUrl);
        else updateTrivia("banner_image_url", dataUrl);

        toast.success("تم توليد البانر وتطبيق الزووم المختار بنجاح!");
      };
      img.src = imgSrc;
    } else {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      if (activeTab === "raffles") updateRaffle("banner_image_url", dataUrl);
      else updateTrivia("banner_image_url", dataUrl);

      toast.success("تم توليد البانر بنجاح!");
    }
  };

  const saveRaffleForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!raffle.title.trim()) return toast.error("يرجى إدخال اسم السحب");
    if (!raffle.ends_at) return toast.error("حدد موعد انتهاء السحب");

    const payload = {
      ...(editingRaffle ? { id: editingRaffle.id } : {}),
      title: raffle.title,
      description: raffle.description,
      banner_image_url: raffle.banner_image_url,
      prize_name: raffle.prize_name,
      prize_image_url: raffle.prize_image_url,
      prize_description: raffle.prize_description,
      min_purchase_amount: Number(raffle.min_purchase_amount) || 0,
      ends_at: raffle.ends_at,
      rules: raffle.rules_config
    };

    setBusy("save_raffle");
    try {
      await (savePurchaseRaffle as any)(payload);
      toast.success(editingRaffle ? "تم تعديل السحب بنجاح" : "تم إطلاق سحب المشتريات بنجاح!");
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
    if (!trivia.title.trim()) return toast.error("أدخل عنوان المسابقة");
    if (!trivia.question.trim()) return toast.error("أدخل سؤال المسابقة");
    if (trivia.options.some((o) => !o.trim())) return toast.error("يرجى ملء جميع الخيارات الأربعة");
    if (!trivia.ends_at) return toast.error("حدد موعد انتهاء المسابقة");

    const payload = {
      ...(editingTrivia ? { id: editingTrivia.id } : {}),
      title: trivia.title,
      question: trivia.question,
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
      await (saveTriviaContest as any)(payload);
      toast.success(editingTrivia ? "تم تعديل المسابقة بنجاح" : "تم نشر المسابقة بنجاح!");
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
  const currentBannerImg = activeTab === "raffles" ? raffle.banner_image_url : trivia.banner_image_url;

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

        {/* أزرار التبديل بين السحوبات والمسابقات */}
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

      <canvas ref={canvasRef} className="hidden" />

      <div className="max-w-4xl mx-auto p-4 space-y-6 mt-2">
        {error && <div className="p-3 bg-red-950/80 border border-red-700 text-red-200 rounded-xl text-sm">{error}</div>}

        {/* محرر الصور المشترك والزووم 400% */}
        <section className="bg-slate-800/90 rounded-2xl border border-indigo-500/30 p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
            <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4" /> صورة الجائزة والتحكم في الزووم (100% - 400%)
            </label>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="border-slate-700 text-slate-200 hover:bg-slate-700 text-xs"
            >
              <Upload className="h-3.5 w-3.5 ml-1 text-blue-400" /> اختيار صورة من المعرض
            </Button>
          </div>

          {currentPrizeImg ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative h-44 rounded-xl border border-slate-700 bg-slate-950 flex items-center justify-center overflow-hidden">
                <img 
                  src={currentPrizeImg} 
                  alt="معاينة" 
                  style={{
                    transform: `scale(${imgZoom / 100}) translate(${imgPosX / 2}px, ${imgPosY / 2}px)`,
                    transition: "transform 0.1s ease"
                  }}
                  className="max-h-full object-contain" 
                />
                <button
                  type="button"
                  onClick={() => activeTab === "raffles" ? updateRaffle("prize_image_url", "") : updateTrivia("prize_image_url", "")}
                  className="absolute top-2 left-2 p-1.5 bg-red-600/80 text-white rounded-full hover:bg-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300">تكبير الصورة (Zoom)</span>
                    <span className="font-bold text-amber-400">{imgZoom}%</span>
                  </div>
                  <input 
                    type="range" min="100" max="400" step="5" value={imgZoom} 
                    onChange={(e) => setImgZoom(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300">تحريك أفقي (يمين / يسار)</span>
                    <span className="text-sky-400">{imgPosX}px</span>
                  </div>
                  <input 
                    type="range" min="-150" max="150" value={imgPosX} 
                    onChange={(e) => setImgPosX(Number(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300">تحريك رأسي (فوق / تحت)</span>
                    <span className="text-emerald-400">{imgPosY}px</span>
                  </div>
                  <input 
                    type="range" min="-150" max="150" value={imgPosY} 
                    onChange={(e) => setImgPosY(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={renderCanvasBanner}
                  className="w-full bg-gradient-to-r from-amber-600 to-amber-500 text-white font-bold h-8 mt-2"
                >
                  <Sparkles className="h-3.5 w-3.5 ml-1" /> توليد البانر بالصورة والبيانات
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-24 border border-dashed border-slate-700 rounded-xl flex items-center justify-center text-xs text-slate-400">
              ارفع صورة الجائزة لتشغيل أداة التكبير حتى 400% وتوليد البانر
            </div>
          )}

          {currentBannerImg && (
            <div className="pt-2 border-t border-slate-800">
              <span className="text-[11px] font-semibold text-emerald-400 block mb-1.5">معاينة البانر الإعلاني المعتمد:</span>
              <div className="h-36 rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
                <img src={currentBannerImg} alt="البانر" className="w-full h-full object-cover" />
              </div>
            </div>
          )}
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
                {busy === "save_raffle" ? "جاري الحفظ..." : (editingRaffle ? "تحديث السحب" : "حفظ وإطلاق سحب المشتريات")}
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

              {/* شروط السوشيال ميديا الإلزامية */}
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
                {busy === "save_trivia" ? "جاري الحفظ..." : (editingTrivia ? "تحديث المسابقة" : "حفظ ونشر المسابقة")}
              </Button>
            </form>
          </section>
        )}

        {/* عرض السحوبات والمسابقات النشطة */}
        <section className="space-y-4">
          <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-400" />
            {activeTab === "raffles" ? "سحوبات المشتريات المفتوحة" : "مسابقات الأسئلة النشطة"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeTab === "raffles" ? (
              adminData?.raffles?.map((item: any) => {
                const targetCount = item.rules?.minParticipants || 10;
                const participantsCount = item.entries_count || 0;
                const isCountMet = participantsCount >= targetCount;
                const isDatePassed = new Date(item.ends_at).getTime() <= clock;
                const canDraw = item.rules?.drawConditionType === "count" ? isCountMet : isDatePassed;

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
                      <p className="text-xs text-slate-300 mt-1">الحد الأدنى: {item.min_purchase_amount} ج.م | التارجت: {targetCount} مشترك</p>

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

                    <div className="flex items-center justify-between pt-2 border-t border-slate-700 text-xs">
                      <span className="text-[11px] text-slate-400">ينتهي: {new Date(item.ends_at).toLocaleDateString("ar-EG")}</span>
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!canDraw && !confirm("تنبيه: لم يكتمل العدد المطلوب بعد لتغطية تكلفة الجائزة! هل أنت متأكد من إجراء السحب؟")) return;
                          setBusy(`draw_${item.id}`);
                          try {
                            const res = await startCommunityDraw("purchase", item.id);
                            setActiveWinnerModal(res);
                            toast.success("تم إجراء السحب وإعلان الفائز بنجاح!");
                          } catch (err: any) {
                            toast.error(errorText(err));
                          } finally {
                            setBusy("");
                          }
                        }}
                        disabled={busy === `draw_${item.id}`}
                        className={`${canDraw ? "bg-emerald-600 hover:bg-emerald-500" : "bg-slate-700 hover:bg-slate-600"} text-white font-bold text-xs`}
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
                    <p className="text-[11px] text-slate-400 mt-1">الإجابات الصحيحة: {contest.correct_count || 0}</p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-700 text-xs">
                    <span className="text-[11px] text-slate-400">ينتهي: {new Date(contest.ends_at).toLocaleDateString("ar-EG")}</span>
                    <Button
                      size="sm"
                      onClick={async () => {
                        setBusy(`draw_${contest.id}`);
                        try {
                          const res = await startCommunityDraw("trivia", contest.id);
                          setActiveWinnerModal(res);
                          toast.success("تم السحب من بين أصحاب الإجابات الصحيحة!");
                        } catch (err: any) {
                          toast.error(errorText(err));
                        } finally {
                          setBusy("");
                        }
                      }}
                      disabled={busy === `draw_${contest.id}`}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
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

      {activeWinnerModal && (
        <CommunityLiveWinner
          draw={activeWinnerModal}
          onClose={() => {
            setActiveWinnerModal(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </main>
  );
}
