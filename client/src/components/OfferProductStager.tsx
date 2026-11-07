import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { arrangeProductStage } from "@/lib/productStageLayout";
import { findAlphaBounds } from "@/lib/alphaBounds";
import { removeProductBackground } from "@/lib/productBackgroundRemoval";
import { toast } from "sonner";
import { LoaderCircle, Minus, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";

const STAGE_SIZE = 1200;
const MAX_PRODUCTS = 4;
const MAX_SCALE_PERCENT = 400;
const MIN_SCALE_PERCENT = 45;
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
  shadow: boolean;
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
  variant?: "offer" | "product";
  onOpenChange: (open: boolean) => void;
  onSave: (image: File) => Promise<void>;
}

type DrawableImage = ImageBitmap | HTMLImageElement;
type LayerBounds = { left: number; top: number; width: number; height: number; centerX: number; centerY: number };

function drawableDimensions(image: DrawableImage) {
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) {
    return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
  }
  return { width: image.width, height: image.height };
}

function closeDrawableImage(image: DrawableImage) {
  if ("close" in image && typeof image.close === "function") {
    image.close();
    return;
  }
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) {
    const source = image.src;
    image.src = "";
    if (source.startsWith("blob:")) URL.revokeObjectURL(source);
  }
}

async function createDrawableImage(blob: Blob): Promise<DrawableImage> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      // Some mobile browsers cannot decode ImageBitmap; continue through an <img> fallback.
    }
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    const source = URL.createObjectURL(blob);
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(source);
      reject(new Error("تعذر فتح إحدى الصور في هذا المتصفح."));
    };
    image.src = source;
  });
}

function layerBounds(layer: ProductLayer, bitmap: DrawableImage): LayerBounds {
  const dimensions = drawableDimensions(bitmap);
  const maxWidth = STAGE_SIZE * 0.56 * layer.scale;
  const maxHeight = STAGE_SIZE * 0.78 * layer.scale;
  const fit = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height);
  const width = dimensions.width * fit;
  const height = dimensions.height * fit;
  const centerX = layer.x * STAGE_SIZE;
  const centerY = layer.baseline * STAGE_SIZE - height / 2;
  return { left: centerX - width / 2, top: centerY - height / 2, width, height, centerX, centerY };
}

function clampLayerToStage(layer: ProductLayer, bitmap: DrawableImage): ProductLayer {
  const bounds = layerBounds(layer, bitmap);
  const centerX = bounds.width >= STAGE_SIZE
    ? STAGE_SIZE / 2
    : Math.max(bounds.width / 2, Math.min(STAGE_SIZE - bounds.width / 2, layer.x * STAGE_SIZE));
  const bottom = bounds.height >= STAGE_SIZE
    ? STAGE_SIZE / 2 + bounds.height / 2
    : Math.max(bounds.height, Math.min(STAGE_SIZE, layer.baseline * STAGE_SIZE));
  return { ...layer, x: centerX / STAGE_SIZE, baseline: bottom / STAGE_SIZE };
}

function shadowForScale(scale: number) {
  const normalized = Math.max(0.45, Math.min(MAX_SCALE_PERCENT / 100, scale));
  const blur = Math.round(Math.min(34, 10 + normalized * 7));
  const offsetY = Math.round(Math.min(30, 8 + normalized * 8));
  const opacity = Math.min(0.42, 0.22 + normalized * 0.05).toFixed(2);
  return `drop-shadow(0 ${offsetY}px ${blur}px rgba(0,0,0,${opacity}))`;
}

function drawStage(canvas: HTMLCanvasElement, layers: ProductLayer[], bitmaps: Map<string, DrawableImage>, selectedId?: string | null) {
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
    context.filter = layer.shadow ? shadowForScale(layer.scale) : "none";
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
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("تعذر تصدير صورة المنتجات الشفافة.")), "image/webp", 0.94);
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

