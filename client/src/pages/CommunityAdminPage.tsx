import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { 
  ArrowRight, Brain, Gift, Play, RefreshCw, Save, Ticket, Users, 
  Upload, Sparkles, Image as ImageIcon, Trash2, ZoomIn, 
  Move, Target, Calendar, ShieldCheck, Share2, Check 
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

  const [imgZoom, setImgZoom] = useState(100);
  const [imgPosX, setImgPosX] = useState(0);
  const [imgPosY, setImgPosY] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    if (!data?.shopId) return;
    return subscribeManagedCommunityChanges(data.shopId, () => void refresh());
  }, [data?.shopId, refresh]);

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
      toast.success("تم اختيار الصورة، اضبط الموضع واضغط توليد البانر");
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

    ctx.strokeStyle = "rgba(245, 158, 11, 0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 920, 440);

    const boxX = 50;
    const boxY = 60;
    const boxW = 360;
    const boxH = 360;

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 20);
    ctx.fill();

    ctx.textAlign = "right";
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(activeTab === "raffles" ? "🎁 سحب متجر رجوة للمنظفات" : "🧠 مسابقة وتحدي متجر رجوة", 910, 85);

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
      ctx.fillText(`• فرصة سحب إضافية لكل: ${raffle.rules_config.ticketPerAmount} ج.م مشتريات`, 910, 310);

      ctx.fillStyle = "#34d399";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText(`🎯 يبدأ السحب فور اكتمال: ${raffle.rules_config.minParticipants} مشتركين`, 910, 375);
    } else {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "22px sans-serif";
      ctx.fillText(`• أجب عن السؤال لتدخل السحب على الجائزة فوراً`, 910, 265);
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
        ctx.roundRect(boxX, boxY, boxW, boxH, 20);
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
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 20);
        ctx.stroke();

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
      await savePurchaseRaffle(payload as any);
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
      await saveTriviaContest(payload as any);
      toast.success(editingTrivia ? "تم تعديل المسابقة بنجاح" : "تم نشر المسابقة وتفعيل شروط المشاركة بنجاح!");
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

        <section className="bg-slate-800/90 rounded-2xl border border-indigo-500/30 p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
            <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4" /> صورة الجائزة وضبط الزووم (100% - 400%)
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
                    <span className="flex items-center gap-1 text-slate-300"><ZoomIn className="h-3.5 w-3.5 text-amber-400" /> تكبير الصورة (Zoom)</span>
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
                    <span className="flex items-center gap-1 text-slate-300"><Move className="h-3.5 w-3.5 text-sky-400" /> تحريك أفقي (يمين / يسار)</span>
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
                    <span className="flex items-center gap-1 text-slate-300"><Move className="h-3.5 w-3.5 text-emerald-400" /> تحريك رأسي (فوق / تحت)</span>
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
                  <Sparkles className="h-3.5 w-3.5 ml-1" /> تطبيق التعديلات وتوليد البانر
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

        {activeTab === "raffles" && (
          <section className="bg-slate-800/95 rounded-2xl border border-indigo-500/30 p-5 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              
