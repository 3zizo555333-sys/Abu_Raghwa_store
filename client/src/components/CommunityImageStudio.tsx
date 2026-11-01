import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeProductBackground } from "@/lib/productBackgroundRemoval";
import { toast } from "sonner";
import { ImagePlus, LoaderCircle, Move, Sparkles, Upload } from "lucide-react";

const SIZE = 900;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

type Props = {
  label: string;
  value?: string | null;
  onChange: (dataUrl: string) => void;
  help?: string;
  allowBanner?: boolean;
  bannerTitle?: string;
  onBannerChange?: (dataUrl: string) => void;
};

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة."));
    reader.readAsDataURL(file);
  });
}

async function imageFromUrl(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("تعذر فتح الصورة المحددة."));
    image.src = url;
  });
  return image;
}

async function imageFromFile(file: File, removeBackground: boolean): Promise<HTMLImageElement> {
  if (!removeBackground) return imageFromUrl(await readFile(file));
  const transparent = await removeProductBackground(file);
  return imageFromUrl(await readFile(new File([transparent], "transparent.png", { type: transparent.type || "image/png" })));
}

function drawTransparent(canvas: HTMLCanvasElement, image: HTMLImageElement, scale: number, offsetX: number, offsetY: number) {
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, SIZE, SIZE);
  const fit = Math.min((SIZE * 0.72) / image.naturalWidth, (SIZE * 0.72) / image.naturalHeight) * scale;
  const width = image.naturalWidth * fit;
  const height = image.naturalHeight * fit;
  context.drawImage(image, (SIZE - width) / 2 + offsetX, (SIZE - height) / 2 + offsetY, width, height);
}

function drawBanner(canvas: HTMLCanvasElement, image: HTMLImageElement, title: string, scale: number, offsetX: number, offsetY: number) {
  canvas.width = 1600;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) return;
  const gradient = context.createLinearGradient(0, 0, 1600, 900);
  gradient.addColorStop(0, "#090d1f");
  gradient.addColorStop(0.55, "#312e81");
  gradient.addColorStop(1, "#7c3aed");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1600, 900);
  context.fillStyle = "rgba(255,255,255,.08)";
  context.beginPath();
  context.arc(1320, 120, 300, 0, Math.PI * 2);
  context.fill();
  context.direction = "rtl";
  context.textAlign = "right";
  context.fillStyle = "#ffffff";
  context.font = "900 64px sans-serif";
  context.fillText(title || "مسابقة أبو رغوة", 1260, 210);
  context.fillStyle = "#ddd6fe";
  context.font = "700 28px sans-serif";
  context.fillText("شارك واربح مع مجتمع أبو رغوة", 1260, 270);
  const fit = Math.min(620 / image.naturalWidth, 720 / image.naturalHeight) * scale;
  const width = image.naturalWidth * fit;
  const height = image.naturalHeight * fit;
  context.drawImage(image, 180 + offsetX, (900 - height) / 2 + offsetY, width, height);
}

export function CommunityImageStudio({ label, value, onChange, help, allowBanner, bannerTitle, onBannerChange }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [removeBackground, setRemoveBackground] = useState(true);
  const [processing, setProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bannerCanvasRef = useRef<HTMLCanvasElement>(null);
  const initializedValue = useRef<string | null>(null);

  useEffect(() => {
    if (!value || initializedValue.current === value) return;
    initializedValue.current = value;
    void imageFromUrl(value).then(setImage).catch(() => undefined);
  }, [value]);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    drawTransparent(canvasRef.current, image, scale, offsetX, offsetY);
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onChange(dataUrl);
    if (allowBanner && onBannerChange && bannerCanvasRef.current) {
      drawBanner(bannerCanvasRef.current, image, bannerTitle || label, scale, offsetX, offsetY);
      onBannerChange(bannerCanvasRef.current.toDataURL("image/png"));
    }
  }, [image, scale, offsetX, offsetY, allowBanner, bannerTitle, label]);

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) {
      toast.error("اختر صورة صالحة لا تتجاوز 20 MB.");
      return;
    }
    setProcessing(true);
    try {
      setImage(await imageFromFile(file, removeBackground));
      setScale(1);
      setOffsetX(0);
      setOffsetY(0);
      toast.success(removeBackground ? "تم عزل المنتج بخلفية شفافة." : "تم تحميل الصورة.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذرت معالجة الصورة.");
    } finally {
      setProcessing(false);
    }
  };

  const toggleBackgroundRemoval = async (enabled: boolean) => {
    setRemoveBackground(enabled);
    if (!enabled || !value || processing) return;
    setProcessing(true);
    try {
      const response = await fetch(value);
      const file = new File([await response.blob()], "community-image.png", { type: response.headers.get("content-type") || "image/png" });
      setImage(await imageFromFile(file, true));
      toast.success("تم تفريغ الخلفية للصورة الحالية.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تفريغ الخلفية.");
    } finally {
      setProcessing(false);
    }
  };

  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black text-slate-800">{label}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{help || "الصورة تحفظ بصيغة PNG شفافة وتندمج داخل البانر دون إطار مربع."}</p></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-violet-800 ring-1 ring-violet-200"><input type="checkbox" checked={removeBackground} disabled={processing} onChange={event => void toggleBackgroundRemoval(event.target.checked)} /> تفريغ خلفية الصورة</label></div>
    <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-violet-300 bg-white px-3 py-3 text-xs font-black text-violet-800"><Upload className="h-4 w-4" />{processing ? <><LoaderCircle className="h-4 w-4 animate-spin" />جارٍ المعالجة…</> : "اختيار أو رفع صورة"}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={processing} onChange={event => { void chooseFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>
    {image && <><div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-950 p-2"><div className="flex justify-center" style={{ backgroundImage: "linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)", backgroundSize: "18px 18px", backgroundPosition: "0 0,0 9px,9px -9px,-9px 0" }}><canvas ref={canvasRef} className="h-44 w-44 max-w-full" /></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-[11px] font-bold text-slate-600">التكبير {Math.round(scale * 100)}%<Input type="range" min={MIN_SCALE} max={MAX_SCALE} step="0.05" value={scale} onChange={event => setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(event.target.value))))} /></label><label className="text-[11px] font-bold text-slate-600">التحريك الأفقي<Input type="range" min="-260" max="260" step="5" value={offsetX} onChange={event => setOffsetX(Number(event.target.value))} /></label><label className="text-[11px] font-bold text-slate-600">التحريك الرأسي<Input type="range" min="-260" max="260" step="5" value={offsetY} onChange={event => setOffsetY(Number(event.target.value))} /></label><p className="flex items-center gap-1 text-[11px] leading-5 text-slate-500"><Move className="h-4 w-4" /> اضبط الكادر ثم احفظ الصورة المفرغة.</p></div></>}
    {allowBanner && image && <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-2"><p className="mb-2 flex items-center gap-1 text-xs font-black text-indigo-900"><Sparkles className="h-4 w-4" />معاينة بانر Canvas عالي الدقة</p><canvas ref={bannerCanvasRef} className="w-full rounded-lg" /></div>}
    {!image && value && <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500"><ImagePlus className="h-4 w-4" />الصورة الحالية محفوظة، اختر صورة جديدة لتعديلها.</p>}
  </div>;
}
