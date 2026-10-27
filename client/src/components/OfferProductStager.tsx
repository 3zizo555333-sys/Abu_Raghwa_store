import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { arrangeProductStage } from "@/lib/productStageLayout";
import { removeProductBackground } from "@/lib/productBackgroundRemoval";
import { toast } from "sonner";
import { LoaderCircle, Minus, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";

const STAGE_SIZE = 900;
const MAX_PRODUCTS = 4;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type QueuedPhoto = { id: string; file: File };
type ProductLayer = {
  id: string;
  name: string;
  x: number;
  baseline: number;
  scale: number;
  rotation: number;
  depth: number;
};

type OfferTemplate = {
  id: string;
  title: string;
  promoText?: string;
  bannerCustomImage?: string;
  bgColor?: string;
  bgGradient?: string;
  backgroundMode?: "solid" | "gradient";
  offerPrice: number;
  discountPercent: number;
};

interface OfferProductStagerProps {
  open: boolean;
  offer: OfferTemplate;
  onOpenChange: (open: boolean) => void;
  onSave: (image: File) => Promise<void>;
}

type LayerBounds = { left: number; top: number; width: number; height: number; centerX: number; centerY: number };

function layerBounds(layer: ProductLayer, bitmap: ImageBitmap): LayerBounds {
  const maxWidth = STAGE_SIZE * 0.56 * layer.scale;
  const maxHeight = STAGE_SIZE * 0.78 * layer.scale;
  const fit = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height);
  const width = bitmap.width * fit;
  const height = bitmap.height * fit;
  const centerX = layer.x * STAGE_SIZE;
  const centerY = layer.baseline * STAGE_SIZE - height / 2;
  return { left: centerX - width / 2, top: centerY - height / 2, width, height, centerX, centerY };
}

function drawStage(canvas: HTMLCanvasElement, layers: ProductLayer[], bitmaps: Map<string, ImageBitmap>, selectedId?: string | null) {
  canvas.width = STAGE_SIZE;
  canvas.height = STAGE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, STAGE_SIZE, STAGE_SIZE);

  for (const layer of [...layers].sort((a, b) => a.depth - b.depth)) {
    const bitmap = bitmaps.get(layer.id);
    if (!bitmap) continue;
    const bounds = layerBounds(layer, bitmap);
    context.save();
    context.translate(bounds.centerX, bounds.centerY);
    context.rotate((layer.rotation * Math.PI) / 180);
    context.filter = "drop-shadow(0 22px 22px rgba(0,0,0,0.35))";
    context.drawImage(bitmap, -bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height);
    context.restore();
    if (selectedId === layer.id) {
      context.save();
      context.strokeStyle = "#2563eb";
      context.lineWidth = 3;
      context.setLineDash([10, 8]);
      context.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
      context.restore();
    }
  }
}

function createCanvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("تعذر تصدير صورة المنتجات الشفافة.")), "image/png");
  });
}

async function resizeForMatting(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") throw new Error("المتصفح لا يدعم معالجة الصور؛ حدّث المتصفح ثم أعد المحاولة.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const maxDimension = 1800;
    const ratio = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (ratio === 1) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("تعذر تجهيز الصورة قبل التفريغ.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await createCanvasBlobOfType(canvas, "image/webp", 0.92);
    const outputType = blob.type || "image/webp";
    const extension = outputType === "image/webp" ? ".webp" : ".png";
    return new File([blob], file.name.replace(/\.[^.]+$/, extension), { type: outputType, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

function createCanvasBlobOfType(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("تعذر ضغط الصورة قبل التفريغ.")), type, quality);
  });
}

function templateStyle(offer: OfferTemplate): React.CSSProperties {
  return {
    backgroundColor: offer.bgColor || "#ea580c",
    backgroundImage: offer.bannerCustomImage
      ? `linear-gradient(90deg,rgba(15,23,42,.48),rgba(15,23,42,.12)),url("${offer.bannerCustomImage}")`
      : offer.backgroundMode === "solid" ? undefined : offer.bgGradient || undefined,
    backgroundSize: offer.bannerCustomImage ? "cover" : undefined,
    backgroundPosition: "center",
  };
}

