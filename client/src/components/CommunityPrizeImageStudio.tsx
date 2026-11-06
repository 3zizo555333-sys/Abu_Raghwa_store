import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, ImagePlus, LoaderCircle, Move, Paintbrush, RefreshCcw, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeProductBackground } from "@/lib/productBackgroundRemoval";

type Crop = { x: number; y: number; width: number; height: number };
type BrushMode = "erase" | "restore";
type Props = {
  value?: string | null;
  title: string;
  prizeTitle: string;
  onChange: (dataUrl: string) => void;
  onBannerChange: (dataUrl: string) => void;
};

const initialCrop: Crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
const checker = "linear-gradient(45deg,#dbe4ee 25%,transparent 25%),linear-gradient(-45deg,#dbe4ee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#dbe4ee 75%),linear-gradient(-45deg,transparent 75%,#dbe4ee 75%)";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("تعذر فتح صورة الجائزة."));
    image.src = src;
  });
}

function fileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة."));
    reader.readAsDataURL(file);
  });
}

function clampCrop(crop: Crop): Crop {
  const width = Math.max(0.08, Math.min(1, crop.width));
  const height = Math.max(0.08, Math.min(1, crop.height));
  return { width, height, x: Math.max(0, Math.min(1 - width, crop.x)), y: Math.max(0, Math.min(1 - height, crop.y)) };
}

function clampBannerOffset(offset: number, start: number, size: number, stageSize: number) {
  const visibleEdge = 64;
  return Math.max(visibleEdge - start - size, Math.min(stageSize - visibleEdge - start, offset));
}

function drawCheckerboard(context: CanvasRenderingContext2D, width: number, height: number) {
  context.clearRect(0, 0, width, height);
}

