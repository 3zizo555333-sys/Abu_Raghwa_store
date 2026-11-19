import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, Camera, ChevronDown, ChevronUp, History, KeyRound, Loader2, Plus, Save, Trash2, TrendingDown, TrendingUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getActiveShopContext } from "@/lib/supabase/products";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createInvoiceCategory, createInvoiceSupplier, deleteInvoiceCategory, deleteInvoiceSupplier, deleteSupplierInvoice, fetchSupplierInvoiceArchiveImage, getSupplierPriceInsights, listInvoiceCategories, listInvoiceSuppliers, listSupplierInvoices, listSupplierPriceHistory, listUnlinkedSupplierInvoiceImages, deleteUnlinkedSupplierInvoiceImage, deleteAllUnlinkedSupplierInvoiceImages, saveSupplierInvoice, saveSupplierInvoiceToTelegram, subscribeToSupplierInvoiceRealtime, uploadSupplierInvoiceImage, type InvoiceCategory, type InvoiceSupplier, type SupplierInvoice, type SupplierPriceComparison, type SupplierPriceInsight, type UnlinkedSupplierInvoiceImage } from "@/lib/supabase/supplierInvoices";
import { fileToDataUrl, prepareSupplierInvoiceImage } from "@/lib/supabase/prepareSupplierInvoiceImage";

interface ParsedItem { name: string; barcode: string; quantity: number; unitCost: number; salePrice: number | null; totalCost: number; confidence: number; }
const emptyInsight: SupplierPriceInsight = { previousUnitCost: null, previousSupplierName: null, priceDiff: null, cheapestUnitCost: null, cheapestSupplierName: null, savingVsCheapest: null, sellingPrice: null };
function playTone(kind: "up" | "down") {
  try {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.frequency.value = kind === "up" ? 220 : 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.2);
  } catch { /* الصوت اختياري */ }
}

