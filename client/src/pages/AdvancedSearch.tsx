import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Search, Mic, Camera, LoaderCircle, Package, ReceiptText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AdvancedBarcodeScanner } from "@/components/AdvancedBarcodeScanner";
import { listProductsPage } from "@/lib/supabase/products";
import { listCloudInvoices } from "@/lib/supabase/invoices";

type SearchType = "all" | "products" | "sales";
type SearchResult = {
  type: "product" | "sale";
  id: string;
  name: string;
  details: string;
  price?: number;
  quantity?: number;
};
type SpeechRecognitionLike = {
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };

function readInitialType(value: string | null): SearchType {
  return value === "products" || value === "sales" ? value : "all";
}

export default function AdvancedSearch() {
  const [, navigate] = useLocation();
  const initialSearchParams = new URLSearchParams(window.location.search);
  const [searchQuery, setSearchQuery] = useState(() => initialSearchParams.get("query") || "");
  const [searchType, setSearchType] = useState<SearchType>(() => readInitialType(initialSearchParams.get("type")));
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSequence = useRef(0);

  const performSearch = async (query: string, requestedType: SearchType = searchType) => {
    const normalized = query.trim();
    const sequence = ++searchSequence.current;
    setError(null);
    if (!normalized) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const term = normalized.toLocaleLowerCase("ar-EG");
    try {
      const tasks: Array<Promise<SearchResult[]>> = [];
      if (requestedType === "all" || requestedType === "products") {
        tasks.push(listProductsPage({ search: normalized, limit: 50 }).then(page => page.items.map(product => ({
          type: "product" as const,
          id: product.id,
          name: product.name,
          details: `الفئة: ${product.category || "بدون فئة"} | الكمية: ${product.quantity} | السعر: ${product.retailPrice} ج.م | الكود: ${product.code || product.barcode || "غير مسجل"}`,
          price: product.retailPrice,
          quantity: product.quantity,
        }))));
      }
      if (requestedType === "all" || requestedType === "sales") {
        tasks.push(listCloudInvoices(0, 50).then(page => page.items
          .filter(invoice => invoice.status === "completed")
          .filter(invoice => invoice.id.toLocaleLowerCase("en-US").includes(term)
            || invoice.customerName.toLocaleLowerCase("ar-EG").includes(term)
            || invoice.items.some(item => item.productName.toLocaleLowerCase("ar-EG").includes(term)))
          .map(invoice => ({
            type: "sale" as const,
            id: invoice.invoiceId,
            name: `فاتورة: ${invoice.id}`,
            details: `التاريخ: ${new Date(invoice.date).toLocaleDateString("ar-EG")} | العميل: ${invoice.customerName || "—"} | الإجمالي: ${invoice.total.toFixed(2)} ج.م`,
            price: invoice.total,
          }))));
      }
      const nextResults = (await Promise.all(tasks)).flat();
      if (sequence === searchSequence.current) setResults(nextResults);
    } catch (cause) {
      if (sequence === searchSequence.current) {
        setResults([]);
        setError(cause instanceof Error ? cause.message : "تعذر البحث في بيانات Supabase.");
      }
    } finally {
      if (sequence === searchSequence.current) setLoading(false);
    }
  };

  const handleVoiceSearch = () => {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition = speechWindow.webkitSpeechRecognition || speechWindow.SpeechRecognition;
    if (!SpeechRecognition) {
      window.alert("المتصفح الخاص بك لا يدعم البحث الصوتي");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "ar-EG";
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      setSearchQuery(transcript);
      void performSearch(transcript);
    };
    recognition.onerror = () => {
      window.alert("خطأ في التعرف على الصوت");
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const handleBarcodeSearch = (barcode: string) => {
    const normalized = barcode.trim();
    if (!normalized) return;
    setSearchQuery(normalized);
    setSearchType("products");
    void performSearch(normalized, "products");
    setScannerOpen(false);
  };

  const getTypeIcon = (type: SearchResult["type"]) => type === "product" ? <Package className="h-5 w-5 text-blue-700" /> : <ReceiptText className="h-5 w-5 text-green-700" />;
  const getTypeLabel = (type: SearchResult["type"]) => type === "product" ? "منتج" : "فاتورة";

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white shadow-sm"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6"><div><h1 className="text-3xl font-bold text-gray-900">البحث المتقدم</h1><p className="mt-1 text-gray-600">بحث مباشر في المنتجات والفواتير المحفوظة في Supabase</p></div><Button variant="outline" onClick={() => navigate("/dashboard")} className="flex items-center gap-2"><ArrowLeft className="h-4 w-4" />العودة</Button></div></header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">الخامات والوصفات غير مشمولة في البحث حتى اكتمال ترحيل جداولها؛ لا تُقرأ بيانات من التخزين المحلي. تُفحص أحدث 50 فاتورة عند البحث عن المبيعات.</div>
        <Card className="mb-8 border-0 shadow-sm"><CardHeader><CardTitle>خيارات البحث</CardTitle></CardHeader><CardContent><div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2"><div><label htmlFor="advanced-search" className="mb-2 block text-sm font-medium">البحث بالنص أو الباركود</label><div className="flex gap-2"><Input id="advanced-search" type="search" placeholder="اسم منتج أو رمز أو رقم فاتورة..." value={searchQuery} onChange={event => setSearchQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void performSearch(searchQuery); }} className="flex-1" /><Button type="button" aria-label="بحث" onClick={() => void performSearch(searchQuery)} disabled={loading}><Search className="h-4 w-4" /></Button><Button type="button" variant="outline" onClick={() => setScannerOpen(true)} className="border-orange-300 text-orange-700"><Camera className="h-4 w-4" /> تصوير</Button></div></div><div><label className="mb-2 block text-sm font-medium">البحث الصوتي</label><Button onClick={handleVoiceSearch} disabled={isListening} className={`flex w-full items-center justify-center gap-2 ${isListening ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"} text-white`}><Mic className="h-4 w-4" />{isListening ? "جاري الاستماع…" : "ابدأ البحث الصوتي"}</Button></div></div>
          <div><label className="mb-2 block text-sm font-medium">نوع البحث</label><div className="grid grid-cols-3 gap-2">{([{ value: "all", label: "الكل" }, { value: "products", label: "المنتجات" }, { value: "sales", label: "الفواتير" }] as const).map(option => <Button key={option.value} type="button" onClick={() => { setSearchType(option.value); void performSearch(searchQuery, option.value); }} variant={searchType === option.value ? "default" : "outline"} className="text-sm">{option.label}</Button>)}</div></div>
        </CardContent></Card>
        <AdvancedBarcodeScanner isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onDetect={handleBarcodeSearch} title="تصوير باركود للبحث عن المنتج" />
        <div><h2 className="mb-6 text-2xl font-bold">نتائج البحث ({results.length})</h2>{error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>}{loading ? <Card className="border-0 shadow-sm"><CardContent className="flex items-center justify-center gap-2 py-12 text-gray-500"><LoaderCircle className="h-5 w-5 animate-spin" />جارٍ البحث في Supabase…</CardContent></Card> : results.length > 0 ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{results.map(result => <Card key={`${result.type}-${result.id}`} className="border-0 shadow-sm"><CardContent className="pt-6"><div className="mb-3 flex items-start gap-3">{getTypeIcon(result.type)}<div className="flex-1"><h3 className="text-lg font-semibold">{result.name}</h3><p className="text-xs text-gray-500">{getTypeLabel(result.type)}</p></div></div><p className="mb-4 text-sm text-gray-600">{result.details}</p><Button type="button" variant="outline" size="sm" className="w-full" onClick={() => navigate(result.type === "product" ? "/products" : "/sales-inventory")}>فتح السجل</Button></CardContent></Card>)}</div> : searchQuery.trim() ? <Card className="border-0 shadow-sm"><CardContent className="py-12 text-center text-gray-500"><Search className="mx-auto mb-4 h-12 w-12 text-gray-400" /><p className="text-lg">لم يتم العثور على نتائج في البيانات المحمّلة</p><p className="mt-2 text-sm">جرّب رمزًا أو اسمًا مختلفًا</p></CardContent></Card> : <Card className="border-0 shadow-sm"><CardContent className="py-12 text-center text-gray-500"><Search className="mx-auto mb-4 h-12 w-12 text-gray-400" /><p className="text-lg">ابدأ البحث في المنتجات أو الفواتير</p></CardContent></Card>}</div>
      </main>
    </div>
  );
}