export function CommunityPrizeImageStudio({ value, title, prizeTitle, onChange, onBannerChange }: Props) {
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>(initialCrop);
  const [zoom, setZoom] = useState(100);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [brushMode, setBrushMode] = useState<BrushMode | null>(null);
  const [brushSize, setBrushSize] = useState(28);
  const [processing, setProcessing] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const bannerCanvasRef = useRef<HTMLCanvasElement>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceFileRef = useRef<File | null>(null);
  const lastEmittedRef = useRef<string | null>(null);
  const pointerRef = useRef<{ type: "move" | "resize"; handle?: string; startX: number; startY: number; crop: Crop } | null>(null);
  const initializedValue = useRef<string | null>(null);

  useEffect(() => {
    if (!value || initializedValue.current === value || lastEmittedRef.current === value) return;
    initializedValue.current = value;
    void loadImage(value).then(image => { setSource(image); setHasResult(true); }).catch(() => undefined);
  }, [value]);

  const emitBanner = useCallback(() => {
    const preview = previewCanvasRef.current;
    const banner = bannerCanvasRef.current;
    if (!preview || !banner || !hasResult) return;
    banner.width = 1600;
    banner.height = 900;
    const context = banner.getContext("2d");
    if (!context) return;
    const gradient = context.createLinearGradient(0, 0, 1600, 900);
    gradient.addColorStop(0, "#080b16"); gradient.addColorStop(0.55, "#172554"); gradient.addColorStop(1, "#4c1d95");
    context.fillStyle = gradient; context.fillRect(0, 0, 1600, 900);
    context.direction = "rtl"; context.textAlign = "right"; context.fillStyle = "#fff";
    context.font = "900 64px sans-serif"; context.fillText(title || "مسابقة أبو رغوة", 1430, 170);
    context.fillStyle = "#ddd6fe"; context.font = "700 32px sans-serif"; context.fillText(`الجائزة: ${prizeTitle || "هدية قيمة"}`, 1430, 235);
    const drawWidth = 650 * zoom / 100; const drawHeight = 650 * zoom / 100;
    const baseLeft = 425 - drawWidth / 2;
    const baseTop = 450 - drawHeight / 2;
    const left = baseLeft + clampBannerOffset(offsetX, baseLeft, drawWidth, 1600);
    const top = baseTop + clampBannerOffset(offsetY, baseTop, drawHeight, 900);
    context.drawImage(preview, left, top, drawWidth, drawHeight);
    onBannerChange(banner.toDataURL("image/png"));
  }, [hasResult, offsetX, offsetY, onBannerChange, prizeTitle, title, zoom]);

  useEffect(() => { emitBanner(); }, [emitBanner]);

  const drawResult = useCallback((image: HTMLImageElement, nextCrop: Crop) => {
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(image.naturalWidth * nextCrop.width));
    output.height = Math.max(1, Math.round(image.naturalHeight * nextCrop.height));
    const outputContext = output.getContext("2d", { willReadFrequently: true });
    if (!outputContext) return;
    outputContext.clearRect(0, 0, output.width, output.height);
    outputContext.drawImage(image, nextCrop.x * image.naturalWidth, nextCrop.y * image.naturalHeight, output.width, output.height, 0, 0, output.width, output.height);
    processedCanvasRef.current = output;
    const preview = previewCanvasRef.current;
    if (!preview) return;
    preview.width = 900; preview.height = 900;
    const previewContext = preview.getContext("2d");
    if (!previewContext) return;
    drawCheckerboard(previewContext, 900, 900);
    const fit = Math.min(760 / output.width, 760 / output.height);
    previewContext.save();
    previewContext.filter = "drop-shadow(0 20px 22px rgba(0,0,0,.42))";
    previewContext.drawImage(output, (900 - output.width * fit) / 2, (900 - output.height * fit) / 2, output.width * fit, output.height * fit);
    previewContext.restore();
    const dataUrl = preview.toDataURL("image/png");
    lastEmittedRef.current = dataUrl;
    onChange(dataUrl);
    setHasResult(true);
  }, [onChange]);

  useEffect(() => {
    if (source && hasResult && !processedCanvasRef.current) drawResult(source, { x: 0, y: 0, width: 1, height: 1 });
  }, [drawResult, hasResult, source]);

  const cropFileAndRemove = async (file: File, nextCrop: Crop) => {
    setProcessing(true);
    try {
      const image = await loadImage(await fileAsDataUrl(file));
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = Math.max(1, Math.round(image.naturalWidth * nextCrop.width));
      cropCanvas.height = Math.max(1, Math.round(image.naturalHeight * nextCrop.height));
      const cropContext = cropCanvas.getContext("2d");
      if (!cropContext) throw new Error("تعذر تجهيز مساحة القص.");
      cropContext.drawImage(image, nextCrop.x * image.naturalWidth, nextCrop.y * image.naturalHeight, cropCanvas.width, cropCanvas.height, 0, 0, cropCanvas.width, cropCanvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => cropCanvas.toBlob(result => result ? resolve(result) : reject(new Error("تعذر إنشاء صورة القص.")), "image/png"));
      const transparent = await removeProductBackground(new File([blob], "selected-prize.png", { type: "image/png" }));
      const transparentImage = await loadImage(await fileAsDataUrl(transparent));
      sourceFileRef.current = null;
      setSource(transparentImage); setCrop({ x: 0, y: 0, width: 1, height: 1 });
      drawResult(transparentImage, { x: 0, y: 0, width: 1, height: 1 });
      toast.success("تم تفريغ الجزء المحدد بخلفية شفافة تماماً.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تفريغ العنصر المحدد."); }
    finally { setProcessing(false); }
  };

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("اختر ملف صورة صالحاً."); return; }
    setHasResult(false); setCrop(initialCrop); setSource(null); processedCanvasRef.current = null; sourceFileRef.current = file;
    void fileAsDataUrl(file).then(loadImage).then(setSource).catch(() => toast.error("تعذر فتح الصورة."));
  };

  const removeSelectedBackground = async () => {
    const file = sourceFileRef.current;
    if (!file && !source) { toast.error("اختر صورة الجائزة أولاً."); return; }
    if (file) return cropFileAndRemove(file, crop);
    setProcessing(true);
    try {
      const canvas = document.createElement("canvas"); canvas.width = source!.naturalWidth; canvas.height = source!.naturalHeight;
      const context = canvas.getContext("2d"); if (!context) throw new Error("تعذر تجهيز الصورة."); context.drawImage(source!, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("تعذر تجهيز الصورة.")), "image/png"));
      const transparent = await removeProductBackground(new File([blob], "selected-prize.png", { type: "image/png" }));
      const image = await loadImage(await fileAsDataUrl(transparent)); sourceFileRef.current = null; setSource(image); drawResult(image, { x: 0, y: 0, width: 1, height: 1 });
      toast.success("تم تفريغ العنصر المحدد بخلفية شفافة تماماً.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تفريغ العنصر المحدد."); }
    finally { setProcessing(false); }
  };

  const paint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!brushMode || !previewCanvasRef.current || !processedCanvasRef.current) return;
    const canvas = previewCanvasRef.current; const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * canvas.width / rect.width; const y = (event.clientY - rect.top) * canvas.height / rect.height;
    const context = canvas.getContext("2d"); if (!context) return;
    context.save(); context.beginPath(); context.arc(x, y, brushSize, 0, Math.PI * 2); context.clip();
    if (brushMode === "erase") { context.globalCompositeOperation = "destination-out"; context.fillStyle = "rgba(0,0,0,1)"; context.fillRect(0, 0, canvas.width, canvas.height); }
    else { context.globalCompositeOperation = "source-over"; const sourceCanvas = processedCanvasRef.current; context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height); }
    context.restore(); const dataUrl = canvas.toDataURL("image/png"); lastEmittedRef.current = dataUrl; onChange(dataUrl); emitBanner();
  };

  const handleCropPointer = (event: React.PointerEvent<HTMLElement>, handle?: string) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { type: handle ? "resize" : "move", handle, startX: event.clientX, startY: event.clientY, crop };
  };
  const moveCropPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current; if (!pointer || !source) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect(); const dx = (event.clientX - pointer.startX) / rect.width; const dy = (event.clientY - pointer.startY) / rect.height; let next = { ...pointer.crop };
    if (pointer.type === "move") next = { ...next, x: next.x + dx, y: next.y + dy };
    else if (pointer.handle?.includes("e")) { next.width = pointer.crop.width + dx; } else if (pointer.handle?.includes("w")) { next.x = pointer.crop.x + dx; next.width = pointer.crop.width - dx; }
    if (pointer.handle?.includes("s")) next.height = pointer.crop.height + dy; else if (pointer.handle?.includes("n")) { next.y = pointer.crop.y + dy; next.height = pointer.crop.height - dy; }
    setCrop(clampCrop(next));
  };

  return <section className="space-y-3 rounded-2xl border border-indigo-500/30 bg-slate-800/90 p-4 shadow-xl" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="flex items-center gap-2 text-sm font-black text-amber-300"><ImagePlus className="h-4 w-4" />صورة الجائزة وتفريغ الخلفية</p><p className="mt-1 text-xs text-slate-300">قم بتحديد العنصر المراد الاحتفاظ به وتفريغه</p></div><label className="cursor-pointer rounded-lg border border-indigo-400/50 px-3 py-2 text-xs font-bold text-indigo-100"><Upload className="ml-1 inline h-4 w-4" /> اختيار صورة<input type="file" accept="image/*" className="hidden" disabled={processing} onChange={event => { chooseFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label></div>
    {source && !hasResult && <div className="relative mx-auto max-h-[420px] max-w-2xl overflow-hidden rounded-xl bg-slate-950 p-2 touch-none" style={{ touchAction: "none" }} onPointerMove={moveCropPointer} onPointerUp={event => { event.preventDefault(); pointerRef.current = null; }} onPointerCancel={event => { event.preventDefault(); pointerRef.current = null; }}><img src={source.src} alt="حدد المنتج" className="block max-h-[390px] w-full object-contain" /><div className="absolute border-2 border-orange-400 bg-orange-400/10 shadow-[0_0_0_9999px_rgba(2,6,23,.62)] touch-none" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%`, touchAction: "none" }} onPointerDown={event => handleCropPointer(event)}>{["nw","ne","sw","se"].map(handle => <button key={handle} type="button" aria-label={`تغيير زاوية ${handle}`} className={`absolute h-4 w-4 rounded-full border-2 border-orange-100 bg-orange-500 ${handle.includes("n") ? "-top-2" : "-bottom-2"} ${handle.includes("w") ? "-left-2" : "-right-2"}`} style={{ touchAction: "none" }} onPointerDown={event => { event.stopPropagation(); handleCropPointer(event, handle); }} />)}</div></div>}
    {source && !hasResult && <Button type="button" disabled={processing} onClick={() => void removeSelectedBackground()} className="w-full bg-orange-600 font-black hover:bg-orange-500">{processing ? <><LoaderCircle className="ml-2 h-4 w-4 animate-spin" />جاري تفريغ الجزء المحدد...</> : "تفريغ خلفية الصورة المحددة"}</Button>}
    {hasResult && <><div className="rounded-xl border border-slate-600 p-2" style={{ backgroundImage: checker, backgroundSize: "20px 20px", backgroundPosition: "0 0,0 10px,10px -10px,-10px 0" }}><canvas ref={previewCanvasRef} className="mx-auto h-56 w-56 max-w-full touch-none" onPointerDown={event => { if (brushMode) { event.currentTarget.setPointerCapture(event.pointerId); paint(event); } }} onPointerMove={event => { if (brushMode && event.buttons) paint(event); }} /></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={brushMode === "erase" ? "default" : "outline"} onClick={() => setBrushMode(brushMode === "erase" ? null : "erase")}><Eraser className="ml-1 h-4 w-4" />🖌️ فرشاة مسح يدوي</Button><Button type="button" size="sm" variant={brushMode === "restore" ? "default" : "outline"} onClick={() => setBrushMode(brushMode === "restore" ? null : "restore")}><Paintbrush className="ml-1 h-4 w-4" />🧽 استعادة أجزاء</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setHasResult(false); setCrop(initialCrop); sourceFileRef.current = null; processedCanvasRef.current = null; }}><RefreshCcw className="ml-1 h-4 w-4" />إعادة تحديد</Button></div><label className="block text-xs text-slate-200">حجم الفرشاة {brushSize}px<Input type="range" min="8" max="80" value={brushSize} onChange={event => setBrushSize(Number(event.target.value))} /></label></>}
    <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-slate-200">التكبير {zoom}%<Input type="range" min="100" max="400" step="5" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label><label className="text-xs text-slate-200">التحريك الأفقي {offsetX}px<Input type="range" min="-260" max="260" value={offsetX} onChange={event => setOffsetX(Number(event.target.value))} /></label><label className="text-xs text-slate-200">التحريك الرأسي {offsetY}px<Input type="range" min="-260" max="260" value={offsetY} onChange={event => setOffsetY(Number(event.target.value))} /></label><p className="flex items-center gap-1 text-xs text-slate-400"><Move className="h-4 w-4" /> القيم تنتقل تلقائياً إلى مولد البانر.</p></div>
    {hasResult && <><Button type="button" disabled={processing} onClick={() => void removeSelectedBackground()} className="w-full bg-indigo-600 hover:bg-indigo-500"><Sparkles className="ml-2 h-4 w-4" />إعادة التفريغ بالذكاء الاصطناعي</Button><canvas ref={bannerCanvasRef} className="hidden" /></>}
  </section>;
}
