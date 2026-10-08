import { useState } from "react";
import { Camera, Loader2, ScanSearch, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { getPhotoCandidatePayload, getPhotoFallbackProducts, getPhotoMatchProduct, getProductPrice, type PhotoSearchProduct } from "@/lib/photoSearch";

export type CashierProductCandidate = PhotoSearchProduct;

async function readCompressedImage(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("تعذر قراءة الصورة"));
      element.src = objectUrl;
    });
    const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("تعذر تجهيز الصورة");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ProductPhotoSearch({ candidates, onChoose }: { candidates: CashierProductCandidate[]; onChoose: (id: string) => void }) {
  const [preview, setPreview] = useState("");
  const [matchedId, setMatchedId] = useState("");
  const [fallbackProducts, setFallbackProducts] = useState<PhotoSearchProduct[]>([]);
  const [message, setMessage] = useState("");
  const matchImage = trpc.productLookup.matchImage.useMutation();
  const matchedProduct = getPhotoMatchProduct(candidates, matchedId, 0);
  const matchedPrice = getProductPrice(matchedProduct);

  const resetMatch = () => {
    setMatchedId("");
    setFallbackProducts([]);
    setPreview("");
    setMessage("");
  };

  const handleImage = async (file?: File, input?: HTMLInputElement) => {
    if (input) input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMessage("اختر صورة من الكاميرا أو المعرض.");
    setMatchedId("");
    setFallbackProducts(getPhotoFallbackProducts(candidates));
    setMessage("جاري عرض المنتجات المصورة ومقارنتها بالصورة...");
    try {
      const imageDataUrl = await readCompressedImage(file);
      setPreview(imageDataUrl);
      const result = await matchImage.mutateAsync({
        imageDataUrl,
        candidates: getPhotoCandidatePayload(candidates),
      });
      const product = getPhotoMatchProduct(candidates, result.productId, result.confidence);
      if (!product) return setMessage("ظهرت المنتجات المصورة أدناه. اختر الأقرب لمراجعة سعره، أو قرّب الصورة وأظهر الاسم والحجم.");
      setMatchedId(product.id);
      setFallbackProducts([]);
      setMessage(`تم العثور على أقرب عائلة منتج: ${product.name} — راجع السعر قبل الإضافة.`);
    } catch {
      setMessage("ظهرت المنتجات المصورة أدناه. اختر المنتج الأقرب لمراجعة السعر، أو استخدم البحث بالاسم.");
    }
  };

  return <section className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-violet-600 p-2.5 text-white"><ScanSearch className="h-5 w-5" /></span><div><h3 className="font-black text-violet-950">ابحث بصورة المنتج</h3><p className="mt-1 text-xs leading-5 text-violet-800">صوّر أي لون أو وضع للعبوة؛ يركز البحث على الشركة والنوع والحجم، ويعتبر اللون اختلافًا طبيعيًا داخل نفس الصنف.</p></div></div>
    <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-violet-300 bg-white px-3 py-3 text-sm font-black text-violet-700 hover:bg-violet-50"><Camera className="h-4 w-4" />تصوير أو اختيار صورة<input className="hidden" type="file" accept="image/*" capture="environment" onChange={event => handleImage(event.target.files?.[0], event.target)} /></label>
    {matchImage.isPending && <p className="mt-3 flex items-center gap-2 text-sm font-bold text-violet-700"><Loader2 className="h-4 w-4 animate-spin" />جاري مقارنة المنتج بالصورة المرجعية...</p>}
    {preview && <img src={preview} alt="صورة البحث" className="mt-3 h-28 w-28 rounded-xl border bg-white object-cover" />}
    {message && <p className="mt-3 text-xs font-bold text-slate-600">{message}</p>}
    {fallbackProducts.length > 0 && !matchedProduct && <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-black text-amber-900">نتائج الصور المسجلة — اختر الأقرب لمراجعة السعر</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{fallbackProducts.map(product => <div key={product.id} className="flex items-center justify-between gap-2 rounded-xl bg-white p-2"><div className="flex min-w-0 items-center gap-2"><img src={product.catalogImageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" /><div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{product.name}</p><p className="text-xs font-bold text-amber-700">{getProductPrice(product).toFixed(2)} ج.م</p></div></div><Button size="sm" variant="outline" onClick={() => { setMatchedId(product.id); setFallbackProducts([]); setMessage(`تم اختيار ${product.name}. راجع السعر ثم قرر الإضافة.`); }}>اختيار</Button></div>)}</div></div>}
    {matchedProduct && <div className="mt-3 rounded-2xl border border-emerald-200 bg-white p-3 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-emerald-700">المنتج المطابق</p><p className="font-black text-slate-950">{matchedProduct.name}</p></div><p className="text-lg font-black text-emerald-700">{matchedPrice.toFixed(2)} ج.م</p></div><p className="mt-2 text-xs font-bold text-slate-500">هل تريد الاستعلام عن السعر فقط أم تضيفه إلى السلة؟</p><div className="mt-3 flex gap-2"><Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => { onChoose(matchedProduct.id); resetMatch(); }}><ShoppingCart className="ml-1 h-4 w-4" />إضافة إلى السلة</Button><Button size="sm" variant="outline" className="flex-1" onClick={resetMatch}><X className="ml-1 h-4 w-4" />إلغاء</Button></div></div>}
  </section>;
}