export function OfferProductStager({ open, offer, variant = "offer", onOpenChange, onSave }: OfferProductStagerProps) {
  const [queuedPhotos, setQueuedPhotos] = useState<QueuedPhoto[]>([]);
  const [layers, setLayers] = useState<ProductLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [backgroundRemovalUnavailable, setBackgroundRemovalUnavailable] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapsRef = useRef(new Map<string, DrawableImage>());
  const dragRef = useRef<{ id: string; startX: number; startY: number; originX: number; originBaseline: number } | null>(null);
  const selectedLayer = useMemo(() => layers.find(layer => layer.id === selectedLayerId) || null, [layers, selectedLayerId]);
  const remainingSlots = Math.max(0, MAX_PRODUCTS - layers.length - queuedPhotos.length);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!canvas || !previewCanvas) return;
    drawStage(canvas, layers, bitmapsRef.current, selectedLayerId);
    drawStage(previewCanvas, layers, bitmapsRef.current);
  }, [open, layers, selectedLayerId]);

  useEffect(() => () => {
    bitmapsRef.current.forEach(closeDrawableImage);
    bitmapsRef.current.clear();
  }, []);

  const addFiles = (files: ArrayLike<File> | null) => {
    if (!files?.length) return;
    const incoming = Array.from(files);
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
    const accepted = valid.slice(0, capacity).map(file => ({ id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`, file }));
    if (valid.length > capacity) toast.warning(`يمكن تجهيز ${MAX_PRODUCTS} منتجات كحد أقصى في كل عرض.`);
    if (accepted.length) setQueuedPhotos(current => [...current, ...accepted]);
  };

  const processPhotos = async () => {
    if (!queuedPhotos.length || isProcessing || isSaving) return;
    setIsProcessing(true);
    setProgress(0);
    setStatusText("جاري تجهيز محرك المعالجة وعزل الخلفيات...");
    const additions: Array<{ layer: ProductLayer; bitmap: DrawableImage }> = [];
    const processedIds = new Set<string>();
    try {
      for (let index = 0; index < queuedPhotos.length; index += 1) {
        const queued = queuedPhotos[index];
        setProgress(0);
        setStatusText(`جاري عزل المنتج ${index + 1} من ${queuedPhotos.length}: ${queued.file.name}`);
        let transparentImage: Blob;
        try {
          const modelInput = await resizeForMatting(queued.file);
          transparentImage = await removeProductBackground(modelInput, info => {
            setProgress(Math.max(0, Math.min(100, Math.round(info.progress))));
            if (info.step === "downloading") setStatusText("تحميل نموذج U²-NetP الخفيف (مرة واحدة)…");
          });
        } catch (error) {
          setBackgroundRemovalUnavailable(true);
          throw new Error(`تعذر عزل خلفية «${queued.file.name}». لم تتم إضافة الصورة حتى لا تُحفظ بخلفية مربعة. ${error instanceof Error ? error.message : "تحقق من دعم المتصفح ثم أعد المحاولة."}`);
        }
        const bitmap = await createDrawableImage(transparentImage);
        additions.push({
          layer: { id: queued.id, name: queued.file.name, x: 0.5, baseline: 0.86, scale: 1, rotation: 0, depth: 0, shadow: true },
          bitmap,
        });
        processedIds.add(queued.id);
        setProgress(Math.round(((index + 1) / queuedPhotos.length) * 100));
      }
      bitmapsRef.current = new Map(bitmapsRef.current);
      for (const entry of additions) bitmapsRef.current.set(entry.layer.id, entry.bitmap);
      const next = arrangeProductStage([...layers, ...additions.map(entry => entry.layer)]);
      setLayers(next);
      setSelectedLayerId(additions.at(-1)?.layer.id || selectedLayerId);
      setQueuedPhotos(current => current.filter(photo => !processedIds.has(photo.id)));
      setBackgroundRemovalUnavailable(false);
      setStatusText("تم عزل الخلفية والتجميع. اسحب كل عبوة أو غيّر حجمها عند الحاجة.");
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
    const image = bitmapsRef.current.get(id);
    if (image) closeDrawableImage(image);
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
    event.preventDefault();
    const point = selectedPoint(event);
    const topFirst = [...layers].sort((a, b) => b.depth - a.depth);
    const hit = topFirst.find(layer => {
      const bitmap = bitmapsRef.current.get(layer.id);
      if (!bitmap) return false;
      const bounds = layerBounds(layer, bitmap);
      return point.x >= bounds.left && point.x <= bounds.left + bounds.width && point.y >= bounds.top && point.y <= bounds.top + bounds.height;
    });
    if (!hit) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional on older mobile browsers. */ }
    setSelectedLayerId(hit.id);
    dragRef.current = { id: hit.id, startX: event.clientX, startY: event.clientY, originX: hit.x, originBaseline: hit.baseline };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const deltaX = (event.clientX - drag.startX) / bounds.width;
    const deltaY = (event.clientY - drag.startY) / bounds.height;
    const bitmap = bitmapsRef.current.get(drag.id);
    if (!bitmap) return;
    setLayers(current => current.map(layer => layer.id === drag.id
      ? clampLayerToStage({ ...layer, x: drag.originX + deltaX, baseline: drag.originBaseline + deltaY }, bitmap)
      : layer));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const saveStage = async () => {
    const stageCanvas = document.createElement("canvas");
    stageCanvas.width = STAGE_SIZE;
    stageCanvas.height = STAGE_SIZE;
    drawStage(stageCanvas, layers, bitmapsRef.current);
    setIsSaving(true);
    try {
      setStatusText("قص الفراغات الشفافة وتصدير صورة المنتج…");
      const stageContext = stageCanvas.getContext("2d", { willReadFrequently: true });
      if (!stageContext) throw new Error("تعذر قراءة حدود صورة المنتج.");
      const pixels = stageContext.getImageData(0, 0, STAGE_SIZE, STAGE_SIZE);
      const bounds = findAlphaBounds(pixels.data, STAGE_SIZE, STAGE_SIZE);
      if (!bounds) throw new Error("لم نعثر على منتج ظاهر للتصدير. أضف الصور أو أعد معالجتها.");
      const canvas = document.createElement("canvas");
      canvas.width = bounds.width;
      canvas.height = bounds.height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("تعذر تجهيز مساحة صورة المنتج.");
      context.drawImage(stageCanvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
      const blob = await createCanvasBlob(canvas);
      const type = blob.type === "image/webp" ? "image/webp" : "image/png";
      const extension = type === "image/webp" ? "webp" : "png";
      const image = new File([blob], `offer-${offer.id}-products.${extension}`, { type });
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
          <DialogTitle className="flex items-center gap-2 text-xl font-black text-slate-900"><Sparkles className="h-5 w-5 text-violet-600" />{variant === "product" ? "استوديو تفريغ وتجهيز صورة المنتج" : "استوديو تفريغ وتنسيق صور العرض"}</DialogTitle>
          <DialogDescription>{variant === "product" ? `المنتج: ${offer.title}.` : `العرض: ${offer.title}.`} تُعالج الصور محلياً على جهازك، ثم يُرفع الكادر النهائي فقط. نموذج التفريغ الخفيف يُحمّل عند أول معالجة ويُخزّن في المتصفح.</DialogDescription>
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
              {isProcessing && <div role="status" aria-live="polite" className="mt-3 flex items-center gap-3 rounded-xl border border-violet-200 bg-white p-3">
                <div className="relative h-14 w-14 shrink-0">
                  <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90" aria-hidden="true"><circle cx="22" cy="22" r="18" fill="none" stroke="#ede9fe" strokeWidth="4" /><circle cx="22" cy="22" r="18" fill="none" stroke="#6d28d9" strokeWidth="4" strokeLinecap="round" strokeDasharray="113.1" strokeDashoffset={113.1 * (1 - progress / 100)} className="transition-all duration-300" /></svg>
                  <span className="absolute inset-0 grid place-items-center text-[10px] font-black text-violet-900">{progress}%</span>
                </div>
                <div className="min-w-0"><p className="text-xs font-black text-violet-950">جاري تجهيز محرك المعالجة وعزل الخلفيات...</p><p className="mt-1 break-words text-[11px] text-slate-600">{statusText}</p></div>
              </div>}
              {backgroundRemovalUnavailable && !isProcessing && <div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><p className="font-bold">تعذر تشغيل إزالة الخلفية؛ لم تُضف الصورة الأصلية ولم يُسمح بحفظها كقصّ شفاف. تحقق من الاتصال ثم أعد المحاولة.</p><Button type="button" size="sm" variant="ghost" onClick={() => setBackgroundRemovalUnavailable(false)} className="mt-1 h-8 px-2 text-amber-900">إعادة محاولة إزالة الخلفية</Button></div>}
              {!isProcessing && !!statusText && <p className="mt-2 text-center text-xs font-bold text-emerald-700">{statusText}</p>}
            </div>

            {layers.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-slate-900">ضبط التجميع يدوياً</h3><Button type="button" size="sm" variant="outline" disabled={isSaving || isProcessing} onClick={resetAutoLayout} className="text-xs">إعادة الترتيب التلقائي</Button></div>
              <div className="mt-3 flex flex-wrap gap-2">{layers.map((layer, index) => <button key={layer.id} type="button" onClick={() => setSelectedLayerId(layer.id)} className={`max-w-full truncate rounded-full border px-3 py-1.5 text-xs font-black ${selectedLayerId === layer.id ? "border-violet-500 bg-violet-100 text-violet-950" : "border-slate-200 bg-white text-slate-700"}`}>{index === 0 ? "الأساسي · " : ""}{layer.name}</button>)}</div>
              {selectedLayer && <div className="mt-3 rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2"><div><label htmlFor="product-stage-scale" className="text-xs font-black text-slate-700">حجم الطبقة المحددة: {Math.round(selectedLayer.scale * 100)}%</label><p className="text-[11px] text-slate-500">يمكن التكبير حتى 400%</p></div><Button type="button" size="sm" variant="ghost" disabled={isSaving || isProcessing} onClick={() => removeLayer(selectedLayer.id)} className="h-8 text-xs text-red-600"><Trash2 className="ml-1 h-4 w-4" />حذف</Button></div>
                <div className="mt-2 flex items-center gap-2"><Minus className="h-4 w-4 text-slate-500" /><Input id="product-stage-scale" type="range" min={MIN_SCALE_PERCENT / 100} max={MAX_SCALE_PERCENT / 100} step="0.05" value={selectedLayer.scale} disabled={isSaving || isProcessing} onChange={event => { const bitmap = bitmapsRef.current.get(selectedLayer.id); if (!bitmap) return; setLayers(current => current.map(layer => layer.id === selectedLayer.id ? clampLayerToStage({ ...layer, scale: Math.max(MIN_SCALE_PERCENT / 100, Math.min(MAX_SCALE_PERCENT / 100, Number(event.target.value))) }, bitmap) : layer)); }} className="h-8 cursor-pointer accent-violet-700" /><Plus className="h-4 w-4 text-slate-500" /><Input aria-label="حجم المنتج بالنسبة المئوية" type="number" min={MIN_SCALE_PERCENT} max={MAX_SCALE_PERCENT} step="5" value={Math.round(selectedLayer.scale * 100)} disabled={isSaving || isProcessing} onChange={event => { const value = Number(event.target.value); const bitmap = bitmapsRef.current.get(selectedLayer.id); if (!Number.isFinite(value) || !bitmap) return; setLayers(current => current.map(layer => layer.id === selectedLayer.id ? clampLayerToStage({ ...layer, scale: Math.max(MIN_SCALE_PERCENT / 100, Math.min(MAX_SCALE_PERCENT / 100, value / 100)) }, bitmap) : layer)); }} className="h-8 w-20 text-center text-xs font-black" /></div>
                <div className="mt-3 flex items-center justify-between gap-2"><label htmlFor="product-stage-rotation" className="text-xs font-black text-slate-700">الدوران: {Math.round(selectedLayer.rotation)}°</label><Button type="button" size="sm" variant={selectedLayer.shadow ? "default" : "outline"} disabled={isSaving || isProcessing} onClick={() => setLayers(current => current.map(layer => layer.id === selectedLayer.id ? { ...layer, shadow: !layer.shadow } : layer))} className={selectedLayer.shadow ? "h-8 bg-violet-700 text-xs" : "h-8 text-xs"}><Sparkles className="ml-1 h-3.5 w-3.5" />{selectedLayer.shadow ? "إيقاف الظل ثلاثي الأبعاد" : "إضافة ظل ثلاثي الأبعاد"}</Button></div>
                <Input id="product-stage-rotation" aria-label="تدوير المنتج" type="range" min="-45" max="45" step="1" value={selectedLayer.rotation} disabled={isSaving || isProcessing} onChange={event => setLayers(current => current.map(layer => layer.id === selectedLayer.id ? { ...layer, rotation: Number(event.target.value) } : layer))} className="mt-1 h-8 cursor-pointer accent-violet-700" />
                <p className="mt-1 text-[11px] text-slate-500">اسحب العبوة لتحريكها، واستخدم منزلق الحجم والدوران باللمس أو الفأرة. تُطبّق المعاينة والتصدير التغييرات نفسها مع خلفية شفافة.</p>
              </div>}
            </div>}
          </section>

          <section className="space-y-3">
            <div><h3 className="mb-2 text-sm font-black text-slate-900">{variant === "product" ? "معاينة صورة المنتج المفرغة" : "المعاينة النهائية فوق قالب العرض"}</h3>
              <div className="relative h-40 overflow-hidden rounded-2xl text-white shadow-md sm:h-48" style={templateStyle(offer)}>
                <canvas ref={previewCanvasRef} aria-label="معاينة المنتجات الشفافة فوق قالب العرض" className="absolute bottom-0 left-0 z-20 h-full w-[48%] object-contain" />
                <div className="absolute right-3 top-3 z-30 w-[48%] space-y-1 text-right [text-shadow:0_1px_3px_rgba(0,0,0,.75)] sm:right-5 sm:top-5">
                  <p className="line-clamp-2 text-sm font-black sm:text-lg">{offer.title}</p>
                  {offer.promoText && <p className="line-clamp-2 text-[10px] font-bold sm:text-xs">{offer.promoText}</p>}
                  <div className="flex flex-wrap gap-1 pt-1 text-[10px] font-black">{offer.discountPercent > 0 && <span className="rounded-full border border-white/25 bg-amber-300 px-2 py-0.5 text-amber-950">وفر {offer.discountPercent}%</span>}<span className="rounded-full bg-white/90 px-2 py-0.5 text-slate-900">{offer.offerPrice} ج.م</span></div>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-3 bg-gradient-to-t from-white/30 to-transparent" />
              </div>
            </div>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%),linear-gradient(45deg,#f1f5f9_25%,white_25%,white_75%,#f1f5f9_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px] p-2">
              <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[11px] font-bold text-slate-600"><span>كادر شفاف — اسحب الصور إليه أو حرّك الطبقات</span>{layers.length > 0 && <span>{layers.length} / {MAX_PRODUCTS} منتجات</span>}</div>
              <canvas ref={canvasRef} aria-label="كادر ترتيب المنتجات" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); addFiles(event.dataTransfer.files); }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} style={{ touchAction: "none", transformOrigin: "center center" }} className={`mx-auto block aspect-square w-full max-w-[400px] rounded-xl ${layers.length ? "cursor-move touch-none" : "border-2 border-dashed border-slate-300"}`} />
              {!layers.length && <p className="pb-2 text-center text-xs text-slate-500">أضف الصور من الكاميرا أو المعرض، أو أفلتها هنا، ثم اضغط «معالجة وتنسيق العرض تلقائياً».</p>}
            </div>
            <p className="text-[11px] leading-5 text-slate-500">المنتج الأساسي يظهر أمام بقية المنتجات، مع محاذاة القواعد وظلال ناعمة. الخلفية الشطرنجية للمعاينة فقط؛ التصدير WebP شفاف مضغوط، أو PNG عند عدم دعم WebP.</p>
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" disabled={isProcessing || isSaving} onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button type="button" disabled={!layers.length || isProcessing || isSaving} onClick={() => void saveStage()} className="min-h-11 bg-emerald-700 font-black hover:bg-emerald-800">
            {isSaving ? <LoaderCircle className="ml-2 h-4 w-4 animate-spin" /> : <Upload className="ml-2 h-4 w-4" />}
            {isSaving ? "جاري حفظ الصورة…" : variant === "product" ? "استخدام الصورة الشفافة" : "حفظ ونشر صورة العرض"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface OfferProductStagerBoundaryProps {
  children: ReactNode;
  onClose: () => void;
}

interface OfferProductStagerBoundaryState {
  hasError: boolean;
}

export class OfferProductStagerBoundary extends Component<OfferProductStagerBoundaryProps, OfferProductStagerBoundaryState> {
  state: OfferProductStagerBoundaryState = { hasError: false };

  static getDerivedStateFromError(): OfferProductStagerBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("[OfferProductStager] studio error isolated from the offer manager", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-950/60 p-4" dir="rtl" role="alertdialog" aria-modal="true" aria-labelledby="stager-error-title">
        <div className="w-full max-w-md rounded-2xl bg-white p-5 text-right shadow-2xl">
          <h2 id="stager-error-title" className="text-lg font-black text-slate-900">تعذر فتح استوديو الصور</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">تم عزل العطل عن لوحة العروض. يمكنك إغلاق هذه النافذة واستخدام رفع صورة العرض المعتاد أو إعادة فتح الاستوديو.</p>
          <Button type="button" onClick={this.props.onClose} className="mt-4 min-h-11 w-full bg-violet-700 font-black hover:bg-violet-800">إغلاق الاستوديو</Button>
        </div>
      </div>
    );
  }
}
