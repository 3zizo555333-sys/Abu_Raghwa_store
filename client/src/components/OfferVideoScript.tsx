import { useMemo, useState } from "react";
import { Copy, Film, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type OfferVideoScriptButtonProps = { offer: { title: string; offerPrice: number; discountPercent?: number; description?: string; endDate?: string }; compact?: boolean };
type Scene = { seconds: string; visual: string; speech: string; overlay: string };

function buildScenes(offer: OfferVideoScriptButtonProps["offer"], variation: number): Scene[] {
  const endings = ["اطلبه الآن من أبو رغوة", "الكميات محدودة — اسألنا اليوم", "احفظ الرابط واطلب عرضك بسهولة"];
  return [
    { seconds: "0–3 ث", visual: `لقطة قريبة للمنتج «${offer.title}» على رف مضاء داخل المحل`, speech: `بص على العرض ده من أبو رغوة!`, overlay: `عرض حصري: ${offer.title}` },
    { seconds: "3–8 ث", visual: "لقطة يد تلتقط المنتج وتعرض العبوة من الأمام والجانب", speech: offer.description || "اختيار عملي وسعر واضح لفترة محدودة.", overlay: `وفر حتى ${offer.discountPercent || 0}%` },
    { seconds: "8–14 ث", visual: "لقطة سريعة للسعر القديم ثم السعر الجديد مع ابتسامة البائع", speech: `السعر الآن ${Number(offer.offerPrice || 0).toLocaleString("ar-EG")} جنيه فقط.`, overlay: `${offer.offerPrice} ج.م فقط` },
    { seconds: "14–20 ث", visual: "لقطة تمرير على QR العرض ثم لقطة للمنتجات المرتبطة", speech: endings[variation % endings.length], overlay: `ساري حتى ${offer.endDate || "نفاد الكمية"}` },
    { seconds: "20–25 ث", visual: "شعار المحل ولقطة واسعة للرفوف مع حركة كاميرا قصيرة", speech: "محلات أبو رغوة للمنظفات — الجودة اللي تفرق.", overlay: "امسح QR واطلب العرض" },
  ];
}

export function OfferVideoScriptButton({ offer, compact = false }: OfferVideoScriptButtonProps) {
  const [open, setOpen] = useState(false);
  const [variation, setVariation] = useState(0);
  const scenes = useMemo(() => buildScenes(offer, variation), [offer, variation]);
  const copyScript = async () => {
    const text = scenes.map(scene => `${scene.seconds}\nالمشهد: ${scene.visual}\nالكلام: ${scene.speech}\nعلى الشاشة: ${scene.overlay}`).join("\n\n");
    try { await navigator.clipboard.writeText(text); toast.success("تم نسخ سيناريو الفيديو."); } catch { toast.error("تعذر النسخ التلقائي؛ حدد النص وانسخه يدوياً."); }
  };
  return <>
    <Button type="button" size={compact ? "sm" : "default"} variant="outline" onClick={() => setOpen(true)} className="border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50">
      <Film className="ml-1 h-4 w-4" /> سيناريو TikTok / Reels
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Film className="h-5 w-5 text-fuchsia-600" /> مولد سيناريو فيديو 15–30 ثانية</DialogTitle><DialogDescription>خطة تصوير عملية داخل المحل؛ يمكنك تعديل النص قبل نسخه للمصور أو فريق التسويق.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-slate-700">النسخة {variation + 1}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setVariation(value => value + 1)}><RefreshCw className="ml-1 h-3.5 w-3.5" /> نسخة أخرى</Button><Button type="button" size="sm" onClick={copyScript}><Copy className="ml-1 h-3.5 w-3.5" /> نسخ السيناريو</Button></div></div>
          <div className="overflow-hidden rounded-xl border"><div className="grid grid-cols-[70px_1fr_1fr_1fr] bg-fuchsia-50 p-3 text-xs font-black text-fuchsia-950"><span>الزمن</span><span>المشهد البصري</span><span>الكلام</span><span>النص على الشاشة</span></div>{scenes.map((scene, index) => <div key={index} className="grid grid-cols-[70px_1fr_1fr_1fr] gap-2 border-t p-3 text-xs leading-6"><strong>{scene.seconds}</strong><span>{scene.visual}</span><span>{scene.speech}</span><span className="font-bold text-fuchsia-700">{scene.overlay}</span></div>)}</div>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
