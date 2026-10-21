import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, Camera, ChevronDown, ChevronUp, History, Loader2, Plus, Save, Trash2, TrendingDown, TrendingUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { getActiveShopContext } from "@/lib/supabase/products";
import { createSupplierInvoiceCategory, deleteSupplierInvoice, getSupplierPriceInsights, listSupplierInvoiceCategories, listSupplierInvoices, listSupplierPriceHistory, listUnlinkedSupplierInvoiceImages, saveSupplierInvoice, subscribeToSupplierInvoiceRealtime, uploadSupplierInvoiceImage, type SupplierInvoice, type SupplierInvoiceCategory, type SupplierPriceComparison, type SupplierPriceInsight, type UnlinkedSupplierInvoiceImage } from "@/lib/supabase/supplierInvoices";
import { fileToDataUrl, prepareSupplierInvoiceImage } from "@/lib/supabase/prepareSupplierInvoiceImage";

interface ParsedItem { name: string; barcode: string; quantity: number; unitCost: number; totalCost: number; confidence: number; }
const emptyInsight: SupplierPriceInsight = { previousUnitCost: null, previousSupplierName: null, priceDiff: null, cheapestUnitCost: null, cheapestSupplierName: null, savingVsCheapest: null };
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

export default function InvoiceOCR() {
  const [, navigate] = useLocation();
  const [invoiceImage, setInvoiceImage] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [priceInsights, setPriceInsights] = useState<SupplierPriceInsight[]>([]);
  const [supplier, setSupplier] = useState("");
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
  const [categories, setCategories] = useState<SupplierInvoiceCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [history, setHistory] = useState<SupplierPriceComparison[]>([]);
  const [historyName, setHistoryName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previousTrendRef = useRef<Record<number, "up" | "down" | "stable">>({});
  const parseInvoice = trpc.invoiceOCR.parse.useMutation();

  const refreshInvoices = async () => {
    try {
      setInvoiceListError("");
      setSavedInvoices(await listSupplierInvoices());
      setInvoicesLoaded(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تحميل أرشيف فواتير الموردين.";
      setInvoiceListError(message);
      toast.error(message);
    }
  };
  const refreshCategories = async () => {
    try { setCategories(await listSupplierInvoiceCategories()); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحميل فئات الفواتير."); }
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
        if (active) stop = subscribeToSupplierInvoiceRealtime(shopId, () => { void refreshInvoices(); void refreshUnlinkedImages(); });
      } catch { /* يظهر الخطأ عند العملية */ }
    })();
    return () => { active = false; stop?.(); };
  }, []);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const refreshPriceInsights = async (items: ParsedItem[]) => {
    const valid = items.filter(item => item.name.trim());
    if (!valid.length) { setPriceInsights(items.map(() => emptyInsight)); return; }
    setIsCheckingPrices(true);
    try {
      const result = await getSupplierPriceInsights(valid.map(item => ({ itemName: item.name, barcode: item.barcode, unitCost: item.unitCost })));
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
      const result = await parseInvoice.mutateAsync({ imageDataUrl: dataUrl, supplierName: supplier, invoiceDate });
      const items = (result.items || []).map(item => {
        const quantity = Math.max(0, Number(item.quantity) || 0);
        const unitCost = Math.max(0, Number(item.unitCost) || 0);
        const totalCost = Math.round((Number(item.totalCost) || quantity * unitCost) * 100) / 100;
        return { name: item.name, barcode: item.barcode || "", quantity, unitCost, totalCost, confidence: Number(item.confidence) || 0 };
      }).filter(item => item.name.trim());
      if (!items.length) throw new Error("لم تُستخرج بنود مقروءة من هذه الصورة. أعد التصوير بإضاءة أوضح.");
      setParsedItems(items);
      toast.success(`تم استخراج ${items.length} بند تلقائياً وتشغيل رادار الأسعار.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذرت قراءة الفاتورة. أعد المحاولة بعد التحقق من وضوح الصورة والاتصال.";
      setOcrError(message);
      toast.error(message);
    } finally { setIsProcessing(false); }
  };

  const handleImageUpload = async (file?: File) => {
    if (!file) return;
    try {
      setOcrError(""); setParsedItems([]); setPriceInsights([]); setUploadedImageUrl("");
      setIsCompressing(true);
      const compressed = await prepareSupplierInvoiceImage(file);
      const dataUrl = await fileToDataUrl(compressed);
      setImageDataUrl(dataUrl);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const previewUrl = URL.createObjectURL(compressed);
      previewUrlRef.current = previewUrl;
      setInvoiceImage(previewUrl);
      setIsCompressing(false);
      setIsUploading(true);
      const publicUrl = await uploadSupplierInvoiceImage(compressed);
      setUploadedImageUrl(publicUrl);
      setIsUploading(false);
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
      setImageDataUrl(dataUrl); setUploadedImageUrl(image.imageUrl); setInvoiceDate(""); setSupplier("");
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
    setInvoiceImage(null); setImageDataUrl(""); setUploadedImageUrl(""); setParsedItems([]); setPriceInsights([]); setSupplier(""); setNotes(""); setCategoryId(""); setOcrError(""); previousTrendRef.current = {};
  };

  const updateItem = (index: number, field: keyof ParsedItem, value: string) => setParsedItems(rows => rows.map((row, rowIndex) => {
    if (rowIndex !== index) return row;
    const numericNext = Number(value) || 0;
    const updated = { ...row, [field]: field === "name" || field === "barcode" ? value : numericNext };
    if (field === "quantity" || field === "unitCost") updated.totalCost = Math.round(((field === "quantity" ? numericNext : row.quantity) * (field === "unitCost" ? numericNext : row.unitCost)) * 100) / 100;
    return updated;
  }));

  const addCategory = async () => {
    if (!newCategoryName.trim()) { toast.error("اكتب اسم الفئة أولاً."); return; }
    try {
      const row = await createSupplierInvoiceCategory(newCategoryName);
      setCategories(rows => [...rows, row].sort((a, b) => a.name.localeCompare(b.name, "ar")));
      setCategoryId(row.id); setNewCategoryName(""); toast.success("تم حفظ الفئة سحابياً.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الفئة سحابياً."); }
  };

  const saveInvoice = async () => {
    if (!uploadedImageUrl) { toast.error("ارفع صورة الفاتورة إلى الأرشيف أولاً."); return; }
    if (!supplier.trim()) { toast.error("أدخل اسم المورد قبل حفظ الفاتورة."); return; }
    if (!invoiceDate) { toast.error("أدخل تاريخ الفاتورة الصحيح قبل حفظها."); return; }
    if (!parsedItems.some(item => item.name.trim())) { toast.error("أضف بنداً واحداً على الأقل."); return; }
    try {
      setIsSaving(true);
      await saveSupplierInvoice({ supplierName: supplier, invoiceDate, categoryId: categoryId || null, imageUrl: uploadedImageUrl, notes, items: parsedItems.map(item => ({ itemName: item.name, barcode: item.barcode, quantity: item.quantity, unitCost: item.unitCost, totalCost: item.totalCost })) });
      toast.success("تم حفظ الفاتورة وبنودها سحابياً وتحديث رادار الأسعار.");
      resetDraft(); await Promise.all([refreshInvoices(), refreshUnlinkedImages()]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الفاتورة سحابياً."); }
    finally { setIsSaving(false); }
  };

  const showHistory = async (item: ParsedItem) => {
    try { setHistoryName(item.name); setHistory(await listSupplierPriceHistory(item.name, item.barcode)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحميل سجل السعر."); }
  };
  const totalDraft = parsedItems.reduce((sum, item) => sum + item.totalCost, 0);
  const trendFor = (insight: SupplierPriceInsight) => insight.priceDiff == null ? "stable" : insight.priceDiff > 0 ? "up" : insight.priceDiff < 0 ? "down" : "stable";
  const percentFor = (insight: SupplierPriceInsight) => {
    if (insight.previousUnitCost == null || insight.previousUnitCost === 0) return null;
    return ((insight.priceDiff || 0) / insight.previousUnitCost) * 100;
  };
  const processing = isCompressing || isUploading || isProcessing;

  return <div className="min-h-screen bg-gray-50 p-4" dir="rtl">
    <header className="mx-auto flex max-w-7xl items-center justify-between py-4">
      <div><h1 className="text-3xl font-bold text-gray-900">فواتير الموردين ومستشار المشتريات</h1><p className="mt-1 text-gray-600">رفع سحابي، قراءة ذكية، حركة أسعار، ومقارنة فورية بين الموردين</p></div>
      <Button variant="outline" onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-2 h-4 w-4" />العودة</Button>
    </header>
    <main className="mx-auto max-w-7xl space-y-6">
      {!invoiceImage ? <Card>
        <CardHeader><CardTitle>إضافة فاتورة مورد</CardTitle><CardDescription>التقط صورة واضحة أو ارفعها من المعرض؛ ستُضغط الصورة وتُقرأ البنود تلقائياً ثم تحفظ في الأرشيف السحابي.</CardDescription></CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <Input value={newCategoryName} onChange={event => setNewCategoryName(event.target.value)} placeholder="اسم فئة جديدة مثل: فواتير شهر أكتوبر" />
            <Button variant="outline" onClick={() => void addCategory()}>حفظ الفئة سحابياً</Button>
            <select value={categoryId} onChange={event => setCategoryId(event.target.value)} className="rounded-md border bg-white px-3"><option value="">بدون فئة</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Button onClick={() => cameraInputRef.current?.click()} disabled={processing} className="h-28 bg-blue-600"><Camera className="ml-2" />التقاط بالكاميرا</Button>
            <Button onClick={() => fileInputRef.current?.click()} disabled={processing} className="h-28 bg-green-600"><Upload className="ml-2" />رفع من المعرض</Button>
          </div>
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
            <div><img src={invoiceImage} alt="صورة فاتورة المورد بعد ضغطها" className="max-h-[620px] w-full rounded-xl border object-contain" /><p className="mt-2 text-xs text-green-700">أرشفة الصورة السحابية: {isUploading ? "جارية الآن..." : uploadedImageUrl ? "تم الرفع؛ ستحفظ مع الفاتورة" : "لم تبدأ"}</p></div>
            <div className="space-y-3">
              <label className="text-sm font-bold">الفئة</label><select value={categoryId} onChange={event => setCategoryId(event.target.value)} className="rounded-md border bg-white px-3 py-2"><option value="">بدون فئة</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
              <label className="text-sm font-bold">اسم المورد</label><Input value={supplier} onChange={event => setSupplier(event.target.value)} placeholder="اسم المورد" />
              <label className="text-sm font-bold">تاريخ الفاتورة</label><Input type="date" value={invoiceDate} onChange={event => setInvoiceDate(event.target.value)} />
              <label className="text-sm font-bold">ملاحظات</label><Textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="ملاحظات اختيارية" />
            </div>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-gray-100"><tr><th className="p-2 text-right">الصنف</th><th className="p-2 text-right">الباركود</th><th className="p-2 text-right">الكمية</th><th className="p-2 text-right">سعر الوحدة</th><th className="p-2 text-right">الإجمالي</th><th className="p-2 text-right">مقارنة آخر شراء</th><th className="p-2 text-right">أفضل مورد</th><th className="p-2">ثقة القراءة</th><th /></tr></thead>
            <tbody>{parsedItems.map((item, index) => {
              const insight = priceInsights[index] || emptyInsight; const trend = trendFor(insight); const percent = percentFor(insight);
              return <tr key={index} className="border-b align-top">
                <td className="p-2"><Input value={item.name} onChange={event => updateItem(index, "name", event.target.value)} /></td>
                <td className="p-2"><Input value={item.barcode} onChange={event => updateItem(index, "barcode", event.target.value)} /></td>
                <td className="p-2"><Input type="number" min="0" value={item.quantity} onChange={event => updateItem(index, "quantity", event.target.value)} /></td>
                <td className="p-2"><Input type="number" min="0" step="0.01" value={item.unitCost} onChange={event => updateItem(index, "unitCost", event.target.value)} /></td>
                <td className="p-2 font-bold">{item.totalCost.toFixed(2)} ج.م</td>
                <td className="p-2">
                  <div className={`rounded-lg px-2 py-1 text-xs font-bold ${trend === "up" ? "bg-red-100 text-red-700" : trend === "down" || (trend === "stable" && insight.previousUnitCost != null) ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                    {trend === "up" ? <><AlertTriangle className="ml-1 inline h-4 w-4" />تنبيه: ارتفع السعر {percent == null ? "من سعر سابق صفري" : `${percent.toFixed(1)}%`} عن آخر شراء.</> : trend === "down" || (trend === "stable" && insight.previousUnitCost != null) ? <>🟢 السعر {trend === "stable" ? "مساوٍ" : "أقل"} أو أفضل من آخر شراء{percent == null ? "" : ` (${percent.toFixed(1)}%)`}.</> : "لا يوجد سجل شراء سابق"}
                  </div>
                  {insight.previousSupplierName && <p className="mt-1 text-[11px] text-gray-500">آخر مورد: {insight.previousSupplierName} · {insight.previousUnitCost?.toFixed(2)} ج.م</p>}
                </td>
                <td className="p-2">{insight.cheapestSupplierName ? <div className={insight.savingVsCheapest != null && insight.savingVsCheapest > 0 ? "rounded-lg bg-amber-100 p-2 text-xs text-amber-800" : "rounded-lg bg-green-100 p-2 text-xs text-green-800"}>{insight.savingVsCheapest != null && insight.savingVsCheapest > 0 ? <><AlertTriangle className="ml-1 inline h-3 w-3" />أغلى بـ {insight.savingVsCheapest.toFixed(2)} ج.م من {insight.cheapestSupplierName}</> : <>⭐ الأرخص حالياً: {insight.cheapestSupplierName}</>}<div className="mt-1">{insight.cheapestUnitCost?.toFixed(2)} ج.م</div></div> : <span className="text-xs text-gray-400">لا توجد مقارنة</span>}</td>
                <td className="p-2 text-center">{item.confidence ? `${Math.round(item.confidence * 100)}%` : "يدوي"}</td>
                <td className="p-2"><Button variant="ghost" size="icon" onClick={() => setParsedItems(rows => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4 text-red-600" /></Button></td>
              </tr>;
            })}</tbody></table></div>
          <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" onClick={() => setParsedItems(rows => [...rows, { name: "", barcode: "", quantity: 1, unitCost: 0, totalCost: 0, confidence: 0 }])}><Plus className="ml-2 h-4 w-4" />إضافة سطر عند الحاجة</Button><strong>الإجمالي العام: {totalDraft.toFixed(2)} ج.م</strong><div className="flex gap-2"><Button variant="outline" onClick={resetDraft}>إلغاء</Button><Button onClick={() => void saveInvoice()} disabled={isSaving || processing || !uploadedImageUrl || !parsedItems.length} className="bg-green-600"><Save className="ml-2 h-4 w-4" />حفظ سحابياً</Button></div></div>
        </CardContent>
      </Card>}

      {parsedItems.length > 0 && !processing && <Card><CardHeader><CardTitle>رادار حركة الأسعار والمقارنة بين الموردين</CardTitle></CardHeader><CardContent className="space-y-2">{parsedItems.map((item, index) => {
        const insight = priceInsights[index] || emptyInsight; const trend = trendFor(insight); const percent = percentFor(insight);
        return <div key={`${item.name}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"><div><strong>{item.name || "صنف بدون اسم"}</strong><span className="mr-3 text-sm text-gray-600">سعر الشراء: {item.unitCost.toFixed(2)} ج.م</span>{trend === "up" && <span className="mr-2 text-sm font-bold text-red-600">⚠️ تنبيه: ارتفع {percent == null ? "من سعر سابق صفري" : `${percent.toFixed(1)}%`} مقارنة بآخر شراء</span>}{(trend === "down" || (trend === "stable" && insight.previousUnitCost != null)) && <span className="mr-2 text-sm font-bold text-green-600">🟢 السعر مساوٍ أو أفضل/أقل من المعتاد{percent == null ? "" : ` (${percent.toFixed(1)}%)`}</span>}{insight.cheapestSupplierName && insight.savingVsCheapest != null && insight.savingVsCheapest > 0 && <span className="mr-2 text-sm font-bold text-amber-700">⚠️ الأرخص: {insight.cheapestSupplierName}</span>}</div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void showHistory(item)}><History className="ml-1 h-4 w-4" />تفاصيل المقارنة</Button><Button size="sm" variant="outline" onClick={() => navigate(`/products?search=${encodeURIComponent(item.name)}`)}>تحديث سعر البيع</Button><Button size="sm" variant="outline" onClick={() => navigate(`/smart-offers?item=${encodeURIComponent(item.name)}`)}>توليد عرض</Button></div></div>;
      })}</CardContent></Card>}

      <Card><CardHeader><CardTitle>الفواتير المحفوظة سحابياً{invoicesLoaded && !invoiceListError ? savedInvoices.length ? ` (${savedInvoices.length})` : unlinkedImagesLoading ? "" : unlinkedImages.length ? ` (${unlinkedImages.length} صور تحتاج ربطاً)` : " (لا توجد سجلات بعد)" : ""}</CardTitle><CardDescription>الأرشيف ومرفقات الفواتير تتم مزامنتها مع Supabase بين أجهزة المشرفين والمديرين.</CardDescription></CardHeader><CardContent className="space-y-3">
        {!invoicesLoaded && !invoiceListError ? <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />جارٍ تحميل الأرشيف السحابي...</p> : invoiceListError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p>تعذر تحميل الأرشيف؛ لم تُعرض القائمة كأنها فارغة. {invoiceListError}</p><Button size="sm" variant="outline" className="mt-2" onClick={() => void refreshInvoices()}>إعادة التحميل</Button></div> : savedInvoices.length === 0 ? <p className="text-sm text-gray-500">{unlinkedImagesLoading ? "جارٍ التحقق من صور الفواتير المرفوعة سابقاً..." : unlinkedImages.length ? `توجد ${unlinkedImages.length} صور قديمة في Storage بانتظار ربطها بسجلات فواتير؛ يمكن استعادتها من القسم أدناه.` : "لا توجد فواتير محفوظة بعد."}</p> : savedInvoices.map(invoice => <div key={invoice.id} className="rounded-xl border bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{invoice.supplier_name}</strong><span className="mr-3 text-sm text-gray-500">{invoice.invoice_date} · {Number(invoice.total_amount).toFixed(2)} ج.م</span></div><div className="flex gap-2"><a href={invoice.image_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-gray-50">عرض صورة الفاتورة</a><Button size="sm" variant="outline" onClick={() => setExpandedInvoice(expandedInvoice === invoice.id ? null : invoice.id)}>{expandedInvoice === invoice.id ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}البنود</Button><Button size="sm" variant="destructive" onClick={async () => { if (confirm("حذف سجل الفاتورة؟ ستبقى الصورة في Storage قابلة للاستعادة.")) { try { await deleteSupplierInvoice(invoice.id); await Promise.all([refreshInvoices(), refreshUnlinkedImages()]); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف الفاتورة."); } } }}><Trash2 className="ml-1 h-4 w-4" />حذف</Button></div></div>
          {expandedInvoice === invoice.id && <div className="mt-3 grid gap-2 md:grid-cols-2">{invoice.items.map(item => <div key={item.id} className={`rounded-lg p-3 ${item.price_direction === "up" ? "bg-red-50" : item.price_direction === "down" ? "bg-green-50" : "bg-gray-50"}`}><div className="flex items-center justify-between"><strong>{item.item_name}</strong><span>{item.price_direction === "up" ? "↗️" : item.price_direction === "down" ? "↘️" : "➡️"} {Number(item.unit_cost).toFixed(2)} ج.م</span></div><p className="text-xs text-gray-600">الكمية {item.quantity} · الإجمالي {item.total_cost} · {item.previous_cost == null ? "أول سعر مسجل" : `الفرق ${Number(item.price_diff).toFixed(2)} ج.م`}</p></div>)}</div>}
        </div>)}
      </CardContent></Card>

      {unlinkedImagesError && <Card><CardContent className="pt-5"><div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">تعذر تحميل صور Storage غير المرتبطة. {unlinkedImagesError}<Button size="sm" variant="outline" className="mr-3" onClick={() => void refreshUnlinkedImages()}>إعادة التحميل</Button></div></CardContent></Card>}
      {!unlinkedImagesError && unlinkedImagesLoading && <Card><CardContent className="pt-5"><p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />جارٍ التحقق من صور Storage غير المرتبطة...</p></CardContent></Card>}
      {unlinkedImages.length > 0 && <Card><CardHeader><CardTitle>صور قديمة غير مرتبطة بسجل فاتورة ({unlinkedImages.length})</CardTitle><CardDescription>هذه الصور موجودة سحابياً لكنها لم تُسجل كفواتير. أعد قراءتها، ثم أدخل اسم المورد وتاريخ الفاتورة الصحيحين واحفظها لربط الصورة بالأرشيف.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{unlinkedImages.map(image => <div key={image.path} className="rounded-xl border bg-white p-3"><a href={image.imageUrl} target="_blank" rel="noopener noreferrer"><img src={image.imageUrl} alt="صورة فاتورة قديمة غير مرتبطة" className="h-44 w-full rounded-lg bg-gray-50 object-contain" /></a><p className="mt-2 truncate text-xs text-gray-500">{image.path.split("/").pop()}</p>{image.createdAt && <p className="text-xs text-gray-500">وقت الرفع: {new Date(image.createdAt).toLocaleString("ar-EG")}</p>}<Button className="mt-3 w-full" variant="outline" disabled={processing || Boolean(adoptingImagePath)} onClick={() => void adoptStoredImage(image)}>{adoptingImagePath === image.path ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جارٍ الاستعادة والقراءة...</> : "إعادة القراءة وربطها بالأرشيف"}</Button></div>)}</CardContent></Card>}

      {history.length > 0 && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setHistory([])}><Card className="max-h-[80vh] w-full max-w-3xl overflow-auto" onClick={event => event.stopPropagation()}><CardHeader><CardTitle>سجل ومقارنة أسعار: {historyName}</CardTitle></CardHeader><CardContent><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-right">المورد</th><th className="p-2 text-right">السعر</th><th className="p-2 text-right">التاريخ</th><th className="p-2">الحالة</th></tr></thead><tbody>{history.map(row => <tr key={`${row.invoiceId}-${row.supplierName}`} className="border-b"><td className="p-2">{row.supplierName}</td><td className="p-2 font-bold">{row.unitCost.toFixed(2)} ج.م</td><td className="p-2">{row.invoiceDate}</td><td className="p-2">{row.isCheapest ? "⭐ أفضل صفقة" : "أغلى من الأرخص"}</td></tr>)}</tbody></table><Button className="mt-4 w-full" onClick={() => setHistory([])}>إغلاق</Button></CardContent></Card></div>}
    </main>
  </div>;
}