export function OfferProductStager({ open, offer, onOpenChange, onSave }: OfferProductStagerProps) {
  const [queuedPhotos, setQueuedPhotos] = useState<QueuedPhoto[]>([]);
  const [layers, setLayers] = useState<ProductLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapsRef = useRef(new Map<string, ImageBitmap>());
  const dragRef = useRef<{ id: string; startX: number; startY: number; originX: number; originBaseline: number } | null>(null);
  const selectedLayer = useMemo(() => layers.find(layer => layer.id === selectedLayerId) || null, [layers, selectedLayerId]);
  const remainingSlots = Math.max(0, MAX_PRODUCTS - layers.length - queuedPhotos.length);

  useEffect(() => {
    if (!open) return;
    drawStage(canvasRef.current!, layers, bitmapsRef.current, selectedLayerId);
    drawStage(previewCanvasRef.current!, layers, bitmapsRef.current);
  }, [open, layers, selectedLayerId]);

  useEffect(() => () => {
    bitmapsRef.current.forEach(bitmap => bitmap.close());
    bitmapsRef.current.clear();
  }, []);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const incoming = Array.from(fileList);
    const valid = incoming.filter(file => {
      if (!ACCEPTED_TYPES.has(file.type)) {
        toast.error(`صيغة ${file.name} غير مدعومة؛ استخدم JPEG أو PNG أو WebP.`);
        return false;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`حجم ${file.name} أكبر من الحد المسموح (20 MB).`);
        return false;
      }
      return true;
    });
    const capacity = Math.max(0, MAX_PRODUCTS - layers.length - queuedPhotos.length);
    const accepted = valid.slice(0, capacity).map(file => ({ id: crypto.randomUUID(), file }));
    if (valid.length > capacity) toast.warning(`يمكن تجهيز ${MAX_PRODUCTS} منتجات كحد أقصى في كل عرض.`);
    if (accepted.length) setQueuedPhotos(current => [...current, ...accepted]);
  };

  const processPhotos = async () => {
    if (!queuedPhotos.length || isProcessing || isSaving) return;
    setIsProcessing(true);
    setProgress(0);
    setStatusText("تحميل محرك التفريغ والنموذج الخفيف عند الحاجة…");
    const additions: Array<{ layer: ProductLayer; bitmap: ImageBitmap }> = [];
    const processedIds = new Set<string>();
    try {
      for (let index = 0; index < queuedPhotos.length; index += 1) {
        const queued = queuedPhotos[index];
        setStatusText(`تفريغ المنتج ${index + 1} من ${queuedPhotos.length}: ${queued.file.name}`);
        setProgress(0);
        const modelInput = await resizeForMatting(queued.file);
        const transparentPng = await removeProductBackground(modelInput, info => {
          setProgress(Math.max(0, Math.min(100, Math.round(info.progress))));
          if (info.step === "downloading") setStatusText("تحميل نموذج U²-NetP الخفيف (مرة واحدة)…");
        });
        const bitmap = await createImageBitmap(transparentPng);
        additions.push({
          layer: { id: queued.id, name: queued.file.name, x: 0.5, baseline: 0.86, scale: 1, rotation: 0, depth: 0 },
          bitmap,
        });
        processedIds.add(queued.id);
      }
      bitmapsRef.current = new Map(bitmapsRef.current);
      for (const entry of additions) bitmapsRef.current.set(entry.layer.id, entry.bitmap);
      const next = arrangeProductStage([...layers, ...additions.map(entry => entry.layer)]);
      setLayers(next);
      setSelectedLayerId(additions.at(-1)?.layer.id || selectedLayerId);
      setQueuedPhotos(current => current.filter(photo => !processedIds.has(photo.id)));
      setStatusText("تم التفريغ والتجميع. اسحب كل عبوة أو غيّر حجمها عند الحاجة.");
      setProgress(100);
      toast.success(`تم تفريغ وتجهيز ${additions.length} صورة منتج بخلفية شفافة.`);
    } catch (error) {
      if (additions.length) {
        bitmapsRef.current = new Map(bitmapsRef.current);
        for (const entry of additions) bitmapsRef.current.set(entry.layer.id, entry.bitmap);
        setLayers(arrangeProductStage([...layers, ...additions.map(entry => entry.layer)]));
        setQueuedPhotos(current => current.filter(photo => !processedIds.has(photo.id)));
      }
      toast.error(error instanceof Error ? error.message : "تعذرت معالجة الصور؛ أعد المحاولة أو اختر صورة أصغر.");
    } finally {
      setIsProcessing(false);
    }
  };

  const removeLayer = (id: string) => {
    bitmapsRef.current.get(id)?.close();
    bitmapsRef.current.delete(id);
    const next = layers.filter(layer => layer.id !== id);
    setLayers(next);
    if (selectedLayerId === id) setSelectedLayerId(next.at(-1)?.id || null);
  };

  const resetAutoLayout = () => {
    setLayers(arrangeProductStage(layers));
  };

  const selectedPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * STAGE_SIZE,
      y: ((event.clientY - bounds.top) / bounds.height) * STAGE_SIZE,
      width: bounds.width,
      height: bounds.height,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (isProcessing || isSaving) return;
    const point = selectedPoint(event);
    const topFirst = [...layers].sort((a, b) => b.depth - a.depth);
    const hit = topFirst.find(layer => {
      const bitmap = bitmapsRef.current.get(layer.id);
      if (!bitmap) return false;
      const bounds = layerBounds(layer, bitmap);
      return point.x >= bounds.left && point.x <= bounds.left + bounds.width && point.y >= bounds.top && point.y <= bounds.top + bounds.height;
    });
    if (!hit) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedLayerId(hit.id);
    dragRef.current = { id: hit.id, startX: event.clientX, startY: event.clientY, originX: hit.x, originBaseline: hit.baseline };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const deltaX = (event.clientX - drag.startX) / bounds.width;
    const deltaY = (event.clientY - drag.startY) / bounds.height;
    setLayers(current => current.map(layer => layer.id === drag.id ? {
      ...layer,
      x: Math.max(0.13, Math.min(0.87, drag.originX + deltaX)),
      baseline: Math.max(0.34, Math.min(0.95, drag.originBaseline + deltaY)),
    } : layer));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const saveStage = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = STAGE_SIZE;
    canvas.height = STAGE_SIZE;
    drawStage(canvas, layers, bitmapsRef.current);
    setIsSaving(true);
    try {
      setStatusText("تصدير صورة شفافة عالية الجودة ورفعها إلى العرض…");
      const blob = await createCanvasBlob(canvas);
      const image = new File([blob], `offer-${offer.id}-products.png`, { type: "image/png" });
      await onSave(image);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الصورة المركبة. أعد المحاولة.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => { if (!isProcessing && !isSaving) onOpenChange(next); }}>
      <DialogContent dir="rtl" className="max-h-[94vh] max-w-5xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-xl font-black text-slate-900"><Sparkles className="h-5 w-5 text-violet-600" />استوديو تفريغ وتنسيق صور العرض</DialogTitle>
          <DialogDescription>العرض: {offer.title}. تُعالج الصور محلياً على جهازك، ثم يُرفع الكادر النهائي فقط. نموذج التفريغ الخفيف يُحمّل عند أول معالجة ويُخزّن في المتصفح.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="space-y-3">
            <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="font-black text-violet-950">1–4 صور للمنتج</h3><p className="mt-1 text-xs leading-5 text-violet-800">صور الكاميرا أو المعرض، بحد أقصى 20 MB لكل صورة.</p></div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-800">متاح {remainingSlots} صور</span>
              </div>
              <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" disabled={remainingSlots === 0 || isProcessing} onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
              <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={remainingSlots === 0 || isProcessing} onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" disabled={remainingSlots === 0 || isProcessing} onClick={() => cameraInputRef.current?.click()} className="min-h-11 border-violet-200 bg-white text-xs font-black"><Upload className="ml-1 h-4 w-4" />📷 التقط صورة</Button>
                <Button type="button" variant="outline" disabled={remainingSlots === 0 || isProcessing} onClick={() => galleryInputRef.current?.click()} className="min-h-11 border-violet-200 bg-white text-xs font-black"><Upload className="ml-1 h-4 w-4" />اختر حتى 4 صور</Button>
              </div>
              {!!queuedPhotos.length && <ul className="mt-3 space-y-1.5">{queuedPhotos.map((photo, index) => <li key={photo.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs"><span className="min-w-0 truncate font-bold text-slate-700">{index === 0 && !layers.length ? "المنتج الأساسي · " : ""}{photo.file.name}</span><button type="button" aria-label={`إزالة ${photo.file.name}`} onClick={() => setQueuedPhotos(current => current.filter(item => item.id !== photo.id))} className="rounded-full p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></li>)}</ul>}
              <Button type="button" disabled={!queuedPhotos.length || isProcessing || isSaving} onClick={() => void processPhotos()} className="mt-3 min-h-11 w-full bg-violet-700 font-black hover:bg-violet-800">
                {isProcessing ? <LoaderCircle className="ml-2 h-4 w-4 animate-spin" /> : <Sparkles className="ml-2 h-4 w-4" />}
                {isProcessing ? "جاري المعالجة والتجميع…" : "✨ معالجة وتنسيق العرض تلقائياً"}
              </Button>
              {isProcessing && <div className="mt-3"><div className="mb-1 flex justify-between text-[11px] font-bold text-violet-800"><span>{statusText}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${progress}%` }} /></div></div>}
              {!isProcessing && !!statusText && <p className="mt-2 text-center text-xs font-bold text-emerald-700">{statusText}</p>}
            </div>

            {layers.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-slate-900">ضبط التجميع يدوياً</h3><Button type="button" size="sm" variant="outline" disabled={isSaving || isProcessing} onClick={resetAutoLayout} className="text-xs">إعادة الترتيب التلقائي</Button></div>
              <div className="mt-3 flex flex-wrap gap-2">{layers.map((layer, index) => <button key={layer.id} type="button" onClick={() => setSelectedLayerId(layer.id)} className={`max-w-full truncate rounded-full border px-3 py-1.5 text-xs font-black ${selectedLayerId === layer.id ? "border-violet-500 bg-violet-100 text-violet-950" : "border-slate-200 bg-white text-slate-700"}`}>{index === 0 ? "الأساسي · " : ""}{layer.name}</button>)}</div>
              {selectedLayer && <div className="mt-3 rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2"><label htmlFor="product-stage-scale" className="text-xs font-black text-slate-700">حجم الطبقة المحددة: {Math.round(selectedLayer.scale * 100)}%</label><Button type="button" size="sm" variant="ghost" disabled={isSaving || isProcessing} onClick={() => removeLayer(selectedLayer.id)} className="h-8 text-xs text-red-600"><Trash2 className="ml-1 h-4 w-4" />حذف</Button></div>
                <div className="mt-2 flex items-center gap-2"><Minus className="h-4 w-4 text-slate-500" /><Input id="product-stage-scale" type="range" min="0.45" max="1.45" step="0.05" value={selectedLayer.scale} disabled={isSaving || isProcessing} onChange={event => setLayers(current => current.map(layer => layer.id === selectedLayer.id ? { ...layer, scale: Number(event.target.value) } : layer))} className="h-8 cursor-pointer accent-violet-700" /><Plus className="h-4 w-4 text-slate-500" /></div>
                <p className="mt-1 text-[11px] text-slate-500">اسحب العبوة داخل الكادر لتحريكها، واستخدم المنزلق لتكبيرها أو تصغيرها.</p>
              </div>}
            </div>}
          </section>

          <section className="space-y-3">
            <div><h3 className="mb-2 text-sm font-black text-slate-900">المعاينة النهائية فوق قالب العرض</h3>
              <div className="relative h-40 overflow-hidden rounded-2xl text-white shadow-md sm:h-48" style={templateStyle(offer)}>
                <canvas ref={previewCanvasRef} aria-label="معاينة المنتجات الشفافة فوق قالب العرض" className="absolute bottom-0 left-0 z-20 h-full w-[40%] object-contain" />
                <div className="absolute right-3 top-3 z-30 w-[57%] space-y-1 text-right [text-shadow:0_1px_3px_rgba(0,0,0,.75)] sm:right-5 sm:top-5">
                  <p className="line-clamp-2 text-sm font-black sm:text-lg">{offer.title}</p>
                  {offer.promoText && <p className="line-clamp-2 text-[10px] font-bold sm:text-xs">{offer.promoText}</p>}
                  <div className="flex flex-wrap gap-1 pt-1 text-[10px] font-black">{offer.discountPercent > 0 && <span className="rounded-full border border-white/25 bg-amber-300 px-2 py-0.5 text-amber-950">وفر {offer.discountPercent}%</span>}<span className="rounded-full bg-white/90 px-2 py-0.5 text-slate-900">{offer.offerPrice} ج.م</span></div>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-3 bg-gradient-to-t from-white/30 to-transparent" />
              </div>
            </div>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%),linear-gradient(45deg,#f1f5f9_25%,white_25%,white_75%,#f1f5f9_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px] p-2">
              <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[11px] font-bold text-slate-600"><span>كادر شفاف قابل للسحب</span>{layers.length > 0 && <span>{layers.length} / {MAX_PRODUCTS} منتجات</span>}</div>
              <canvas ref={canvasRef} aria-label="كادر ترتيب المنتجات" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} className={`mx-auto block aspect-square w-full max-w-[400px] rounded-xl ${layers.length ? "cursor-move touch-none" : ""}`} />
              {!layers.length && <p className="pb-2 text-center text-xs text-slate-500">أضف الصور ثم اضغط «معالجة وتنسيق العرض تلقائياً».</p>}
            </div>
            <p className="text-[11px] leading-5 text-slate-500">المنتج الأساسي يظهر أمام بقية المنتجات، مع محاذاة القواعد وظلال ناعمة. الخلفية الشطرنجية للمعاينة فقط ولن تدخل في ملف PNG.</p>
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" disabled={isProcessing || isSaving} onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button type="button" disabled={!layers.length || isProcessing || isSaving} onClick={() => void saveStage()} className="min-h-11 bg-emerald-700 font-black hover:bg-emerald-800">
            {isSaving ? <LoaderCircle className="ml-2 h-4 w-4 animate-spin" /> : <Upload className="ml-2 h-4 w-4" />}
            {isSaving ? "جاري حفظ الصورة…" : "حفظ ونشر صورة العرض"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
