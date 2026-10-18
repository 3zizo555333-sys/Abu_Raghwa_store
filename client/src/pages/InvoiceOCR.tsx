import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, Camera, ChevronDown, ChevronUp, History, Plus, Save, Trash2, TrendingDown, TrendingUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { getActiveShopContext } from "@/lib/supabase/products";
import { createSupplierInvoiceCategory, deleteSupplierInvoice, getSupplierPriceInsights, listSupplierInvoiceCategories, listSupplierInvoices, listSupplierPriceHistory, saveSupplierInvoice, subscribeToSupplierInvoiceRealtime, uploadSupplierInvoiceImage, type SupplierInvoice, type SupplierInvoiceCategory, type SupplierPriceComparison, type SupplierPriceInsight } from "@/lib/supabase/supplierInvoices";

interface ParsedItem { name: string; barcode: string; quantity: number; unitCost: number; totalCost: number; confidence: number; }
const emptyInsight: SupplierPriceInsight = { previousUnitCost: null, previousSupplierName: null, priceDiff: null, cheapestUnitCost: null, cheapestSupplierName: null, savingVsCheapest: null };
function playTone(kind: "up" | "down") { try { const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!Ctx) return; const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = kind === "up" ? 220 : 660; gain.gain.setValueAtTime(0.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.2); } catch { /* الصوت اختياري */ } }