async function compressInvoiceForOcr(dataUrl: string): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("تعذر فتح صورة الفاتورة لضغطها قبل القراءة."));
    element.src = dataUrl;
  });
  const scale = Math.min(1, 1200 / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر تجهيز Canvas لضغط صورة الفاتورة.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

function numericOcrValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/٫/g, ".").replace(/٬/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

type GeminiListedModel = { name?: string; displayName?: string; version?: string; supportedGenerationMethods?: string[] };
type GeminiAttempt = { status: number | null; raw: string; timedOut: boolean; networkError?: string };

function compareGeminiModelFreshness(a: GeminiListedModel, b: GeminiListedModel): number {
  const extractVersion = (model: GeminiListedModel) => {
    const match = `${model.name || ""} ${model.version || ""}`.match(/gemini[-/ ](\d+(?:\.\d+){0,3})/i);
    return match ? match[1].split(".").map(Number) : [];
  };
  const av = extractVersion(a); const bv = extractVersion(b);
  for (let i = 0; i < Math.max(av.length, bv.length); i += 1) {
    const difference = (bv[i] || 0) - (av[i] || 0);
    if (difference) return difference;
  }
  const releaseDate = (model: GeminiListedModel) => {
    const match = `${model.name || ""} ${model.version || ""}`.match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
    return match ? Number(`${match[1]}${match[2]}${match[3]}`) : 0;
  };
  const dateDifference = releaseDate(b) - releaseDate(a);
  if (dateDifference) return dateDifference;
  return String(b.version || "").localeCompare(String(a.version || ""), undefined, { numeric: true });
}

async function listNewestGeminiFlashModels(apiKey: string, excludedModels: string[]): Promise<string[]> {
  const models: GeminiListedModel[] = [];
  let pageToken = "";
  for (let page = 0; page < 10; page += 1) {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    let response: Response;
    let raw = "";
    try {
      response = await fetch(url.toString(), { signal: controller.signal });
      raw = await response.text();
    }
    finally { window.clearTimeout(timeout); }
    let result: { models?: GeminiListedModel[]; nextPageToken?: string; error?: { message?: string } } = {};
    try { result = JSON.parse(raw) as typeof result; } catch { /* يعرض الخطأ المقروء أدناه */ }
    if (!response.ok) throw new Error(`ListModels ${response.status}: ${result.error?.message || raw.slice(0, 300)}`);
    models.push(...(result.models || []));
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }
  const excluded = new Set(excludedModels.map(name => name.replace(/^models\//i, "").toLocaleLowerCase()));
  const eligible = models.filter(model => {
    const name = (model.name || "").replace(/^models\//i, "");
    return name && !excluded.has(name.toLocaleLowerCase()) &&
      /flash/i.test(`${name} ${model.displayName || ""}`) &&
      model.supportedGenerationMethods?.includes("generateContent");
  });
  return [...eligible].sort(compareGeminiModelFreshness).map(model => model.name!.replace(/^models\//i, ""));
}

function extractInvoiceItems(responseText: string): Array<Record<string, unknown>> {
  const cleaned = responseText.replace(/```json/gi, "").replace(/```/gi, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error(`لم تُرجع Gemini مصفوفة أصناف JSON صالحة. الرد التقني: ${cleaned.slice(0, 500)}`);
  const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("رد Gemini ليس مصفوفة أصناف.");
  return parsed.filter(item => item && typeof item === "object") as Array<Record<string, unknown>>;
}

export default function InvoiceOCR() {
  const [, navigate] = useLocation();
  const [invoiceImage, setInvoiceImage] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualTotal, setManualTotal] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [telegramArchiveReady, setTelegramArchiveReady] = useState(false);
  const [invoicePreviewUrl, setInvoicePreviewUrl] = useState("");
  const [loadingInvoicePreview, setLoadingInvoicePreview] = useState(false);
  const invoicePreviewUrlRef = useRef("");
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [priceInsights, setPriceInsights] = useState<SupplierPriceInsight[]>([]);
  const [supplier, setSupplier] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [isCompressing, setIsCompressing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCheckingPrices, setIsCheckingPrices] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [savedInvoices, setSavedInvoices] = useState<SupplierInvoice[]>([]);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [invoiceListError, setInvoiceListError] = useState("");
  const [unlinkedImages, setUnlinkedImages] = useState<UnlinkedSupplierInvoiceImage[]>([]);
  const [unlinkedImagesLoading, setUnlinkedImagesLoading] = useState(true);
  const [unlinkedImagesError, setUnlinkedImagesError] = useState("");
  const [adoptingImagePath, setAdoptingImagePath] = useState("");
  const [deletingImagePath, setDeletingImagePath] = useState("");
  const [isDeletingAllUnlinked, setIsDeletingAllUnlinked] = useState(false);
  const [categories, setCategories] = useState<InvoiceCategory[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<InvoiceSupplier[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [history, setHistory] = useState<SupplierPriceComparison[]>([]);
  const [historyName, setHistoryName] = useState("");
  const [radarSearch, setRadarSearch] = useState("");
  const [radarSelectedItem, setRadarSelectedItem] = useState("");
  const [ocrApiKey, setOcrApiKey] = useState(() => {
    if (typeof window !== "undefined") return window.localStorage.getItem("abu_raghwa_gemini_api_key") || import.meta.env.VITE_GEMINI_API_KEY || "";
    return "";
  });
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [pendingOcrDataUrl, setPendingOcrDataUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previousTrendRef = useRef<Record<number, "up" | "down" | "stable">>({});

  const refreshInvoices = async () => {
    try {
      setInvoiceListError("");
      setSavedInvoices(await listSupplierInvoices(1000));
      setInvoicesLoaded(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تحميل أرشيف فواتير الموردين.";
      setInvoiceListError(message);
      toast.error(message);
    }
  };
  const refreshCategories = async () => {
    try {
      const [nextCategories, nextSuppliers] = await Promise.all([listInvoiceCategories(), listInvoiceSuppliers()]);
      setCategories(nextCategories);
      setSupplierOptions(nextSuppliers);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحميل التصنيفات والأسماء."); }
  };
  const refreshUnlinkedImages = async () => {
    try {
      setUnlinkedImagesError("");
      setUnlinkedImages(await listUnlinkedSupplierInvoiceImages());
    } catch (error) {
      setUnlinkedImagesError(error instanceof Error ? error.message : "تعذر تحميل صور الفواتير غير المرتبطة.");
    } finally { setUnlinkedImagesLoading(false); }
  };

  useEffect(() => {
    let stop: (() => void) | undefined;
    let active = true;
    void (async () => {
      await Promise.all([refreshInvoices(), refreshCategories(), refreshUnlinkedImages()]);
      try {
        const { shopId } = await getActiveShopContext();
        const { data: archiveSettings } = await getSupabaseClient().rpc("get_telegram_archive_settings_v1", { p_shop_id: shopId });
        const settings = Array.isArray(archiveSettings) ? archiveSettings[0] : archiveSettings;
        const safeSettings = settings as { is_enabled?: boolean; has_bot_token?: boolean } | null;
        if (active) setTelegramArchiveReady(Boolean(safeSettings?.is_enabled && safeSettings?.has_bot_token));
        if (active) stop = subscribeToSupplierInvoiceRealtime(shopId, () => { void refreshInvoices(); void refreshUnlinkedImages(); });
      } catch { /* يظهر الخطأ عند العملية */ }
    })();
    return () => { active = false; stop?.(); };
  }, []);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (invoicePreviewUrlRef.current.startsWith("blob:")) URL.revokeObjectURL(invoicePreviewUrlRef.current);
  }, []);

  const refreshPriceInsights = async (items: ParsedItem[]) => {
    const valid = items.filter(item => item.name.trim());
    if (!valid.length) { setPriceInsights(items.map(() => emptyInsight)); return; }
    setIsCheckingPrices(true);
    try {
      const result = await getSupplierPriceInsights(valid.map(item => ({ itemName: item.name, barcode: item.barcode, unitCost: item.unitCost, salePrice: item.salePrice })));
      let validIndex = 0;
      const aligned = items.map(item => item.name.trim() ? result[validIndex++] || emptyInsight : emptyInsight);
      setPriceInsights(aligned);
      aligned.forEach((insight, index) => {
        const trend = insight.priceDiff == null ? "stable" : insight.priceDiff > 0 ? "up" : insight.priceDiff < 0 ? "down" : "stable";
        if (trend !== "stable" && previousTrendRef.current[index] && previousTrendRef.current[index] !== trend) playTone(trend);
        previousTrendRef.current[index] = trend;
      });
    } catch (error) {
      setPriceInsights(items.map(() => emptyInsight));
      toast.error(error instanceof Error ? error.message : "تعذر فحص حركة الأسعار حالياً.");
    } finally { setIsCheckingPrices(false); }
  };

  useEffect(() => {
    if (!parsedItems.length) { setPriceInsights([]); return; }
    const timer = window.setTimeout(() => void refreshPriceInsights(parsedItems), 350);
    return () => window.clearTimeout(timer);
  }, [parsedItems]);

  const runInvoiceOcr = async (dataUrl: string) => {
    setIsProcessing(true);
    setOcrError("");
    try {
      const apiKey = ocrApiKey.trim() || import.meta.env.VITE_GEMINI_API_KEY || "";
      if (apiKey.length < 20) {
        setPendingOcrDataUrl(dataUrl);
        setIsApiKeyModalOpen(true);
        throw new Error("مفتاح Gemini API غير موجود. أدخله في النافذة ثم أعد القراءة.");
      }
      const compressedDataUrl = await compressInvoiceForOcr(dataUrl);
      const base64 = compressedDataUrl.split(",")[1] || "";
      const requestBody = {
        contents: [{ role: "user", parts: [
          { text: `اقرأ الصورة كاملة سطراً سطراً؛ سواء كانت فاتورة أو قائمة أسعار، مطبوعة أو بخط اليد، بالعربية أو الإنجليزية. المورد: ${supplier || "غير معروف"}. التاريخ: ${invoiceDate || "غير معروف"}. استخرج جميع البنود الظاهرة ولا تتجاهل أي صف. إذا كانت الصفحة مقسمة إلى عمودين، اقرأ كل عمود كاملاً على حدة ولا تخلط صفوف العمودين، ثم أخرج البنود بترتيب القراءة من اليمين إلى اليسار للعربية ومن اليسار إلى اليمين للإنجليزية. حوّل الأرقام العربية إلى أرقام عادية. استخرج اسم الصنف والباركود إن ظهر والكمية وسعر الشراء للوحدة وإجمالي البند وسعر البيع إن ظهر. إذا غابت الكمية فاستخدم 1؛ وإذا ظهر إجمالي البند فقط فاستنتج سعر الوحدة من الكمية. لا تخمّن القيم غير المقروءة واجعلها 0 أو null. أعد مصفوفة JSON فقط بلا Markdown ولا مقدمة، وكل صف بهذا الشكل: [{"item_name":"اسم الصنف","barcode":"","quantity":1,"unit_price":10,"total_price":10,"selling_price":null,"confidence":0.9}]` },
          { inline_data: { mime_type: "image/jpeg", data: base64 } },
        ] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: {
              item_name: { type: "STRING" }, barcode: { type: "STRING" }, quantity: { type: "NUMBER" },
              unit_price: { type: "NUMBER" }, total_price: { type: "NUMBER" }, selling_price: { type: "NUMBER", nullable: true }, confidence: { type: "NUMBER" },
            }, required: ["item_name", "quantity", "unit_price", "total_price"] },
          },
          maxOutputTokens: 8192,
        },
      };
      const requestModel = async (model: string): Promise<GeminiAttempt> => {
        const send = async (includeThinking: boolean): Promise<GeminiAttempt> => {
          const controller = new AbortController();
          let timedOut = false;
          const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
          try {
            const generationConfig = includeThinking
              ? { ...requestBody.generationConfig, thinkingConfig: { thinkingBudget: 0 } }
              : requestBody.generationConfig;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({ ...requestBody, generationConfig }),
            });
            return { status: response.status, raw: await response.text(), timedOut: false };
          } catch (error) {
            return { status: null, raw: "", timedOut, networkError: error instanceof Error ? error.message : String(error) };
          } finally { window.clearTimeout(timeout); }
        };
        let attempt = await send(true);
        if (attempt.status === 400 && /thinking[\s_-]?(?:config|budget)|unsupported.*thinking|unknown.*thinking/i.test(attempt.raw)) {
          attempt = await send(false);
        }
        return attempt;
      };
      const describeAttempt = (model: string, attempt: GeminiAttempt) => {
        if (attempt.timedOut) return `${model}: انتهت مهلة Gemini بعد 8 ثوانٍ`;
        if (attempt.status === null) return `${model}: ${attempt.networkError || "فشل الاتصال"}`;
        let apiMessage = "";
        try { apiMessage = (JSON.parse(attempt.raw) as { error?: { message?: string } }).error?.message || ""; } catch { /* يستخدم الرد الخام */ }
        return `${model}: Gemini API ${attempt.status}: ${apiMessage || attempt.raw.slice(0, 300)}`;
      };
      const attemptedModels = new Set<string>();
      const failures: string[] = [];
      const successfulAttempts: Array<{ model: string; attempt: GeminiAttempt }> = [];
      const tryModel = async (model: string) => {
        attemptedModels.add(model);
        const attempt = await requestModel(model);
        if (attempt.status !== null && attempt.status >= 200 && attempt.status < 300) {
          successfulAttempts.push({ model, attempt });
        } else failures.push(describeAttempt(model, attempt));
        return attempt;
      };

      const primaryAttempt = await tryModel("gemini-3.8-flash");
      const primaryOverloaded = primaryAttempt.timedOut || primaryAttempt.status === 429 || primaryAttempt.status === 503;
      if (!successfulAttempts.length && primaryOverloaded) await tryModel("gemini-3.8-flash-lite");
      if (!successfulAttempts.length && (primaryOverloaded || primaryAttempt.status === 404)) {
        try {
          const fallbackModels = await listNewestGeminiFlashModels(apiKey, Array.from(attemptedModels));
          for (const model of fallbackModels) {
            await tryModel(model);
            if (successfulAttempts.length) break;
          }
        } catch (error) {
          failures.push(`ListModels: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (!successfulAttempts.length) throw new Error(failures.join(" | ") || "لم يتوفر موديل Gemini Flash لقراءة الفاتورة.");
      const { attempt: selectedAttempt } = successfulAttempts[0];
      const raw = selectedAttempt.raw;
      let payload: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } } = {};
      try { payload = JSON.parse(raw) as typeof payload; } catch { /* نعرض الرد الخام بالأسفل */ }
      const responseText = payload.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("\n") || raw;
      const parsedItems = extractInvoiceItems(responseText);
      const items = parsedItems.map(item => {
        const name = String(item.item_name || item.name || "").trim();
        const quantity = Math.max(0.001, numericOcrValue(item.quantity) || 1);
        const extractedTotal = Math.max(0, numericOcrValue(item.total_price ?? item.totalCost));
        const extractedUnit = Math.max(0, numericOcrValue(item.unit_price ?? item.unitCost));
        const unitCost = extractedUnit || (extractedTotal ? extractedTotal / quantity : 0);
        const totalCost = Math.round((extractedTotal || quantity * unitCost) * 100) / 100;
        const saleValue = item.selling_price == null ? null : Math.max(0, numericOcrValue(item.selling_price));
        return { name, barcode: String(item.barcode || "").trim(), quantity, unitCost, salePrice: saleValue, totalCost, confidence: numericOcrValue(item.confidence) };
      }).filter(item => item.name);
      if (!items.length) throw new Error("لم تُستخرج بنود مقروءة من هذه الصورة. أعد التصوير بإضاءة أوضح.");
      setParsedItems(items);
      toast.success(`تم استخراج ${items.length} بند تلقائياً وتشغيل رادار الأسعار.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذرت قراءة الفاتورة. أعد المحاولة بعد التحقق من وضوح الصورة والاتصال.";
      setOcrError(message);
      if (/غير مهيأة|not configured|api key/i.test(message)) {
        setPendingOcrDataUrl(dataUrl);
        setIsApiKeyModalOpen(true);
      }
      toast.error(message);
    } finally { setIsProcessing(false); }
  };

  const saveOcrApiKey = () => {
    const normalized = ocrApiKey.trim();
    if (normalized.length < 20) { toast.error("أدخل مفتاح Gemini API صالحاً."); return; }
    window.localStorage.setItem("abu_raghwa_gemini_api_key", normalized);
    setOcrApiKey(normalized);
    setIsApiKeyModalOpen(false);
    const pending = pendingOcrDataUrl;
    setPendingOcrDataUrl("");
    if (pending) void runInvoiceOcr(pending);
    else toast.success("تم حفظ مفتاح Gemini على هذا الجهاز.");
  };

  const handleImageUpload = async (file?: File) => {
    if (!file) return;
    try {
      setManualEntry(false); setManualTotal(""); setOcrError(""); setParsedItems([]); setPriceInsights([]); setUploadedImageUrl("");
      setIsCompressing(true);
      const compressed = await prepareSupplierInvoiceImage(file);
      const dataUrl = await fileToDataUrl(compressed);
      setImageDataUrl(dataUrl);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const previewUrl = URL.createObjectURL(compressed);
      previewUrlRef.current = previewUrl;
      setInvoiceImage(previewUrl);
      setIsCompressing(false);
      if (telegramArchiveReady) {
        setUploadedImageUrl("telegram-archive-pending");
      } else {
        setIsUploading(true);
        const publicUrl = await uploadSupplierInvoiceImage(compressed);
        setUploadedImageUrl(publicUrl);
        setIsUploading(false);
      }
      await runInvoiceOcr(dataUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تجهيز أو رفع صورة الفاتورة.";
      setOcrError(message);
      toast.error(message);
    } finally { setIsCompressing(false); setIsUploading(false); }
  };

  const adoptStoredImage = async (image: UnlinkedSupplierInvoiceImage) => {
    try {
      setAdoptingImagePath(image.path); setOcrError(""); setIsCompressing(true);
      const response = await fetch(image.imageUrl);
      if (!response.ok) throw new Error("تعذر تنزيل الصورة القديمة من Storage.");
      const blob = await response.blob();
      const filename = image.path.split("/").pop() || "supplier-invoice.webp";
      const original = new File([blob], filename, { type: blob.type || "image/webp" });
      const compressed = await prepareSupplierInvoiceImage(original);
      const dataUrl = await fileToDataUrl(compressed);
      setManualEntry(false); setImageDataUrl(dataUrl); setUploadedImageUrl(telegramArchiveReady ? "telegram-archive-pending" : image.imageUrl); setInvoiceDate(""); setSupplier(""); setSupplierId("");
      setNotes("صورة قديمة محفوظة في Storage؛ أدخل بيانات المورد والتاريخ الصحيحين قبل الحفظ.");
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const previewUrl = URL.createObjectURL(blob); previewUrlRef.current = previewUrl; setInvoiceImage(previewUrl);
      setIsCompressing(false);
      await runInvoiceOcr(dataUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذرت استعادة الصورة القديمة.";
      setOcrError(message); toast.error(message);
    } finally { setIsCompressing(false); setAdoptingImagePath(""); }
  };

  const resetDraft = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setInvoiceImage(null); setManualEntry(false); setManualTotal(""); setImageDataUrl(""); setUploadedImageUrl(""); setParsedItems([]); setPriceInsights([]); setSupplier(""); setSupplierId(""); setInvoiceDate(new Date().toISOString().split("T")[0]); setNotes(""); setCategoryId(""); setNewCategoryName(""); setNewSupplierName(""); setOcrError(""); setHistory([]); setHistoryName(""); previousTrendRef.current = {};
  };

  const deleteUnlinkedImage = async (image: UnlinkedSupplierInvoiceImage) => {
    if (!confirm("حذف صورة الفاتورة القديمة نهائياً من السحابة؟")) return;
    try { setDeletingImagePath(image.path); await deleteUnlinkedSupplierInvoiceImage(image.path); setUnlinkedImages(rows => rows.filter(row => row.path !== image.path)); toast.success("تم حذف الصورة القديمة نهائياً."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف الصورة القديمة."); }
    finally { setDeletingImagePath(""); }
  };

  const deleteAllUnlinkedImages = async () => {
    if (!unlinkedImages.length || !confirm(`حذف جميع الصور المعلقة (${unlinkedImages.length}) نهائياً من السحابة؟`)) return;
    try { setIsDeletingAllUnlinked(true); const count = await deleteAllUnlinkedSupplierInvoiceImages(); setUnlinkedImages([]); toast.success(`تم حذف ${count} صورة معلقة نهائياً.`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف الصور المعلقة."); }
    finally { setIsDeletingAllUnlinked(false); }
  };

  const updateItem = (index: number, field: keyof ParsedItem, value: string) => setParsedItems(rows => rows.map((row, rowIndex) => {
    if (rowIndex !== index) return row;
    const numericNext = Number(value) || 0;
    const updated = { ...row, [field]: field === "name" || field === "barcode" ? value : field === "salePrice" && !value.trim() ? null : numericNext };
    if (field === "quantity" || field === "unitCost") updated.totalCost = Math.round(((field === "quantity" ? numericNext : row.quantity) * (field === "unitCost" ? numericNext : row.unitCost)) * 100) / 100;
    return updated;
  }));

  const addCategory = async () => {
    if (!newCategoryName.trim()) { toast.error("اكتب اسم التصنيف أولاً."); return; }
    try {
      const row = await createInvoiceCategory(newCategoryName, "📁");
      setCategories(rows => [...rows, row].sort((a, b) => a.name.localeCompare(b.name, "ar")));
      setCategoryId(row.id); setSupplierId(""); setSupplier(""); setNewCategoryName(""); toast.success("تم حفظ التصنيف الجديد فوراً.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ التصنيف."); }
  };

  const addSupplier = async () => {
    if (!categoryId) { toast.error("اختر التصنيف أولاً."); return; }
    if (!newSupplierName.trim()) { toast.error("اكتب الاسم الجديد أولاً."); return; }
    try {
      const row = await createInvoiceSupplier(categoryId, newSupplierName);
      setSupplierOptions(rows => [...rows, row].sort((a, b) => a.name.localeCompare(b.name, "ar")));
      setSupplierId(row.id); setSupplier(row.name); setNewSupplierName(""); toast.success("تم حفظ الاسم تحت التصنيف فوراً.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الاسم."); }
  };

  const removeCategory = async () => {
    const selected = categories.find(row => row.id === categoryId);
    if (!selected || !confirm(`حذف التصنيف «${selected.icon} ${selected.name}» وجميع الموردين تحته؟ ستبقى سجلات الفواتير السابقة.`)) return;
    try {
      await deleteInvoiceCategory(selected.id);
      setCategories(rows => rows.filter(row => row.id !== selected.id));
      setSupplierOptions(rows => rows.filter(row => row.category_id !== selected.id));
      setCategoryId(""); setSupplierId(""); setSupplier("");
      toast.success("تم حذف التصنيف والأسماء التابعة له.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف التصنيف."); }
  };

  const removeSupplier = async () => {
    const selected = supplierOptions.find(row => row.id === supplierId);
    if (!selected || !confirm(`حذف المورد «${selected.name}»؟ ستظل الفواتير السابقة محفوظة.`)) return;
    try {
      await deleteInvoiceSupplier(selected.id);
      setSupplierOptions(rows => rows.filter(row => row.id !== selected.id));
      setSupplierId(""); setSupplier("");
      toast.success("تم حذف المورد.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف المورد."); }
  };

  const openInvoicePreview = async (invoice: SupplierInvoice) => {
    if (!invoice.image_url && !invoice.telegram_file_id) { toast.error("لا توجد صورة مرفقة بهذه الفاتورة."); return; }
    if (invoicePreviewUrlRef.current.startsWith("blob:")) URL.revokeObjectURL(invoicePreviewUrlRef.current);
    setInvoicePreviewUrl("");
    if (invoice.image_url) {
      invoicePreviewUrlRef.current = invoice.image_url;
      setInvoicePreviewUrl(invoice.image_url);
      return;
    }
    setLoadingInvoicePreview(true);
    try {
      const url = await fetchSupplierInvoiceArchiveImage(invoice.id);
      invoicePreviewUrlRef.current = url;
      setInvoicePreviewUrl(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل صورة الفاتورة.");
    } finally { setLoadingInvoicePreview(false); }
  };

  const closeInvoicePreview = () => {
    if (invoicePreviewUrlRef.current.startsWith("blob:")) URL.revokeObjectURL(invoicePreviewUrlRef.current);
    invoicePreviewUrlRef.current = "";
    setInvoicePreviewUrl("");
  };

  const saveInvoice = async () => {
    if (!categoryId) { toast.error("اختر تصنيف الفاتورة."); return; }
    if (!supplierId || !supplier.trim()) { toast.error("اختر التاجر أو المندوب قبل حفظ الفاتورة."); return; }
    if (!invoiceDate) { toast.error("أدخل تاريخ الفاتورة الصحيح قبل حفظها."); return; }
    const hasNamedItems = parsedItems.some(item => item.name.trim());
    const hasManualTotal = manualTotal.trim() !== "" && Number.isFinite(Number(manualTotal)) && Number(manualTotal) >= 0;
    if (manualTotal.trim() !== "" && !hasManualTotal) { toast.error("أدخل إجمالياً يدوياً صحيحاً يساوي صفراً أو أكثر."); return; }
    if (!imageDataUrl && !uploadedImageUrl && !hasManualTotal && !hasNamedItems) { toast.error("أرفق صورة أو أدخل إجمالي الفاتورة يدوياً."); return; }
    try {
      setIsSaving(true);
      const invoiceDraft = { supplierId, supplierName: supplier, invoiceDate, categoryId, notes, totalAmount: totalDraft, items: parsedItems.map(item => ({ itemName: item.name, barcode: item.barcode, quantity: item.quantity, unitCost: item.unitCost, salePrice: item.salePrice, totalCost: item.totalCost })) };
      if (telegramArchiveReady && imageDataUrl) await saveSupplierInvoiceToTelegram({ ...invoiceDraft, imageDataUrl });
      else await saveSupplierInvoice({ ...invoiceDraft, imageUrl: uploadedImageUrl || "" });
      toast.success(telegramArchiveReady && imageDataUrl ? "تم حفظ الفاتورة وإيداع صورتها في قناة أرشيف Telegram." : !imageDataUrl ? "تم حفظ الفاتورة سحابياً بدون صورة." : "تم حفظ الفاتورة وبنودها سحابياً وتحديث رادار الأسعار.");
      resetDraft(); await Promise.all([refreshInvoices(), refreshUnlinkedImages()]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الفاتورة سحابياً."); }
    finally { setIsSaving(false); }
  };

  const showHistory = async (item: ParsedItem) => {
    try { setHistoryName(item.name); setHistory(await listSupplierPriceHistory(item.name, item.barcode)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحميل سجل السعر."); }
  };
  const calculatedTotal = parsedItems.reduce((sum, item) => sum + item.totalCost, 0);
  const totalDraft = manualTotal.trim() ? Math.max(0, Number(manualTotal) || 0) : calculatedTotal;
  const manualTotalInvalid = manualTotal.trim() !== "" && (!Number.isFinite(Number(manualTotal)) || Number(manualTotal) < 0);
  const trendFor = (insight: SupplierPriceInsight) => insight.priceDiff == null ? "stable" : insight.priceDiff > 0 ? "up" : insight.priceDiff < 0 ? "down" : "stable";
  const percentFor = (insight: SupplierPriceInsight) => {
    if (insight.previousUnitCost == null || insight.previousUnitCost === 0) return null;
    return ((insight.priceDiff || 0) / insight.previousUnitCost) * 100;
  };
  const savedItemNames = Array.from(new Set(savedInvoices.flatMap(invoice => invoice.items.map(item => item.item_name.trim()).filter(Boolean))))
    .sort((a, b) => a.localeCompare(b, "ar"));
  const normalizedRadarSearch = radarSearch.trim().toLocaleLowerCase();
  const radarSelectableItems = savedItemNames.filter(name => !normalizedRadarSearch || name.toLocaleLowerCase().includes(normalizedRadarSearch));
  const normalizedSelectedRadarItem = radarSelectedItem.trim().toLocaleLowerCase();
  const radarHistoryRows = savedInvoices.flatMap(invoice => invoice.items
    .filter(item => normalizedSelectedRadarItem && item.item_name.trim().toLocaleLowerCase() === normalizedSelectedRadarItem)
    .map(item => ({
      supplierKey: invoice.supplier_id || invoice.supplier_name.trim().toLocaleLowerCase(),
      supplierName: invoice.supplier_name || "مورد غير معروف",
      unitCost: Number(item.unit_cost),
      invoiceDate: invoice.invoice_date,
      createdAt: invoice.created_at || invoice.invoice_date,
    })))
    .filter(row => Number.isFinite(row.unitCost))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.invoiceDate.localeCompare(a.invoiceDate));
  const latestSupplierPrices = new Map<string, typeof radarHistoryRows[number]>();
  radarHistoryRows.forEach(row => { if (!latestSupplierPrices.has(row.supplierKey)) latestSupplierPrices.set(row.supplierKey, row); });
  const supplierPriceRows = Array.from(latestSupplierPrices.values());
  const cheapestSavedPrice = supplierPriceRows.length ? Math.min(...supplierPriceRows.map(row => row.unitCost)) : null;
  const priceHistoryByItem = new Map<string, Array<{ itemName: string; unitCost: number; invoiceId: string; invoiceDate: string; createdAt: string; supplierName: string }>>();
  savedInvoices.forEach(invoice => invoice.items.forEach(item => {
    const itemName = item.item_name.trim();
    const unitCost = Number(item.unit_cost);
    if (!itemName || !Number.isFinite(unitCost)) return;
    const key = itemName.toLocaleLowerCase();
    const rows = priceHistoryByItem.get(key) || [];
    rows.push({ itemName, unitCost, invoiceId: invoice.id, invoiceDate: invoice.invoice_date, createdAt: invoice.created_at || invoice.invoice_date, supplierName: invoice.supplier_name || "مورد غير معروف" });
    priceHistoryByItem.set(key, rows);
  }));
  const priceIncreaseAlerts = Array.from(priceHistoryByItem.values()).flatMap(rows => {
    const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.invoiceDate.localeCompare(a.invoiceDate));
    const seenInvoices = new Set<string>();
    const distinctInvoices = sorted.filter(row => {
      if (seenInvoices.has(row.invoiceId)) return false;
      seenInvoices.add(row.invoiceId);
      return true;
    });
    if (distinctInvoices.length < 2) return [];
    const newest = distinctInvoices[0];
    const previous = distinctInvoices[1];
    const increase = newest.unitCost - previous.unitCost;
    return increase > 0 ? [{ ...newest, previousCost: previous.unitCost, increase, percent: previous.unitCost > 0 ? increase / previous.unitCost * 100 : null }] : [];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const processing = isCompressing || isUploading || isProcessing;

  return <div className="min-h-screen bg-gray-50 p-4" dir="rtl">
    <header className="mx-auto flex max-w-7xl items-center justify-between py-4">
      <div><h1 className="text-3xl font-bold text-gray-900">فواتير الموردين ومستشار المشتريات</h1><p className="mt-1 text-gray-600">رفع سحابي، قراءة ذكية، حركة أسعار، ومقارنة فورية بين الموردين</p></div>
      <Button variant="outline" onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-2 h-4 w-4" />العودة</Button>
    </header>
    <main className="mx-auto max-w-7xl space-y-6">
      <Tabs defaultValue="add" dir="rtl" className="w-full">
        <TabsList className="sticky top-0 z-40 grid h-auto w-full grid-cols-3 rounded-xl border bg-white/95 p-1 shadow-sm backdrop-blur">
          <TabsTrigger value="add" className="min-h-11 whitespace-normal px-2 text-xs sm:text-sm"><Plus className="h-4 w-4" />إضافة فاتورة</TabsTrigger>
          <TabsTrigger value="radar" className="min-h-11 whitespace-normal px-2 text-xs sm:text-sm"><TrendingUp className="h-4 w-4" />رادار الأسعار والمقارنة</TabsTrigger>
          <TabsTrigger value="saved" className="min-h-11 whitespace-normal px-2 text-xs sm:text-sm"><History className="h-4 w-4" />سجل الفواتير المحفوظة</TabsTrigger>
        </TabsList>
        <TabsContent value="add" className="mt-2 space-y-6">
      {!invoiceImage && !manualEntry ? <Card>
        <CardHeader><CardTitle>إضافة فاتورة مورد</CardTitle><CardDescription>التقط صورة واضحة أو ارفعها من المعرض؛ ستُضغط الصورة وتُقرأ البنود تلقائياً ثم تحفظ في الأرشيف السحابي.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <Button onClick={() => cameraInputRef.current?.click()} disabled={processing} className="h-28 bg-blue-600"><Camera className="ml-2" />التقاط بالكاميرا</Button>
            <Button onClick={() => fileInputRef.current?.click()} disabled={processing} className="h-28 bg-green-600"><Upload className="ml-2" />رفع من المعرض</Button>
          </div>
          <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => setManualEntry(true)}><Plus className="ml-2 h-4 w-4" />إدخال فاتورة يدوياً بدون صورة</Button>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void handleImageUpload(file); }} />
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void handleImageUpload(file); }} />
          {isCompressing && <p className="mt-4 flex items-center gap-2 text-sm text-blue-700" role="status"><Loader2 className="h-4 w-4 animate-spin" />جارٍ ضغط صورة الفاتورة قبل الرفع...</p>}
        </CardContent>
      </Card> : <Card>
        <CardHeader>
          <CardTitle>مراجعة الفاتورة قبل الحفظ</CardTitle>
          <CardDescription>{isCompressing ? "جارٍ ضغط صورة الفاتورة قبل الرفع..." : isUploading ? "جارٍ رفع صورة الفاتورة المضغوطة إلى Supabase Storage..." : isProcessing ? "جارٍ قراءة الفاتورة واستخراج الأصناف بالذكاء الاصطناعي..." : isCheckingPrices ? "جارٍ مقارنة الأسعار مع آخر مشتريات..." : "راجع البنود وعدّل أي خلية مباشرة قبل الحفظ."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {processing && <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800" role="status" aria-live="polite"><Loader2 className="h-5 w-5 animate-spin" />{isCompressing ? "جارٍ ضغط صورة الفاتورة قبل الرفع..." : isUploading ? "جارٍ رفع صورة الفاتورة المضغوطة إلى Supabase Storage..." : "جارٍ قراءة الفاتورة واستخراج الأصناف بالذكاء الاصطناعي..."}</div>}
          {ocrError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><span>{ocrError}</span>{uploadedImageUrl && imageDataUrl && <Button size="sm" variant="outline" disabled={processing} onClick={() => void runInvoiceOcr(imageDataUrl)}>إعادة القراءة بالذكاء الاصطناعي</Button>}</div>}
          <div className="grid gap-6 lg:grid-cols-2">
            <div>{invoiceImage ? <img src={invoiceImage} alt="صورة فاتورة المورد بعد ضغطها" className="max-h-[620px] w-full rounded-xl border object-contain" /> : <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed bg-gray-50 p-6 text-center text-gray-500">إدخال يدوي؛ لا توجد صورة مرفقة.</div>}<p className="mt-2 text-xs text-green-700">أرشفة الصورة: {invoiceImage ? telegramArchiveReady ? (uploadedImageUrl ? "ستُرسل إلى مجموعة Telegram عند الحفظ" : "بانتظار اختيار الصورة") : isUploading ? "جارية الآن..." : uploadedImageUrl ? "تم الرفع؛ ستحفظ مع الفاتورة" : "لم تبدأ" : "غير مرفقة"}</p></div>
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-bold">التصنيف</label>
                <div className="flex gap-2"><select value={categoryId} onChange={event => { setCategoryId(event.target.value); setSupplierId(""); setSupplier(""); }} className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2"><option value="">اختر التصنيف</option>{categories.map(category => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select><Button type="button" variant="outline" size="icon" aria-label="حذف التصنيف المحدد" title="حذف التصنيف المحدد" disabled={!categoryId} onClick={() => void removeCategory()}><Trash2 className="h-4 w-4 text-red-600" /></Button></div>
                <div className="flex gap-2"><Input value={newCategoryName} onChange={event => setNewCategoryName(event.target.value)} placeholder="اسم تصنيف جديد" /><Button type="button" variant="outline" onClick={() => void addCategory()} className="shrink-0">(+ تصنيف جديد)</Button></div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold">التاجر/المندوب</label>
                <div className="flex gap-2"><select value={supplierId} onChange={event => { const chosen = supplierOptions.find(row => row.id === event.target.value); setSupplierId(event.target.value); setSupplier(chosen?.name || ""); }} disabled={!categoryId} className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 disabled:bg-gray-100"><option value="">اختر التاجر أو المندوب</option>{supplierOptions.filter(row => row.category_id === categoryId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><Button type="button" variant="outline" size="icon" aria-label="حذف المورد المحدد" title="حذف المورد المحدد" disabled={!supplierId} onClick={() => void removeSupplier()}><Trash2 className="h-4 w-4 text-red-600" /></Button></div>
                <div className="flex gap-2"><Input value={newSupplierName} onChange={event => setNewSupplierName(event.target.value)} placeholder="اسم تاجر أو مندوب جديد" disabled={!categoryId} /><Button type="button" variant="outline" onClick={() => void addSupplier()} disabled={!categoryId} className="shrink-0">(+ اسم جديد)</Button></div>
              </div>
              <label className="text-sm font-bold">تاريخ الفاتورة</label><Input type="date" value={invoiceDate} onChange={event => setInvoiceDate(event.target.value)} />
              <label className="text-sm font-bold">ملاحظات</label><Textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="ملاحظات اختيارية" />
            </div>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-sm"><thead className="bg-gray-100"><tr><th className="p-2 text-right">الصنف</th><th className="p-2 text-right">الباركود</th><th className="p-2 text-right">الكمية</th><th className="p-2 text-right">سعر الشراء</th><th className="p-2 text-right">سعر البيع</th><th className="p-2 text-right">إجمالي البند</th><th className="p-2 text-right">مقارنة آخر شراء</th><th className="p-2 text-right">أفضل مورد</th><th className="p-2">ثقة القراءة</th><th /></tr></thead>
            <tbody>{parsedItems.map((item, index) => {
              const insight = priceInsights[index] || emptyInsight; const trend = trendFor(insight); const percent = percentFor(insight);
              return <tr key={index} className="border-b align-top">
                <td className="p-2"><Input value={item.name} onChange={event => updateItem(index, "name", event.target.value)} /></td>
                <td className="p-2"><Input value={item.barcode} onChange={event => updateItem(index, "barcode", event.target.value)} /></td>
                <td className="p-2"><Input type="number" min="0" value={item.quantity} onChange={event => updateItem(index, "quantity", event.target.value)} /></td>
                <td className="p-2"><Input type="number" min="0" step="0.01" value={item.unitCost} onChange={event => updateItem(index, "unitCost", event.target.value)} /></td>
                <td className="p-2"><Input type="number" min="0" step="0.01" value={item.salePrice ?? insight.sellingPrice ?? ""} placeholder="غير مسجل" onChange={event => updateItem(index, "salePrice", event.target.value)} /></td>
                <td className="p-2 font-bold">{item.totalCost.toFixed(2)} ج.م</td>
                <td className="p-2">
                  <div className={`rounded-lg px-2 py-1 text-xs font-bold ${trend === "up" ? "bg-red-100 text-red-700" : trend === "down" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                    {trend === "up" ? <><TrendingUp className="ml-1 inline h-4 w-4" />زاد السعر {percent == null ? "من سعر سابق صفري" : `${percent.toFixed(1)}%`} عن آخر شراء.</> : trend === "down" ? <><TrendingDown className="ml-1 inline h-4 w-4" />انخفض السعر {percent == null ? "" : `بمقدار ${Math.abs(percent).toFixed(1)}%`} عن آخر شراء.</> : trend === "stable" && insight.previousUnitCost != null ? <>السعر ثابت مقارنة بآخر شراء.</> : "لا يوجد سجل شراء سابق"}
                  </div>
                  {insight.previousSupplierName && <p className="mt-1 text-[11px] text-gray-500">آخر مورد: {insight.previousSupplierName} · {insight.previousUnitCost?.toFixed(2)} ج.م</p>}
                </td>
                <td className="p-2">{insight.cheapestSupplierName ? <div className={insight.savingVsCheapest != null && insight.savingVsCheapest > 0 ? "rounded-lg bg-amber-100 p-2 text-xs text-amber-800" : "rounded-lg bg-green-100 p-2 text-xs text-green-800"}>{insight.savingVsCheapest != null && insight.savingVsCheapest > 0 ? <><AlertTriangle className="ml-1 inline h-3 w-3" />أغلى بـ {insight.savingVsCheapest.toFixed(2)} ج.م من {insight.cheapestSupplierName}</> : <>⭐ الأرخص حالياً: {insight.cheapestSupplierName}</>}<div className="mt-1">{insight.cheapestUnitCost?.toFixed(2)} ج.م</div></div> : <span className="text-xs text-gray-400">لا توجد مقارنة</span>}</td>
                <td className="p-2 text-center">{item.confidence ? `${Math.round(item.confidence * 100)}%` : "يدوي"}</td>
                <td className="p-2"><Button variant="ghost" size="icon" onClick={() => setParsedItems(rows => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4 text-red-600" /></Button></td>
              </tr>;
            })}</tbody></table></div>
          <div className="grid gap-2 rounded-xl border bg-gray-50 p-3 sm:grid-cols-3 sm:items-end"><label className="text-sm font-bold">إجمالي الفاتورة يدوياً (اختياري)<Input type="number" min="0" step="0.01" value={manualTotal} onChange={event => setManualTotal(event.target.value)} placeholder={`افتراضي: ${calculatedTotal.toFixed(2)} ج.م`} /></label><p className="text-sm text-gray-600">إجمالي البنود: {calculatedTotal.toFixed(2)} ج.م</p><strong className="text-sm">الإجمالي المعتمد: {totalDraft.toFixed(2)} ج.م</strong></div>
          <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" onClick={() => setParsedItems(rows => [...rows, { name: "", barcode: "", quantity: 1, unitCost: 0, salePrice: null, totalCost: 0, confidence: 0 }])}><Plus className="ml-2 h-4 w-4" />إضافة سطر عند الحاجة</Button><div className="flex gap-2"><Button variant="outline" className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100" onClick={resetDraft}>إلغاء الفاتورة / مسح المسودة</Button><Button onClick={() => void saveInvoice()} disabled={isSaving || processing || manualTotalInvalid || !categoryId || !supplierId || !invoiceDate || (!imageDataUrl && !uploadedImageUrl && !manualTotal.trim() && !parsedItems.some(item => item.name.trim()))} className="bg-green-600"><Save className="ml-2 h-4 w-4" />حفظ سحابياً</Button></div></div>
        </CardContent>
      </Card>}

      {parsedItems.length > 0 && !processing && <Card><CardHeader><CardTitle>رادار حركة الأسعار والمقارنة بين الموردين</CardTitle></CardHeader><CardContent className="space-y-2">{parsedItems.map((item, index) => {
        const insight = priceInsights[index] || emptyInsight; const trend = trendFor(insight); const percent = percentFor(insight);
        return <div key={`${item.name}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"><div><strong>{item.name || "صنف بدون اسم"}</strong><span className="mr-3 text-sm text-gray-600">شراء: {item.unitCost.toFixed(2)} ج.م · إجمالي: {item.totalCost.toFixed(2)} ج.م · بيع: {(item.salePrice ?? insight.sellingPrice)?.toFixed(2) || "غير مسجل"} ج.م</span>{trend === "up" && <span className="mr-2 text-sm font-bold text-red-600">⚠️ تنبيه: ارتفع {percent == null ? "من سعر سابق صفري" : `${percent.toFixed(1)}%`} مقارنة بآخر شراء</span>}{trend === "down" && <span className="mr-2 text-sm font-bold text-green-600"><TrendingDown className="ml-1 inline h-4 w-4" />انخفض السعر{percent == null ? "" : ` (${Math.abs(percent).toFixed(1)}%)`}</span>}{trend === "stable" && insight.previousUnitCost != null && <span className="mr-2 text-sm font-bold text-gray-500">السعر ثابت</span>}{insight.cheapestSupplierName && insight.savingVsCheapest != null && insight.savingVsCheapest > 0 && <span className="mr-2 text-sm font-bold text-amber-700">⚠️ الأرخص: {insight.cheapestSupplierName}</span>}</div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void showHistory(item)}><History className="ml-1 h-4 w-4" />تفاصيل المقارنة</Button><Button size="sm" variant="outline" onClick={() => navigate(`/products?search=${encodeURIComponent(item.name)}`)}>تحديث سعر البيع</Button><Button size="sm" variant="outline" onClick={() => navigate(`/smart-offers?item=${encodeURIComponent(item.name)}`)}>توليد عرض</Button></div></div>;
      })}</CardContent></Card>}
        </TabsContent>
        <TabsContent value="radar" className="mt-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>مقارنة أسعار الصنف بين الموردين</CardTitle><CardDescription>تعرض أحدث سعر شراء مسجل لكل مورد وتاريخ آخر فاتورة للصنف من أرشيف Supabase.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {invoiceListError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">تعذر تحميل الأسعار المحفوظة. {invoiceListError}<Button size="sm" variant="outline" className="mr-3" onClick={() => void refreshInvoices()}>إعادة التحميل</Button></div>
                : !invoicesLoaded ? <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />جارٍ تحميل بيانات الأسعار من Supabase...</p>
                  : !savedItemNames.length ? <p className="text-sm text-gray-500">لا توجد بنود محفوظة يمكن مقارنتها بعد.</p>
                    : <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-1 text-sm font-semibold">بحث عن صنف محفوظ
                          <Input value={radarSearch} onChange={event => { setRadarSearch(event.target.value); setRadarSelectedItem(""); }} placeholder="اكتب اسم الصنف لتصفية القائمة" />
                        </label>
                        <label className="space-y-1 text-sm font-semibold">اختيار الصنف
                          <select value={radarSelectedItem} onChange={event => { setRadarSelectedItem(event.target.value); setRadarSearch(event.target.value); }} className="w-full rounded-md border bg-white px-3 py-2 text-sm" disabled={!radarSelectableItems.length}>
                            <option value="">اختر صنفاً من الفواتير المحفوظة</option>
                            {radarSelectableItems.map(name => <option key={name} value={name}>{name}</option>)}
                          </select>
                        </label>
                      </div>
                      {!radarSelectedItem ? <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">اختر الصنف لعرض أحدث سعر لدى كل مورد.</p>
                        : !supplierPriceRows.length ? <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">لا توجد أسعار محفوظة لهذا الصنف.</p>
                          : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[640px] text-sm">
                            <thead className="bg-gray-100"><tr><th className="p-3 text-right">المورد</th><th className="p-3 text-right">سعر الشراء للوحدة</th><th className="p-3 text-right">تاريخ آخر فاتورة</th><th className="p-3 text-right">المقارنة</th></tr></thead>
                            <tbody>{supplierPriceRows.map(row => {
                              const isCheapest = cheapestSavedPrice != null && row.unitCost === cheapestSavedPrice;
                              return <tr key={row.supplierKey} className={`border-t ${isCheapest ? "bg-green-50 text-green-900" : "bg-white"}`}>
                                <td className="p-3 font-semibold">{row.supplierName}</td><td className="p-3 font-bold">{row.unitCost.toFixed(2)} ج.م</td><td className="p-3">{row.invoiceDate || "غير مسجل"}</td><td className="p-3">{isCheapest ? <span className="rounded-full bg-green-200 px-3 py-1 text-xs font-bold text-green-900">الأرخص</span> : <span className="text-gray-500">—</span>}</td>
                              </tr>;
                            })}</tbody>
                          </table></div>}
                    </>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>رادار الزيادات التلقائي</CardTitle><CardDescription>يراجع أحدث فاتورة محفوظة لكل صنف ويقارنها بالفاتورة السابقة للصنف نفسه.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {invoiceListError ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">تعذر تحميل تنبيهات الأسعار. {invoiceListError}</p>
                : !invoicesLoaded ? <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />جارٍ تحليل سجل الأسعار...</p>
                  : !priceIncreaseAlerts.length ? <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">لا توجد زيادات سعرية بين أحدث فاتورة والفاتورة السابقة للأصناف المحفوظة.</p>
                    : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[900px] text-sm">
                      <thead className="bg-gray-100"><tr><th className="p-3 text-right">الصنف</th><th className="p-3 text-right">السعر السابق</th><th className="p-3 text-right">السعر الجديد</th><th className="p-3 text-right">قيمة الزيادة</th><th className="p-3 text-right">نسبة الزيادة</th><th className="p-3 text-right">المورد</th><th className="p-3 text-right">تاريخ الفاتورة</th></tr></thead>
                      <tbody>{priceIncreaseAlerts.map(alert => <tr key={`${alert.itemName}-${alert.invoiceId}`} className="border-t bg-red-50/70">
                        <td className="p-3 font-bold">{alert.itemName}</td><td className="p-3">{alert.previousCost.toFixed(2)} ج.م</td><td className="p-3 font-bold text-red-700">{alert.unitCost.toFixed(2)} ج.م</td><td className="p-3 font-bold text-red-700">+{alert.increase.toFixed(2)} ج.م</td><td className="p-3">{alert.percent == null ? "غير متاحة (السابق صفر)" : `${alert.percent.toFixed(1)}%`}</td><td className="p-3">{alert.supplierName}</td><td className="p-3">{alert.invoiceDate || "غير مسجل"}</td>
                      </tr>)}</tbody>
                    </table></div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="saved" className="mt-2 space-y-6">
      <Card><CardHeader><CardTitle>الفواتير المحفوظة سحابياً{invoicesLoaded && !invoiceListError ? savedInvoices.length ? ` (${savedInvoices.length})` : unlinkedImagesLoading ? "" : unlinkedImages.length ? ` (${unlinkedImages.length} صور تحتاج ربطاً)` : " (لا توجد سجلات بعد)" : ""}</CardTitle><CardDescription>الأرشيف ومرفقات الفواتير تتم مزامنتها مع Supabase بين أجهزة المشرفين والمديرين.</CardDescription></CardHeader><CardContent className="space-y-3">
        {!invoicesLoaded && !invoiceListError ? <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />جارٍ تحميل الأرشيف السحابي...</p> : invoiceListError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p>تعذر تحميل الأرشيف؛ لم تُعرض القائمة كأنها فارغة. {invoiceListError}</p><Button size="sm" variant="outline" className="mt-2" onClick={() => void refreshInvoices()}>إعادة التحميل</Button></div> : savedInvoices.length === 0 ? <p className="text-sm text-gray-500">{unlinkedImagesLoading ? "جارٍ التحقق من صور الفواتير المرفوعة سابقاً..." : unlinkedImages.length ? `توجد ${unlinkedImages.length} صور قديمة في Storage بانتظار ربطها بسجلات فواتير؛ يمكن استعادتها من القسم أدناه.` : "لا توجد فواتير محفوظة بعد."}</p> : savedInvoices.map(invoice => <div key={invoice.id} className="rounded-xl border bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{invoice.supplier_name}</strong><span className="mr-3 text-sm text-gray-500">{invoice.invoice_date} · {Number(invoice.total_amount).toFixed(2)} ج.م</span></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={loadingInvoicePreview || (!invoice.image_url && !invoice.telegram_file_id)} onClick={() => void openInvoicePreview(invoice)}>{loadingInvoicePreview ? "جارٍ التحميل…" : invoice.image_url || invoice.telegram_file_id ? "عرض صورة الفاتورة" : "لا توجد صورة"}</Button><Button size="sm" variant="outline" onClick={() => setExpandedInvoice(expandedInvoice === invoice.id ? null : invoice.id)}>{expandedInvoice === invoice.id ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}البنود</Button><Button size="sm" variant="destructive" onClick={async () => { if (confirm("حذف سجل الفاتورة؟ ستبقى الصورة في Storage قابلة للاستعادة.")) { try { await deleteSupplierInvoice(invoice.id); await Promise.all([refreshInvoices(), refreshUnlinkedImages()]); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف الفاتورة."); } } }}><Trash2 className="ml-1 h-4 w-4" />حذف</Button></div></div>
          {expandedInvoice === invoice.id && <div className="mt-3 grid gap-2 md:grid-cols-2">{invoice.items.map(item => <div key={item.id} className={`rounded-lg p-3 ${item.price_direction === "up" ? "bg-red-50" : item.price_direction === "down" ? "bg-green-50" : "bg-gray-50"}`}><div className="flex items-center justify-between"><strong>{item.item_name}</strong><span>{item.price_direction === "up" ? "↗️" : item.price_direction === "down" ? "↘️" : "➡️"} شراء {Number(item.unit_cost).toFixed(2)} ج.م</span></div><p className="text-xs text-gray-600">الكمية {item.quantity} · إجمالي البند {Number(item.total_cost).toFixed(2)} ج.م · سعر البيع {item.sale_price == null ? "غير مسجل" : `${Number(item.sale_price).toFixed(2)} ج.م`} · {item.previous_cost == null ? "أول سعر مسجل" : `الفرق ${Number(item.price_diff).toFixed(2)} ج.م`}</p></div>)}</div>}
        </div>)}
      </CardContent></Card>

      {unlinkedImagesError && <Card><CardContent className="pt-5"><div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">تعذر تحميل صور Storage غير المرتبطة. {unlinkedImagesError}<Button size="sm" variant="outline" className="mr-3" onClick={() => void refreshUnlinkedImages()}>إعادة التحميل</Button></div></CardContent></Card>}
      {!unlinkedImagesError && unlinkedImagesLoading && <Card><CardContent className="pt-5"><p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />جارٍ التحقق من صور Storage غير المرتبطة...</p></CardContent></Card>}
      {unlinkedImages.length > 0 && <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>صور قديمة غير مرتبطة بسجل فاتورة ({unlinkedImages.length})</CardTitle><CardDescription>هذه الصور موجودة سحابياً لكنها لم تُسجل كفواتير. أعد قراءتها، ثم أدخل اسم المورد وتاريخ الفاتورة الصحيحين واحفظها لربط الصورة بالأرشيف.</CardDescription></div><Button variant="destructive" size="sm" disabled={isDeletingAllUnlinked || Boolean(deletingImagePath)} onClick={() => void deleteAllUnlinkedImages()}>{isDeletingAllUnlinked ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Trash2 className="ml-2 h-4 w-4" />}مسح جميع الصور المعلقة دفعة واحدة</Button></div></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{unlinkedImages.map(image => <div key={image.path} className="rounded-xl border bg-white p-3"><a href={image.imageUrl} target="_blank" rel="noopener noreferrer"><img src={image.imageUrl} alt="صورة فاتورة قديمة غير مرتبطة" className="h-44 w-full rounded-lg bg-gray-50 object-contain" /></a><p className="mt-2 truncate text-xs text-gray-500">{image.path.split("/").pop()}</p>{image.createdAt && <p className="text-xs text-gray-500">وقت الرفع: {new Date(image.createdAt).toLocaleString("ar-EG")}</p>}<div className="mt-3 grid gap-2"><Button variant="outline" disabled={processing || Boolean(adoptingImagePath) || Boolean(deletingImagePath) || isDeletingAllUnlinked} onClick={() => void adoptStoredImage(image)}>{adoptingImagePath === image.path ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جارٍ الاستعادة والقراءة...</> : "إعادة القراءة وربطها بالأرشيف"}</Button><Button variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" disabled={processing || Boolean(adoptingImagePath) || isDeletingAllUnlinked} onClick={() => void deleteUnlinkedImage(image)}>{deletingImagePath === image.path ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Trash2 className="ml-2 h-4 w-4" />}حذف الصورة نهائياً</Button></div></div>)}</CardContent></Card>}
        </TabsContent>
      </Tabs>

      {invoicePreviewUrl && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" onClick={closeInvoicePreview}><Card className="max-h-[90vh] w-full max-w-3xl overflow-auto" onClick={event => event.stopPropagation()}><CardHeader><CardTitle>صورة فاتورة المورد</CardTitle></CardHeader><CardContent><img src={invoicePreviewUrl} alt="صورة فاتورة المورد المؤرشفة" className="max-h-[70vh] w-full rounded-lg object-contain" /><Button className="mt-4 w-full" onClick={closeInvoicePreview}>إغلاق</Button></CardContent></Card></div>}
      {history.length > 0 && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setHistory([])}><Card className="max-h-[80vh] w-full max-w-3xl overflow-auto" onClick={event => event.stopPropagation()}><CardHeader><CardTitle>سجل ومقارنة أسعار: {historyName}</CardTitle></CardHeader><CardContent><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-right">المورد</th><th className="p-2 text-right">سعر الشراء</th><th className="p-2 text-right">إجمالي البند</th><th className="p-2 text-right">سعر البيع</th><th className="p-2 text-right">التاريخ</th><th className="p-2">الحالة</th></tr></thead><tbody>{history.map(row => <tr key={`${row.invoiceId}-${row.supplierName}`} className="border-b"><td className="p-2">{row.supplierName}</td><td className="p-2 font-bold">{row.unitCost.toFixed(2)} ج.م</td><td className="p-2">{row.totalCost.toFixed(2)} ج.م</td><td className="p-2">{row.salePrice == null ? "غير مسجل" : `${row.salePrice.toFixed(2)} ج.م`}</td><td className="p-2">{row.invoiceDate}</td><td className="p-2">{row.isCheapest ? "⭐ أفضل صفقة" : "أغلى من الأرخص"}</td></tr>)}</tbody></table><Button className="mt-4 w-full" onClick={() => setHistory([])}>إغلاق</Button></CardContent></Card></div>}
      {isApiKeyModalOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true"><Card className="w-full max-w-md"><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-blue-600" />إعداد قراءة الفواتير بالذكاء الاصطناعي</CardTitle><CardDescription>أدخل مفتاح Gemini API المجاني مرة واحدة. سيُحفظ محلياً على هذا الجهاز ويُرسل فقط لطلب قراءة الفاتورة.</CardDescription></CardHeader><CardContent className="space-y-3"><Input type="password" dir="ltr" autoFocus value={ocrApiKey} onChange={event => setOcrApiKey(event.target.value)} placeholder="AIza..." onKeyDown={event => { if (event.key === "Enter") saveOcrApiKey(); }} /><p className="text-xs text-slate-500">يمكنك الحصول على المفتاح من Google AI Studio. لا يحفظ التطبيق المفتاح في قاعدة بيانات المتجر.</p><div className="flex gap-2"><Button className="flex-1" onClick={saveOcrApiKey}>حفظ وإعادة القراءة</Button><Button variant="outline" onClick={() => { setIsApiKeyModalOpen(false); setPendingOcrDataUrl(""); }}>لاحقاً</Button></div></CardContent></Card></div>}
    </main>
  </div>;
}
