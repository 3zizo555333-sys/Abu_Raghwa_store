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
  startCommunityDraw, 
  subscribeManagedCommunityChanges 
} from "@/lib/supabase/communityDraws";
import { CommunityLiveWinner } from "@/components/CommunityLiveWinner";

type AdminData = Awaited<ReturnType<typeof listManagedCommunityEvents>>;

interface RaffleRuleConfig {
  minAmount: number;
  ticketPerAmount: number;
  allowMultipleEntries: boolean;
}

const defaultRules: RaffleRuleConfig = {
  minAmount: 100,
  ticketPerAmount: 50,
  allowMultipleEntries: true
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
  return message.includes("duplicate") ? "هذا السحب موجود مسبقاً" : message;
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
  const [activeWinnerModal, setActiveWinnerModal] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
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

  const updateRuleConfig = (key: keyof RaffleRuleConfig, value: any) => {
    setRaffle((current) => ({
      ...current,
      rules_config: { ...current.rules_config, [key]: value },
      ...(key === "minAmount" ? { min_purchase_amount: String(value) } : {})
    }));
  };

  const handleFileUpload = (file: File, type: "prize" | "banner") => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const res = e.target?.result as string;
      if (type === "prize") {
        updateRaffle("prize_image_url", res);
        toast.success("تم اختيار صورة الجائزة بنجاح");
      } else {
        updateRaffle("banner_image_url", res);
        toast.success("تم اختيار بانر السحب بنجاح");
      }
    };
    reader.readAsDataURL(file);
  };

  const generateAutoBanner = () => {
    if (!raffle.prize_name && !raffle.title) {
      toast.error("يرجى كتابة عنوان السحب واسم الجائزة أولاً");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 800;
    canvas.height = 400;

    // خلفية كحلية أنيقة
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, 800, 400);

    // نصوص البانر
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("سحب متجر أبو راغوة 🎁", 750, 60);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 40px sans-serif";
    ctx.fillText(raffle.title || "سحب المشتريات", 750, 130);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(`الجائزة: ${raffle.prize_name || "جائزة مميزة"}`, 750, 190);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "20px sans-serif";
    ctx.fillText(`الحد الأدنى للفاتورة: ${raffle.min_purchase_amount} ج.م`, 750, 250);
    ctx.fillText(`تذكرة إضافية لكل ${raffle.rules_config.ticketPerAmount} ج.م`, 750, 290);

    // دمج صورة الجائزة إن وجدت
    if (raffle.prize_image_url) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 50, 60, 280, 280);
        updateRaffle("banner_image_url", canvas.toDataURL("image/jpeg", 0.9));
        toast.success("تم تصميم البانر ودمج صورة الجائزة بنجاح!");
      };
      img.src = raffle.prize_image_url;
    } else {
      updateRaffle("banner_image_url", canvas.toDataURL("image/jpeg", 0.9));
      toast.success("تم تصميم البانر التلقائي بنجاح!");
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
      toast.success(editingRaffle ? "تم تعديل السحب بنجاح" : "تم إطلاق السحب بنجاح!");
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
    <main dir="rtl" className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      <header className="bg-slate-900 text-white px-4 py-4 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-slate-300">
              <ArrowRight className="h-5 w-5 ml-1" /> المتجر
            </Button>
            <h1 className="text-lg md:text-xl font-bold text-amber-400 flex items-center gap-2">
              <Gift className="h-5 w-5" /> إدارة سحوبات المتجر
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)} className="text-xs bg-slate-800 border-slate-700">
            <RefreshCw className="h-3.5 w-3.5 ml-1" /> تحديث
          </Button>
        </div>
      </header>

      <canvas ref={canvasRef} className="hidden" />

      <div className="max-w-4xl mx-auto p-4 space-y-6 mt-2">
        {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}

        <section className="bg-white rounded-2xl border border-amber-200 p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Ticket className="h-5 w-5 text-amber-500" />
              {editingRaffle ? "تعديل السحب" : "إنشاء سحب مشتريات جديد"}
            </h2>
            {editingRaffle && (
              <Button variant="ghost" size="sm" onClick={() => { setEditingRaffle(null); setRaffle(blankRaffle()); }}>
                إلغاء
              </Button>
            )}
          </div>

          <form onSubmit={saveRaffleForm} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-700">عنوان السحب *</label>
                <Input
                  placeholder="مثال: سحب العيد الأكبر"
                  value={raffle.title}
                  onChange={(e) => updateRaffle("title", e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-700">اسم الجائزة *</label>
                <Input
                  placeholder="مثال: غسالة أوتوماتيك / بوكس منظفات رجوة"
                  value={raffle.prize_name}
                  onChange={(e) => updateRaffle("prize_name", e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-slate-700">تفاصيل ووصف السحب</label>
              <Textarea
                placeholder="اكتب رسالة للعملاء عن طريقة استلام الجائزة وشروطها..."
                value={raffle.description}
                onChange={(e) => updateRaffle("description", e.target.value)}
                rows={2}
              />
            </div>

            {/* أدوات اختيار وتوليد الصور */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              {/* صورة الجائزة */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <ImageIcon className="h-4 w-4 text-amber-500" /> صورة الجائزة
                </label>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "prize")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full bg-white mb-2"
                >
                  <Upload className="h-4 w-4 ml-1.5 text-blue-500" /> اختيار صورة للجائزة
                </Button>

                {raffle.prize_image_url ? (
                  <div className="relative h-32 rounded-lg border bg-white flex items-center justify-center overflow-hidden">
                    <img src={raffle.prize_image_url} alt="الجائزة" className="max-h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => updateRaffle("prize_image_url", "")}
                      className="absolute top-2 left-2 p-1 bg-red-600 text-white rounded-full"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-32 rounded-lg border border-dashed flex items-center justify-center text-xs text-slate-400">
                    لم يتم تحديد صورة
                  </div>
                )}
              </div>

              {/* بانر السحب */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-indigo-500" /> بانر السحب
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    onClick={generateAutoBanner}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-7 px-2"
                  >
                    توليد بانر تلقائي
                  </Button>
                </div>

                <input
                  type="file"
                  accept="image/*"
                  ref={bannerInputRef}
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "banner")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => bannerInputRef.current?.click()}
                  className="w-full bg-white mb-2"
                >
                  <Upload className="h-4 w-4 ml-1.5 text-indigo-500" /> رفع بانر مخصص
                </Button>

                {raffle.banner_image_url ? (
                  <div className="relative h-32 rounded-lg border bg-white flex items-center justify-center overflow-hidden">
                    <img src={raffle.banner_image_url} alt="بانر" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => updateRaffle("banner_image_url", "")}
                      className="absolute top-2 left-2 p-1 bg-red-600 text-white rounded-full"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-32 rounded-lg border border-dashed flex items-center justify-center text-xs text-slate-400">
                    اضغط "توليد بانر تلقائي" لتصميمه فوراً
                  </div>
                )}
              </div>
            </div>

            {/* شروط الدخول السلسة بدون JSON */}
            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1 text-slate-700">الحد الأدنى للفاتورة (ج.م) *</label>
                <Input
                  type="number"
                  min="1"
                  value={raffle.rules_config.minAmount}
                  onChange={(e) => updateRuleConfig("minAmount", Number(e.target.value))}
                  className="bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 text-slate-700">تذكرة إضافية لكل (ج.م)</label>
                <Input
                  type="number"
                  min="1"
                  value={raffle.rules_config.ticketPerAmount}
                  onChange={(e) => updateRuleConfig("ticketPerAmount", Number(e.target.value))}
                  className="bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 text-slate-700">تاريخ ووقت انتهاء السحب *</label>
                <Input
                  type="datetime-local"
                  value={toLocalInput(raffle.ends_at)}
                  onChange={(e) => updateRaffle("ends_at", toIso(e.target.value))}
                  className="bg-white"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy === "save_raffle"}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5"
            >
              <Save className="h-4 w-4 ml-2" />
              {busy === "save_raffle" ? "جاري الحفظ..." : (editingRaffle ? "تحديث السحب" : "إنشاء وحفظ السحب")}
            </Button>
          </form>
        </section>

        {/* قائمة السحوبات */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-600" /> السحوبات الحالية
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data?.raffles?.map((item: any) => (
              <div key={item.id} className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
                <div>
                  <h3 className="font-bold text-slate-800">{item.title}</h3>
                  <p className="text-xs text-amber-600 font-semibold mt-1">🎁 {item.prize_name}</p>
                  <p className="text-xs text-slate-500 mt-1">الحد الأدنى: {item.min_purchase_amount} ج.م</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t text-xs">
                  <span className="text-slate-400">ينتهي: {new Date(item.ends_at).toLocaleDateString("ar-EG")}</span>
                  <Button
                    size="sm"
                    onClick={async () => {
                      setBusy(`draw_${item.id}`);
                      try {
                        const res = await startCommunityDraw("purchase", item.id);
                        setActiveWinnerModal(res);
                        toast.success("تم السحب بنجاح!");
                      } catch (err: any) {
                        toast.error(errorText(err));
                      } finally {
                        setBusy("");
                      }
                    }}
                    disabled={busy === `draw_${item.id}`}
                    className="bg-slate-900 text-white hover:bg-slate-800"
                  >
                    <Play className="h-3.5 w-3.5 ml-1" /> سحب الفائز
                  </Button>
                </div>
              </div>
            ))}
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