export default function InvoiceOCR() {
  const [, navigate] = useLocation();
  const [invoiceImage, setInvoiceImage] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [priceInsights, setPriceInsights] = useState<SupplierPriceInsight[]>([]);
  const [supplier, setSupplier] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCheckingPrices, setIsCheckingPrices] = useState(false);
  const [savedInvoices, setSavedInvoices] = useState<SupplierInvoice[]>([]);
  const [categories, setCategories] = useState<SupplierInvoiceCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [history, setHistory] = useState<SupplierPriceComparison[]>([]);
  const [historyName, setHistoryName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previousTrendRef = useRef<Record<number, "up" | "down" | "stable"> >({});
  const parseInvoice = trpc.invoiceOCR.parse.useMutation();

  const refreshInvoices = async () => { try { setSavedInvoices(await listSupplierInvoices()); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحميل فواتير الموردين."); } };
  const refreshCategories = async () => { try { setCategories(await listSupplierInvoiceCategories()); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحميل فئات الفواتير."); } };

  useEffect(() => {
    let stop: (() => void) | undefined;
    let active = true;
    void (async () => { await Promise.all([refreshInvoices(), refreshCategories()]); try { const { shopId } = await getActiveShopContext(); if (active) stop = subscribeToSupplierInvoiceRealtime(shopId, () => void refreshInvoices()); } catch { /* يظهر الخطأ عند العملية */ } })();
    return () => { active = false; stop?.(); };
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

  const resetDraft = () => { setInvoiceImage(null); setUploadedImageUrl(""); setParsedItems([]); setPriceInsights([]); setSupplier(""); setNotes(""); setCategoryId(""); previousTrendRef.current = {}; };

  const handleImageUpload = async (file?: File) => {
    if (!file) return;
    try {
      setIsProcessing(true); setIsUploading(true); setInvoiceImage(URL.createObjectURL(file));
      const publicUrl = await uploadSupplierInvoiceImage(file);
      setUploadedImageUrl(publicUrl);
      const result = await parseInvoice.mutateAsync({ imageUrl: publicUrl, supplierName: supplier, invoiceDate });
      const items = (result.items || []).map(item => {
        const quantity = Math.max(0, Number(item.quantity) || 0);
        const unitCost = Math.max(0, Number(item.unitCost) || 0);
        return { name: item.name, barcode: item.barcode || "", quantity, unitCost, totalCost: Math.round((Number(item.totalCost) || quantity * unitCost) * 100) / 100, confidence: Number(item.confidence) || 0 };
      });
      setParsedItems(items);
      toast[items.length ? "success" : "warning"](items.length ? `تم استخراج ${items.length} بند تلقائياً وتشغيل رادار الأسعار.` : "لم يتم التعرف على بنود واضحة؛ أضفها يدوياً.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر رفع أو تحليل صورة الفاتورة."); }
    finally { setIsProcessing(false); setIsUploading(false); }
  };

  const updateItem = (index: number, field: keyof ParsedItem, value: string) => setParsedItems(rows => rows.map((row, rowIndex) => {
    if (rowIndex !== index) return row;
    const numericNext = Number(value) || 0;
    const updated = { ...row, [field]: field === "name" || field === "barcode" ? value : numericNext };
    if (field === "quantity" || field === "unitCost") updated.totalCost = Math.round(((field === "quantity" ? numericNext : row.quantity) * (field === "unitCost" ? numericNext : row.unitCost)) * 100) / 100;
    return updated;
  }));

  const addCategory = async () => { if (!newCategoryName.trim()) { toast.error("اكتب اسم الفئة أولاً."); return; } try { const row = await createSupplierInvoiceCategory(newCategoryName); setCategories(rows => [...rows, row].sort((a, b) => a.name.localeCompare(b.name, "ar"))); setCategoryId(row.id); setNewCategoryName(""); toast.success("تم حفظ الفئة سحابياً."); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الفئة سحابياً."); } };
  const saveInvoice = async () => { if (!uploadedImageUrl) { toast.error("ارفع صورة الفاتورة أولاً."); return; } try { setIsSaving(true); await saveSupplierInvoice({ supplierName: supplier, invoiceDate, categoryId: categoryId || null, imageUrl: uploadedImageUrl, notes, items: parsedItems.map(item => ({ itemName: item.name, barcode: item.barcode, quantity: item.quantity, unitCost: item.unitCost })) }); toast.success("تم حفظ الفاتورة وبنودها سحابياً وتحديث رادار الأسعار."); resetDraft(); await refreshInvoices(); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الفاتورة سحابياً."); } finally { setIsSaving(false); } };
  const showHistory = async (item: ParsedItem) => { try { setHistoryName(item.name); setHistory(await listSupplierPriceHistory(item.name, item.barcode)); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحميل سجل السعر."); } };
  const totalDraft = parsedItems.reduce((sum, item) => sum + item.totalCost, 0);
  const trendFor = (insight: SupplierPriceInsight) => insight.priceDiff == null ? "stable" : insight.priceDiff > 0 ? "up" : insight.priceDiff < 0 ? "down" : "stable";

  return <div className="min-h-screen bg-gray-50 p-4" dir="rtl"><header className="mx-auto flex max-w-7xl items-center justify-between py-4"><div><h1 className="text-3xl font-bold text-gray-900">فواتير الموردين ومستشار المشتريات</h1><p className="mt-1 text-gray-600">رفع سحابي، قراءة ذكية، حركة أسعار، ومقارنة فورية بين الموردين</p></div><Button variant="outline" onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-2 h-4 w-4" />العودة</Button></header><main className="mx-auto max-w-7xl space-y-6">
    {!invoiceImage ? <Card><CardHeader><CardTitle>إضافة فاتورة مورد</CardTitle><CardDescription>بمجرد رفع الصورة تُقرأ البنود تلقائياً وتظهر في الجدول مع حساب الإجمالي ورادار الأسعار.</CardDescription></CardHeader><CardContent><div className="mb-4 grid gap-2 md:grid-cols-[1fr_auto_auto]"><Input value={newCategoryName} onChange={event => setNewCategoryName(event.target.value)} placeholder="اسم فئة جديدة مثل: فواتير شهر أكتوبر" /><Button variant="outline" onClick={() => void addCategory()}>حفظ الفئة سحابياً</Button><select value={categoryId} onChange={event => setCategoryId(event.target.value)} className="rounded-md border bg-white px-3"><option value="">بدون فئة</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><div className="grid gap-4 md:grid-cols-2"><Button onClick={() => cameraInputRef.current?.click()} disabled={isProcessing} className="h-28 bg-blue-600"><Camera className="ml-2" />التقاط بالكاميرا</Button><Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="h-28 bg-green-600"><Upload className="ml-2" />رفع من المعرض</Button></div><input ref={cameraInputRef} type="file" accept="image/*" className="hidden" onChange={event => void handleImageUpload(event.target.files?.[0])} /><input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={event => void handleImageUpload(event.target.files?.[0])} /></CardContent></Card> : <Card><CardHeader><CardTitle>مراجعة الفاتورة قبل الحفظ</CardTitle><CardDescription>{isUploading ? "جاري رفع الصورة إلى Supabase Storage..." : isProcessing || parseInvoice.isPending ? "جاري استخراج كل البنود بالذكاء الاصطناعي..." : isCheckingPrices ? "جاري مقارنة الأسعار مع آخر مشتريات وكافة الموردين..." : "تمت التعبئة تلقائياً؛ عدّل أي خلية مباشرة قبل الحفظ."}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-6 lg:grid-cols-2"><div><img src={invoiceImage} alt="صورة فاتورة المورد" className="max-h-[620px] w-full rounded-xl border object-contain" /><p className="mt-2 text-xs text-green-700">أرشفة الصورة السحابية: {isUploading ? "جارية الآن..." : uploadedImageUrl ? "تمت" : "لم تبدأ"}</p></div><div className="space-y-3"><label className="text-sm font-bold">الفئة</label><select value={categoryId} onChange={event => setCategoryId(event.target.value)} className="rounded-md border bg-white px-3 py-2"><option value="">بدون فئة</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><label className="text-sm font-bold">اسم المورد</label><Input value={supplier} onChange={event => setSupplier(event.target.value)} placeholder="اسم المورد" /><label className="text-sm font-bold">تاريخ الفاتورة</label><Input type="date" value={invoiceDate} onChange={event => setInvoiceDate(event.target.value)} /><label className="text-sm font-bold">ملاحظات</label><Textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="ملاحظات اختيارية" /></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-gray-100"><tr><th className="p-2 text-right">الصنف</th><th className="p-2 text-right">الباركود</th><th className="p-2 text-right">الكمية</th><th className="p-2 text-right">سعر الوحدة</th><th className="p-2 text-right">الإجمالي الفرعي</th><th className="p-2 text-right">حركة السعر</th><th className="p-2 text-right">أفضل مورد</th><th className="p-2">ثقة</th><th /></tr></thead><tbody>{parsedItems.map((item, index) => { const insight = priceInsights[index] || emptyInsight; const trend = trendFor(insight); return <tr key={index} className="border-b align-top"><td className="p-2"><Input value={item.name} onChange={event => updateItem(index, "name", event.target.value)} /></td><td className="p-2"><Input value={item.barcode} onChange={event => updateItem(index, "barcode", event.target.value)} /></td><td className="p-2"><Input type="number" min="0" value={item.quantity} onChange={event => updateItem(index, "quantity", event.target.value)} /></td><td className="p-2"><Input type="number" min="0" step="0.01" value={item.unitCost} onChange={event => updateItem(index, "unitCost", event.target.value)} /></td><td className="p-2 font-bold">{item.totalCost.toFixed(2)} ج.م</td><td className="p-2"><div className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${trend === "up" ? "bg-red-100 text-red-700" : trend === "down" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{trend === "up" ? <TrendingUp className="h-4 w-4" /> : trend === "down" ? <TrendingDown className="h-4 w-4" /> : null}{trend === "up" ? `أعلى بـ ${Math.abs(insight.priceDiff || 0).toFixed(2)} ج.م` : trend === "down" ? `توفير ${Math.abs(insight.priceDiff || 0).toFixed(2)} ج.م` : insight.previousUnitCost == null ? "لا يوجد سجل سابق" : "مستقر"}</div>{insight.previousSupplierName && <p className="mt-1 text-[11px] text-gray-500">آخر شراء: {insight.previousSupplierName}</p>}</td><td className="p-2">{insight.cheapestSupplierName ? <div className={insight.savingVsCheapest && insight.savingVsCheapest > 0 ? "rounded-lg bg-amber-100 p-2 text-xs text-amber-800" : "rounded-lg bg-green-100 p-2 text-xs text-green-800"}>{insight.savingVsCheapest && insight.savingVsCheapest > 0 ? <><AlertTriangle className="ml-1 inline h-3 w-3" />أغلى بـ {insight.savingVsCheapest.toFixed(2)} ج.م من {insight.cheapestSupplierName}</> : <>⭐ الأرخص حالياً: {insight.cheapestSupplierName}</>}<div className="mt-1">{insight.cheapestUnitCost?.toFixed(2)} ج.م</div></div> : <span className="text-xs text-gray-400">لا توجد مقارنة</span>}</td><td className="p-2 text-center">{item.confidence ? `${Math.round(item.confidence * 100)}%` : "يدوي"}</td><td className="p-2"><Button variant="ghost" size="icon" onClick={() => setParsedItems(rows => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4 text-red-600" /></Button></td></tr>; })}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" onClick={() => setParsedItems(rows => [...rows, { name: "", barcode: "", quantity: 1, unitCost: 0, totalCost: 0, confidence: 0 }])}><Plus className="ml-2 h-4 w-4" />إضافة سطر</Button><strong>الإجمالي العام: {totalDraft.toFixed(2)} ج.م</strong><div className="flex gap-2"><Button variant="outline" onClick={resetDraft}>إلغاء</Button><Button onClick={() => void saveInvoice()} disabled={isSaving || isProcessing || isUploading || !parsedItems.length} className="bg-green-600"><Save className="ml-2 h-4 w-4" />حفظ سحابياً</Button></div></div></CardContent></Card>}
    {parsedItems.length > 0 && !isProcessing && <Card><CardHeader><CardTitle>رادار حركة الأسعار والمقارنة بين الموردين</CardTitle></CardHeader><CardContent className="space-y-2">{parsedItems.map((item, index) => { const insight = priceInsights[index] || emptyInsight; const trend = trendFor(insight); return <div key={`${item.name}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"><div><strong>{item.name || "صنف بدون اسم"}</strong><span className="mr-3 text-sm text-gray-600">سعر الشراء: {item.unitCost.toFixed(2)} ج.م</span>{trend === "up" && <span className="mr-2 text-sm font-bold text-red-600">🔴 أعلى بـ {Math.abs(insight.priceDiff || 0).toFixed(2)} ج.م</span>}{trend === "down" && <span className="mr-2 text-sm font-bold text-green-600">🟢 توفير {Math.abs(insight.priceDiff || 0).toFixed(2)} ج.م</span>}{insight.cheapestSupplierName && insight.savingVsCheapest && insight.savingVsCheapest > 0 && <span className="mr-2 text-sm font-bold text-amber-700">⚠️ الأرخص: {insight.cheapestSupplierName}</span>}</div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void showHistory(item)}><History className="ml-1 h-4 w-4" />تفاصيل المقارنة</Button><Button size="sm" variant="outline" onClick={() => navigate(`/products?search=${encodeURIComponent(item.name)}`)}>تحديث سعر البيع</Button><Button size="sm" variant="outline" onClick={() => navigate(`/smart-offers?item=${encodeURIComponent(item.name)}`)}>توليد عرض</Button></div></div>; })}</CardContent></Card>}
    <Card><CardHeader><CardTitle>الفواتير المحفوظة سحابياً ({savedInvoices.length})</CardTitle></CardHeader><CardContent className="space-y-3">{savedInvoices.length === 0 ? <p className="text-sm text-gray-500">لا توجد فواتير محفوظة بعد.</p> : savedInvoices.map(invoice => <div key={invoice.id} className="rounded-xl border bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{invoice.supplier_name}</strong><span className="mr-3 text-sm text-gray-500">{invoice.invoice_date} · {Number(invoice.total_amount).toFixed(2)} ج.م</span></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setExpandedInvoice(expandedInvoice === invoice.id ? null : invoice.id)}>{expandedInvoice === invoice.id ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}البنود</Button><Button size="sm" variant="destructive" onClick={async () => { if (confirm("حذف الفاتورة وبنودها؟")) { try { await deleteSupplierInvoice(invoice.id); await refreshInvoices(); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف الفاتورة."); } } }}><Trash2 className="ml-1 h-4 w-4" />حذف</Button></div></div>{expandedInvoice === invoice.id && <div className="mt-3 grid gap-2 md:grid-cols-2">{invoice.items.map(item => <div key={item.id} className={`rounded-lg p-3 ${item.price_direction === "up" ? "bg-red-50" : item.price_direction === "down" ? "bg-green-50" : "bg-gray-50"}`}><div className="flex items-center justify-between"><strong>{item.item_name}</strong><span>{item.price_direction === "up" ? "↗️" : item.price_direction === "down" ? "↘️" : "➡️"} {Number(item.unit_cost).toFixed(2)} ج.م</span></div><p className="text-xs text-gray-600">الكمية {item.quantity} · الإجمالي {item.total_cost} · {item.previous_cost == null ? "أول سعر مسجل" : `الفرق ${Number(item.price_diff).toFixed(2)} ج.م`}</p></div>)}</div>}</div>)}</CardContent></Card>
    {history.length > 0 && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setHistory([])}><Card className="max-h-[80vh] w-full max-w-3xl overflow-auto" onClick={event => event.stopPropagation()}><CardHeader><CardTitle>سجل ومقارنة أسعار: {historyName}</CardTitle></CardHeader><CardContent><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-right">المورد</th><th className="p-2 text-right">السعر</th><th className="p-2 text-right">التاريخ</th><th className="p-2">الحالة</th></tr></thead><tbody>{history.map(row => <tr key={`${row.invoiceId}-${row.supplierName}`} className="border-b"><td className="p-2">{row.supplierName}</td><td className="p-2 font-bold">{row.unitCost.toFixed(2)} ج.م</td><td className="p-2">{row.invoiceDate}</td><td className="p-2">{row.isCheapest ? "⭐ أفضل صفقة" : "أغلى من الأرخص"}</td></tr>)}</tbody></table><Button className="mt-4 w-full" onClick={() => setHistory([])}>إغلاق</Button></CardContent></Card></div>}
  </main></div>;
}
