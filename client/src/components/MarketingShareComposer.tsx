import { useEffect, useMemo, useState } from "react";
import { Copy, Facebook, Instagram, MessageCircle, RefreshCw, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type MarketingPost = {
  kind: "product" | "offer" | "recipe";
  title: string;
  price: number;
  unit?: string;
  oldPrice?: number;
  discountAmount?: number;
  discountPercent?: number;
  description?: string;
  link?: string;
  imageUrl?: string;
};

type PostTone = "exciting" | "elegant" | "quick" | "friendly";

const TONES: Array<{ value: PostTone; label: string; intro: (headline: string) => string; callToAction: string }> = [
  { value: "exciting", label: "مشوق وحماسي", intro: (headline) => `مستعد لتجربة فرق يبان من أول استخدام؟ ✨\n${headline} وصل علشان يضيف لمستك المميزة.`, callToAction: "الكميات محدودة، اطلبه دلوقتي قبل ما يخلص!" },
  { value: "elegant", label: "شيك واحترافي", intro: (headline) => `اختيار مرتب للي يحب الجودة والتفاصيل.\n${headline} معمول علشان يديك تجربة تستاهلها.`, callToAction: "راسلنا الآن لمعرفة التوفر والطلب." },
  { value: "quick", label: "قصير وسريع", intro: (headline) => `${headline} — اختيار عملي وسعر مميز من أبو رغوة.`, callToAction: "اطلبه الآن." },
  { value: "friendly", label: "ودود ومصري", intro: (headline) => `عاوز حاجة تفرّق معاك من أول مرة؟\n${headline} جاهز ليك من أبو رغوة.`, callToAction: "ابعتلنا رسالة وخليه عندك بسرعة." },
];

const splitBenefits = (text: string) => text.split(/\n|،|,|•|-/).map(item => item.trim()).filter(Boolean).slice(0, 5);

const DEFAULT_BENEFITS: Record<MarketingPost["kind"], string[]> = {
  product: ["اختيار عملي للاستخدام اليومي", "قيمة واضحة مقابل السعر", "متاح من أبو رغوة حسب المخزون"],
  offer: ["فرصة للاستفادة بسعر أفضل", "تفاصيل العرض واضحة قبل الطلب", "العرض متاح خلال المدة المحددة"],
  recipe: ["تركيبة مجهزة بعناية", "مناسبة لمن يبحث عن نتيجة عملية", "اسألنا عن التفاصيل وطريقة الاستخدام"],
};

export const buildProfessionalPost = (post: MarketingPost, headline: string, benefitsText: string, tone: PostTone, variation = 0) => {
  const selectedTone = TONES.find(item => item.value === tone) || TONES[0];
  const enteredBenefits = splitBenefits([post.description, benefitsText].filter(Boolean).join("\n"));
  const defaults = DEFAULT_BENEFITS[post.kind];
  const benefits = enteredBenefits.length ? enteredBenefits : defaults;
  const safeHeadline = headline.trim() || post.title;
  const priceLine = `💰 السعر: ${Number(post.price || 0).toLocaleString("ar-EG")} ج.م${post.unit ? ` / ${post.unit}` : ""}`;
  const oldPriceLine = post.oldPrice && post.oldPrice > post.price ? `\n🏷️ بدل ${Number(post.oldPrice).toLocaleString("ar-EG")} ج.م` : "";
  const discountLine = post.discountAmount || post.discountPercent ? `\n🔥 وفر ${Number(post.discountAmount || 0).toLocaleString("ar-EG")} ج.م${post.discountPercent ? ` — خصم ${post.discountPercent}%` : ""}` : "";
  const benefitsBlock = `\n\n✅ ليه هتحبه؟\n${benefits.map(item => `• ${item}`).join("\n")}`;
  const kindLabel = post.kind === "offer" ? "العرض" : post.kind === "recipe" ? "التركيبة" : "المنتج";
  const openings = [
    `لو بتدور على ${kindLabel} يستاهل التجربة، خلّي اختيارك يبدأ من هنا.`,
    `اختيار جديد يستحق مكانه في قائمة المفضلة عندك — شوف التفاصيل وقرر بنفسك.`,
    `الجودة تبدأ من اختيار التفاصيل الصح، و${safeHeadline} جاهز ليكون اختيارك القادم.`,
  ];
  const closing = [
    "📩 ابعتلنا رسالة الآن وسنساعدك في معرفة التوفر والطلب.",
    "⏳ لا تفوّت الفرصة؛ اسألنا اليوم عن المتاح وطريقة الحصول عليه.",
    "🛍️ اطلبه الآن من أبو رغوة وخلي التجربة تبدأ.",
  ];
  const variantOpening = openings[variation % openings.length];
  const variantClosing = closing[variation % closing.length];
  return `🌟 ${safeHeadline}\n\n${variantOpening}\n\n${selectedTone.intro(safeHeadline)}${benefitsBlock}\n\n${priceLine}${oldPriceLine}${discountLine}\n\n📍 متاح الآن من أبو رغوة\n📞 للتواصل والطلب: 01096935599\n${variantClosing}\n${selectedTone.callToAction}\n\n#أبو_رغوة #عروض_أبو_رغوة #اختيارك_الأفضل`;
};

export function MarketingShareButton({ post, compact = false }: { post: MarketingPost; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [headline, setHeadline] = useState(post.title);
  const [benefits, setBenefits] = useState("");
  const [tone, setTone] = useState<PostTone>("exciting");
  const [rewriteVersion, setRewriteVersion] = useState(0);
  const postKey = `${post.kind}-${post.title}-${post.price}-${post.oldPrice || 0}-${post.discountAmount || 0}`;
  const generatedCaption = useMemo(() => buildProfessionalPost(post, headline, benefits, tone, rewriteVersion), [postKey, headline, benefits, tone, rewriteVersion]);
  const [caption, setCaption] = useState(generatedCaption);
  const publicLink = post.link || `${window.location.origin}/catalog`;

  useEffect(() => {
    setHeadline(post.title);
    setBenefits("");
    setTone("exciting");
    setRewriteVersion(0);
  }, [postKey]);

  useEffect(() => setCaption(generatedCaption), [generatedCaption]);

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(`${caption}\n${publicLink}`);
      toast.success("تم نسخ المنشور. الصقه داخل التطبيق الذي تختاره.");
    } catch {
      toast.error("تعذر النسخ التلقائي. انسخ النص من المربع.");
    }
  };

  const shareToPhone = async () => {
    try {
      if (navigator.share) {
        if (post.imageUrl) {
          try {
            const response = await fetch(post.imageUrl);
            const imageBlob = await response.blob();
            const extension = imageBlob.type.includes("png") ? "png" : "jpg";
            const imageFile = new File([imageBlob], `${post.title || "abu-raghwa"}.${extension}`, { type: imageBlob.type || "image/jpeg" });
            if (navigator.canShare?.({ files: [imageFile] })) {
              await navigator.share({ title: headline || post.title, text: caption, url: publicLink, files: [imageFile] });
              return;
            }
          } catch {
            // نكمل بمشاركة النص إذا تعذر تجهيز الصورة على الجهاز.
          }
        }
        await navigator.share({ title: headline || post.title, text: caption, url: publicLink });
        return;
      }
      await copyCaption();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copyCaption();
    }
  };

  const shareToWhatsApp = () => window.location.assign(`whatsapp://send?text=${encodeURIComponent(`${caption}\n${publicLink}`)}`);
  const shareToFacebook = () => {
    const composerUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicLink)}&quote=${encodeURIComponent(caption)}`;
    window.location.assign(`fb://facewebmodal/f?href=${encodeURIComponent(composerUrl)}`);
  };

  return <>
    <Button type="button" size={compact ? "sm" : "default"} variant={compact ? "outline" : "default"} onClick={() => setOpen(true)} className={compact ? "border-violet-200 text-violet-700 hover:bg-violet-50" : "bg-violet-600 text-white hover:bg-violet-700"}>
      <Share2 className="ml-1 h-4 w-4" /> {compact ? "مشاركة" : "صمّم وشارك منشورًا"}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-600" /> صانع بوست إعلاني مشوق</DialogTitle>
          <DialogDescription>اكتب رأس الإعلان والمميزات الحقيقية، ثم اختر الأسلوب؛ البوست يتجدد فورًا ويمكنك تعديل أي كلمة.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-sm font-bold text-slate-700">رأس الإعلان</label><input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="مثال: بوكس برائحة الورد 1 كيلو" className="w-full rounded-xl border border-violet-200 p-3 text-sm" /></div>
            <div><label className="mb-1 block text-sm font-bold text-slate-700">أسلوب البوست</label><select value={tone} onChange={(event) => setTone(event.target.value as PostTone)} className="w-full rounded-xl border border-violet-200 bg-white p-3 text-sm">{TONES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          </div>
          <div><label className="mb-1 block text-sm font-bold text-slate-700">المميزات والمواصفات التي تريد إبرازها</label><textarea value={benefits} onChange={(event) => setBenefits(event.target.value)} placeholder="مثال: رائحة ورد هادئة، مناسب للبيت والمكتب، عبوة اقتصادية، جودة ممتازة" rows={4} className="w-full resize-y rounded-xl border border-violet-200 p-3 text-sm" /></div>
          <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-4 shadow-sm"><div className="mb-3 flex items-center justify-between gap-2"><p className="font-black text-violet-950">معاينة البوست الجاهز للنشر</p><Button type="button" size="sm" variant="outline" onClick={() => { const nextVersion = rewriteVersion + 1; setRewriteVersion(nextVersion); setCaption(buildProfessionalPost(post, headline, benefits, tone, nextVersion)); toast.success("تم إنشاء صياغة جديدة أكثر جذبًا للنشر"); }}><RefreshCw className="ml-1 h-3.5 w-3.5" /> إعادة الصياغة</Button></div>{post.imageUrl && <img src={post.imageUrl} alt={post.title} className="mb-3 h-44 w-full rounded-xl border border-white bg-white object-cover shadow" />}<textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={16} className="w-full resize-y rounded-xl border border-white bg-white/90 p-3 text-sm leading-7 shadow-inner" /></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="button" onClick={shareToWhatsApp} className="bg-green-600 text-white hover:bg-green-700"><MessageCircle className="ml-1 h-4 w-4" /> مشاركة على واتساب</Button>
            <Button type="button" onClick={shareToFacebook} className="bg-blue-600 text-white hover:bg-blue-700"><Facebook className="ml-1 h-4 w-4" /> مشاركة على فيسبوك</Button>
            <Button type="button" onClick={shareToPhone} className="bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white hover:from-fuchsia-700 hover:to-pink-700"><Instagram className="ml-1 h-4 w-4" /> إنستجرام / اختيار تطبيق</Button>
            <Button type="button" variant="outline" onClick={copyCaption}><Copy className="ml-1 h-4 w-4" /> نسخ البوست</Button>
          </div>
          <p className="text-center text-xs text-slate-500">اكتب مزايا حقيقية فقط؛ النص يتغير حسب العنوان والمميزات والأسلوب الذي تختاره، ثم تقدر تعدل الصياغة النهائية بحرية.</p>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
