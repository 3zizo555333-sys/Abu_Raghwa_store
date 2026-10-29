import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { 
  ArrowRight, Brain, Gift, Play, RefreshCw, Save, Ticket, Users, 
  Upload, Camera, Sparkles, Image as ImageIcon, CheckCircle, Trash2 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  completeCommunityDraw, 
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
  eligibleCategory: string;
}

const defaultRules: RaffleRuleConfig = {
  minAmount: 100,
  ticketPerAmount: 50,
  allowMultipleEntries: true,
  eligibleCategory: "all"
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
  rules_config: { ...defaultRules }
});

const blankTrivia = () => ({
  title: "",
  question: "",
  options: ["", "", "", ""],
  correct_option_index: "0",
  prize_title: "",
  prize_image_url: "",
  ends_at: toIso(new Date(Date.now() + 2 * 86400000))
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
  return message.includes("duplicate") ? "هذا العنصر مكرر مسبقاً" : message;
}

export default function CommunityAdminPage() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [editingRaffle, setEditingRaffle] = useState<{ id: string } | null>(null);
  const [raffle, setRaffle] = useState(blankRaffle());
  const [editingTrivia, setEditingTrivia] = useState<{ id: string } | null>(null);
  const [trivia, setTrivia] = useState(blankTrivia());
  const [activeWinnerModal, setActiveWinnerModal] = useState<any | null>(null);

  const prizeInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const bannerCanvasRef = useRef<HTMLCanvasElement>(null);

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

  const updateRuleConfig = (key: keyof RaffleRuleConfig, value: any) => {
    setRaffle((current) => ({
      ...current,
      rules_config: { ...current.rules_config, [key]: value },
      ...(key === "minAmount" ? { min_purchase_amount: String(value) } : {})
    }));
  };

  const handleImageFile = (file: File, target: "prize" | "banner") => {
    if (!file.type.startsWith("image/")) {
      toast.error("يرجى اختيار ملف صورة صالح");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (target === "prize") {
        updateRaffle("prize_image_url", result);
        toast.success("تم تحميل صورة الجائزة بنجاح");
      } else {
        updateRaffle("banner_image_url", result);
        toast.success("تم تحميل صورة البانر بنجاح");
      }
    };
    reader.readAsDataURL(file);
  };

  const generateAutoBanner = () => {
    if (!raffle.prize_name && !raffle.title) {
      toast.error("يرجى إدخال عنوان السحب أو اسم الجائزة أولاً لتوليد البانر");
      return;
    }

    const canvas = bannerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 900;
    canvas.height = 450;

    const gradient = ctx.createLinearGradient(0, 0, 900, 450);
    gradient.addColorStop(0, "#0f172a");
    gradient.addColorStop(0.5, "#1e1b4b");
    gradient.addColorStop(1, "#31104b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 900, 450);

    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.beginPath();
    ctx.arc(800, 50, 180, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(100, 400, 220, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("🎁 سحب متجر أبو راغوة الحصري", 850, 60);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px sans-serif";
    ctx.fillText(raffle.title || "سحب المشتريات الكبير", 850, 130);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText(`الجائزة: ${raffle.prize_name || "جائزة قيمة"}`, 850, 190);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "24px sans-serif";
    ctx.fillText(`• الدخول تلقائي لكل فاتورة بقيمة ${raffle.min_purchase_amount} ج.م أو أكثر`, 850, 250);
    ctx.fillText(`• فرصة سحب إضافية لكل ${raffle.rules_config.ticketPerAmount} ج.م مشتريات`, 850, 290);

    if (raffle.prize_image_url) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(50, 75, 300, 300, 24);
        ctx.clip();
        ctx.drawImage(img, 50, 75, 300, 300);
        ctx.restore();
        
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.roundRect(50, 75, 300, 300, 24);
        ctx.stroke();

        const bannerDataUrl = canvas.toDataURL("image/jpeg", 0.9);
        updateRaffle("banner_image_url", bannerDataUrl);
        toast.success("✨ تم إنشاء وتطبيق البانر التلقائي بنجاح!");
      };
      img.src = raffle.prize_image_url;
    } else {
      const bannerDataUrl = canvas.toDataURL("image/jpeg", 0.9);
      updateRaffle("banner_image_url", bannerDataUrl);
      toast.success("✨ تم إنشاء وتطبيق البانر التلقائي بنجاح!");
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
      toast.success(editingRaffle ? "تم تعديل السحب بنجاح" : "تم إنشاء سحب المشتريات وتفعيله بنجاح!");
      setEditingRaffle(null);
      setRaffle(blankRaffle());
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast.error(errorText(err));
    } finally {
      setBusy("");
    }
  };

  return (
    <main dir="rtl" className="min-h-screen bg-slate-900 text-slate-100 pb-16">
      <header className="bg-gradient-to-l from-slate-950 via-indigo-950 to-blue-950 border-b border-indigo-900/50 px-4 py-5 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-slate-300 hover:text-white">
              <ArrowRight className="h-5 w-5 ml-1" /> المتجر
            </Button>
            <h1 className="text-xl md:text-2xl font-black text-amber-400 flex items-center gap-2">
              <Gift className="h-6 w-6 text-amber-400" /> إدارة السحوبات والمسابقات
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)} className="border-indigo-700 text-indigo-200">
            <RefreshCw className="h-4 w-4 ml-1" /> تحديث
          </Button>
        </div>
      </header>

      <canvas ref={bannerCanvasRef} className="hidden" />

      <div className="max-w-6xl mx-auto p-4 space-y-8 mt-4">
        {error && (
          <div className="p-4 rounded-xl bg-red-950/80 border border-red-700 text-red-200 text-sm">
            {error}
          </div>
        )}

        <section className="bg-slate-800/90 rounded-2xl border border-indigo-500/30 p-5 md:p-6 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-slate-700 pb-4 mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                <Ticket className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {editingRaffle ? "تعديل سحب المشتريات" : "إنشاء سحب مشتريات جديد"}
                </h2>
                <p className="text-xs text-slate-400">إعداد جوائز السحب وربطها بنظام الفواتير التلقائي</p>
              </div>
            </div>
            {editingRaffle && (
              <Button variant="ghost" size="sm" onClick={() => { setEditingRaffle(null); setRaffle(blankRaffle()); }}>
                إلغاء التعديل
              </Button>
            )}
          </div>

          <form onSubmit={saveRaffleForm} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">عنوان السحب *</label>
                <Input
                  placeholder="مثال: سحب العودة للمدارس / سحب الجمعة الكبرى"
                  value={raffle.title}
                  onChange={(e) => updateRaffle("title", e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">اسم الجائزة الأساسية *</label>
                <Input
                  placeholder="مثال: طقم منظفات فاخر / شاشة 43 بوصة"
                  value={raffle.prize_name}
                  onChange={(e) => updateRaffle("prize_name", e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">وصف السحب والتفاصيل</label>
              <Textarea
                placeholder="اكتب رسالة تشجيعية للزبائن عن شروط وطريقة استلام الجائزة..."
                value={raffle.description}
                onChange={(e) => updateRaffle("description", e.target.value)}
                className="bg-slate-900 border-slate-700 text-white"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl bg-slate-900/60 border border-slate-700">
              <div>
                <label className="block text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                  <ImageIcon className="h-4 w-4" /> صورة الجائزة
                </label>
                <input
                  type="file"
                  accept="image/*"
                  ref={prizeInputRef}
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0], "prize")}
                />
                <div className="flex gap-2 mb-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => prizeInputRef.current?.click()}
                    className="flex-1 border-slate-700 text-slate-200 hover:bg-slate-800"
                  >
                    <Upload className="h-4 w-4 ml-1.5 text-blue-400" /> اختيار من المعرض
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (prizeInputRef.current) {
                        prizeInputRef.current.capture = "environment";
                        prizeInputRef.current.click();
                      }
                    }}
                    className="border-slate-700 text-slate-200 hover:bg-slate-800"
                  >
                    <Camera className="h-4 w-4 text-emerald-400" />
                  </Button>
                </div>

                {raffle.prize_image_url ? (
                  <div className="relative rounded-lg overflow-hidden border border-slate-700 h-36 bg-slate-950 flex items-center justify-center">
                    <img src={raffle.prize_image_url} alt="الجائزة" className="max-h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => updateRaffle("prize_image_url", "")}
                      className="absolute top-2 left-2 p-1 bg-red-600/80 rounded-full hover:bg-red-600 text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="h-36 border border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-500 text-xs">
                    لم يتم اختيار صورة للجائزة
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-sky-400 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" /> بانر السحب الترويجي
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    onClick={generateAutoBanner}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-7 px-2.5"
                  >
                    <Sparkles className="h-3 w-3 ml-1 text-amber-300" /> إنشاء بانر تلقائي
                  </Button>
                </div>

                <input
                  type="file"
                  accept="image/*"
                  ref={bannerInputRef}
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0], "banner")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => bannerInputRef.current?.click()}
                  className="w-full mb-3 border-slate-700 text-slate-200 hover:bg-slate-800"
                >
                  <Upload className="h-4 w-4 ml-1.5 text-sky-400" /> رفع بانر مخصص من الجهاز
                </Button>

                {raffle.banner_image_url ? (
                  <div className="relative rounded-lg overflow-hidden border border-slate-700 h-36 bg-slate-950 flex items-center justify-center">
                    <img src={raffle.banner_image_url} alt="بانر السحب" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => updateRaffle("banner_image_url", "")}
                      className="absolute top-2 left-2 p-1 bg-red-600/80 rounded-full hover:bg-red-600 text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="h-36 border border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-500 text-xs">
                    اضغط "إنشاء بانر تلقائي" لتصميمه فوراً
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/90 border border-indigo-950 space-y-4">
              <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> شروط التأهل التلقائي للسحب (حاسبة التذاكر)
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">الحد الأدنى للفاتورة (ج.م) *</label>
                  <Input
                    type="number"
                    min="1"
                    value={raffle.rules_config.minAmount}
                    onChange={(e) => updateRuleConfig("minAmount", Number(e.target.value))}
                    className="bg-slate-950 border-slate-700 text-white"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">أي فاتورة بهذا المبلغ تدخل السحب فوراً</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">تذكرة إضافية لكل مبلغ (ج.م)</label>
                  <Input
                    type="number"
                    min="1"
                    value={raffle.rules_config.ticketPerAmount}
                    onChange={(e) => updateRuleConfig("ticketPerAmount", Number(e.target.value))}
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">كل ما زادت مشتريات العميل زادت فرصه</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">موعد نهاية السحب *</label>
                  <Input
                    type="datetime-local"
                    value={toLocalInput(raffle.ends_at)}
                    onChange={(e) => updateRaffle("ends_at", toIso(e.target.value))}
                    className="bg-slate-950 border-slate-700 text-white"
                    required
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy === "save_raffle"}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-2.5 text-base shadow-lg"
            >
              <Save className="h-5 w-5 ml-2" />
              {busy === "save_raffle" ? "جاري الحفظ والتفعيل..." : (editingRaffle ? "حفظ التعديلات" : "حفظ وإطلاق السحب رسمياً")}
            </Button>
          </form>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-400" /> قائمة سحوبات المتجر الحالية
          </
