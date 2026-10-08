import { useRef, useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Plus, Trash2, Edit2, Eye, Package, Search, X, Camera, DollarSign, Minus, ImagePlus, Printer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedBarcodeScanner } from "@/components/AdvancedBarcodeScanner";
import { InventoryAlertManager } from "@/components/InventoryAlertManager";
import { AdvancedInventoryAlerts } from "@/components/AdvancedInventoryAlerts";
import { toast } from "sonner";
import { calculateStoreProfitSummary, calculateTradeMarginSummary } from "@/lib/profit";
import { useCloudState } from "@/lib/cloudSync";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { MarketingShareButton } from "@/components/MarketingShareComposer";
import { trpc } from "@/lib/trpc";
import { getPackageDescription } from "@/lib/packageUnits";
import { prepareProductImageForUpload } from "@/lib/itemImageUpload";
import { countProductsByCategory, filterProductsByCategory } from "@/lib/productCategories";
import { normalizeLoyaltyPoints } from "@/lib/loyaltyPoints";
import { collectProductBarcodes, createEmptyAdditionalBarcodeSlots, getAdditionalBarcodeSlots, getBarcodeFieldError } from "@/lib/productBarcodeSlots";
import JsBarcode from "jsbarcode";
import { createBarcodeLabelPrintHtml, createBarcodePrintLabels } from "@/lib/barcodeLabelPrint";

interface Product {
  id: string;
  code: string;
  plu?: string;
  saleMode?: "unit" | "weight";
  barcodes?: string[];
  name: string;
  unit: string;
  unitsPerPackage: number;
  wholesalePricePerUnit: number;
  wholesalePricePerPiece: number;
  retailPrice: number;
  wholesaleRetailPrice?: number;
  bulkPrice: number;
  bulkProfitPercent: number;
  retailProfitPercent?: number;
  wholesalePrice?: number;
  category: string;
  createdDate: string;
  quantity?: number;
  minQuantity?: number;
  availableQuantity?: number;
  imageUrl?: string;
  catalogImageUrl?: string;
  contentUnit?: string;
  loyaltyPoints?: number;
}

const PACKAGE_TYPES = ["كرتونة", "حقيبة", "شكارة", "كيس", "عبوة", "بالة", "دستة", "جركن", "زجاجة", "رول", "شرينك"];
const CONTENT_UNITS = ["قطعة", "كيلو", "جرام", "لتر", "مل", "باكيت", "رول", "منديل", "علبة"];
const DEFAULT_CATEGORIES = ["منظفات", "ورقيات", "بامبرز وحفاضات", "مساحيق", "مستلزمات منزلية", "تجميل", "مبيدات حشرية"];
const normalizeBarcodes = (value: string | string[] | undefined) => Array.from(new Set((Array.isArray(value) ? value : String(value || "").split(/[\s,;]+/)).map(item => item.trim()).filter(Boolean)));
const createEmptyProductForm = () => ({
  code: "",
  plu: "",
  saleMode: "unit" as "unit" | "weight",
  barcodes: createEmptyAdditionalBarcodeSlots(),
  name: "",
  unit: "كرتونة",
  unitsPerPackage: "",
  retailPrice: "",
  wholesaleRetailPrice: "",
  bulkPrice: "",
  wholesalePrice: "",
  category: "",
  contentUnit: "قطعة",
  availableQuantity: "",
  loyaltyPoints: "",
  imageUrl: "",
});

export default function Products() {
  const [, navigate] = useLocation();
  const { isSeller, canViewSensitiveFinancials } = useStaffAccess();
  const [products, setProducts] = useCloudState<Product[]>("abu_raghwa_products", []);
  const [recipes] = useCloudState<any[]>("abu_raghwa_recipes", []);
  const [customCategories, setCustomCategories] = useCloudState<string[]>("abu_raghwa_product_categories", []);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingProductId, setViewingProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodeScannerTarget, setBarcodeScannerTarget] = useState(-1);
  const [showBarcodeSearchScanner, setShowBarcodeSearchScanner] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImportText, setBulkImportText] = useState("");
  const [bulkCategoryName, setBulkCategoryName] = useState("");
  const [showBulkPaste, setShowBulkPaste] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [moveCategory, setMoveCategory] = useState("");
  const bulkPasteRef = useRef<HTMLTextAreaElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const uploadProductImage = trpc.productImages.upload.useMutation();
  const [formData, setFormData] = useState(createEmptyProductForm);
  const barcodeFieldError = getBarcodeFieldError(formData.code, formData.barcodes);
  const availableCategories = useMemo(() => Array.from(new Set([...DEFAULT_CATEGORIES, ...(Array.isArray(customCategories) ? customCategories : []), ...products.map(product => product.category).filter(Boolean)])), [customCategories, products]);
  const categoryCounts = useMemo(() => countProductsByCategory(products, availableCategories), [products, availableCategories]);

  const addProductCategory = () => {
    const category = newCategoryName.trim();
    if (!category) return toast.error("اكتب اسم الفئة الجديدة أولًا");
    const existing = availableCategories.find(item => item.localeCompare(category, "ar", { sensitivity: "base" }) === 0);
    if (existing) {
      setFormData(current => ({ ...current, category: existing }));
      setNewCategoryName("");
      return toast.message("الفئة موجودة بالفعل وتم اختيارها");
    }
    setCustomCategories(current => [...(Array.isArray(current) ? current : []), category]);
    setFormData(current => ({ ...current, category }));
    setNewCategoryName("");
    toast.success(`تمت إضافة فئة «${category}» وأصبحت متاحة للجميع`);
  };

  const resetProductForm = () => {
    setFormData(createEmptyProductForm());
  };

  const updateAdditionalBarcode = (index: number, value: string) => setFormData(current => ({
    ...current,
    barcodes: current.barcodes.map((barcode, slot) => slot === index ? value : barcode),
  }));

  const addBarcodeSlot = () => setFormData(current => ({ ...current, barcodes: [...current.barcodes, ""] }));

  const removeBarcodeSlot = (index: number) => setFormData(current => {
    const remaining = current.barcodes.filter((_, slot) => slot !== index);
    return { ...current, barcodes: remaining.length < 4 ? [...remaining, ...Array.from({ length: 4 - remaining.length }, () => "")] : remaining };
  });

  const printProductBarcodeLabels = () => {
    if (barcodeFieldError) {
      toast.error("أدخل باركودًا واحدًا فقط في كل خانة قبل الطباعة.");
      return;
    }
    const { labels, error } = createBarcodePrintLabels(formData.name, formData.code, formData.barcodes);
    if (error) {
      toast.error("أدخل باركودًا واحدًا فقط في كل خانة قبل الطباعة.");
      return;
    }
    if (!labels.length) {
      toast.error("أضف باركودًا واحدًا على الأقل لهذا المنتج قبل الطباعة.");
      return;
    }

    let printWindow: Window | null = null;
    try {
      const barcodeSvgs = labels.map(label => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, label.barcode, { format: "CODE128", displayValue: false, height: 55, margin: 2, lineColor: "#111827" });
        return new XMLSerializer().serializeToString(svg);
      });
      const html = createBarcodeLabelPrintHtml(labels, barcodeSvgs);
      printWindow = window.open("", "_blank", "width=900,height=700");
      if (!printWindow) {
        toast.error("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      window.setTimeout(() => {
        printWindow?.focus();
        printWindow?.print();
      }, 300);
    } catch (error) {
      printWindow?.close();
      console.error("Failed to generate product barcode labels:", error);
      toast.error("تعذر إنشاء أحد الباركودات. راجع الرموز المسجلة وحاول مرة أخرى.");
    }
  };

  const openNewProductForm = () => {
    if (!canViewSensitiveFinancials) return;
    resetProductForm();
    setEditingId(null);
    setShowForm(true);
  };

  const saveProducts = (updated: Product[]) => {
    const sorted = [...updated].sort((a, b) => `${a.category || ""}-${a.name || ""}`.localeCompare(`${b.category || ""}-${b.name || ""}`, 'ar'));
    setProducts(sorted);
  };

  const toggleProductSelection = (id: string) => {
    setSelectedProductIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  };

  const toggleVisibleProducts = () => {
    const visibleIds = filteredProducts.map(product => product.id);
    setSelectedProductIds(current => visibleIds.length > 0 && visibleIds.every(id => current.includes(id))
      ? current.filter(id => !visibleIds.includes(id))
      : Array.from(new Set([...current, ...visibleIds])));
  };

  const moveSelectedProducts = () => {
    const target = moveCategory.trim();
    if (!selectedProductIds.length) return toast.error("حدد منتجًا واحدًا على الأقل أولًا");
    if (!target) return toast.error("اختر الفئة التي ستُنقل إليها المنتجات");
    const existing = availableCategories.find(item => item.localeCompare(target, "ar", { sensitivity: "base" }) === 0);
    if (!existing) setCustomCategories(current => [...(Array.isArray(current) ? current : []), target]);
    saveProducts(products.map(product => selectedProductIds.includes(product.id) ? { ...product, category: existing || target } : product));
    setSelectedProductIds([]);
    setMoveCategory("");
    toast.success(`تم نقل المنتجات المحددة إلى فئة «${existing || target}»`);
  };

  const deleteSelectedProducts = () => {
    if (!canViewSensitiveFinancials || !selectedProductIds.length) return toast.error("حدد منتجًا واحدًا على الأقل أولًا");
    if (!confirm(`هل أنت متأكد من حذف ${selectedProductIds.length} منتجًا محددًا؟`)) return;
    saveProducts(products.filter(product => !selectedProductIds.includes(product.id)));
    setSelectedProductIds([]);
    toast.success("تم حذف المنتجات المحددة");
  };

  const importProductsInBulk = () => {
    if (!canViewSensitiveFinancials) return;
    const category = bulkCategoryName.trim();
    if (!category) {
      toast.error("اكتب اسم الفئة التي ستوضع فيها المنتجات أولًا");
      return;
    }
    const rows = bulkImportText.split(/\r?\n/).map(row => row.trim()).filter(Boolean);
    if (!rows.length) {
      toast.error("الصق أسماء المنتجات أولًا");
      return;
    }
    const existingCategory = availableCategories.find(item => item.localeCompare(category, "ar", { sensitivity: "base" }) === 0);
    if (!existingCategory) {
      setCustomCategories(current => [...(Array.isArray(current) ? current : []), category]);
    }
    const imported: Product[] = rows.map((row, index) => {
      const columns = row.split(/\t|\s*;\s*|\s*,\s*/).map(value => value.trim());
      const [name, code = ""] = columns;
      const id = `bulk_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
      return {
        id,
        code: code || `PRD-${Date.now().toString().slice(-4)}-${index + 1}`,
        barcodes: code ? [code] : [],
        name,
        unit: "كرتونة",
        unitsPerPackage: 1,
        wholesalePricePerUnit: 0,
        wholesalePricePerPiece: 0,
        retailPrice: 0,
        wholesaleRetailPrice: 0,
        bulkPrice: 0,
        bulkProfitPercent: 0,
        retailProfitPercent: 0,
        wholesalePrice: 0,
        category: existingCategory || category,
        contentUnit: "قطعة",
        loyaltyPoints: 0,
        createdDate: new Date().toLocaleDateString("ar-EG"),
        availableQuantity: 0,
        quantity: 0,
      };
    }).filter(product => product.name.trim());
    if (!imported.length) {
      toast.error("لم أجد أسماء منتجات صالحة في النص الملصوق");
      return;
    }
    const nextProducts = [...products, ...imported];
    setBulkImportText("");
    setBulkCategoryName("");
    setShowBulkPaste(true);
    setShowBulkImport(false);
    window.setTimeout(() => saveProducts(nextProducts), 0);
    toast.success(`تمت إضافة ${imported.length} منتجًا داخل فئة «${existingCategory || category}»؛ يمكنك الآن إدخال الأسعار والوحدات يدويًا`);
  };

  const scrollBulkPaste = (position: "top" | "bottom") => {
    const textarea = bulkPasteRef.current;
    if (!textarea) return;
    textarea.scrollTo({ top: position === "top" ? 0 : textarea.scrollHeight, behavior: "smooth" });
    textarea.focus({ preventScroll: true });
  };

  const handleProductImageUpload = async (file: File | undefined) => {
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const prepared = await prepareProductImageForUpload(file);
      const productId = editingId || `product_${Date.now()}`;
      const uploaded = await uploadProductImage.mutateAsync({ productId, fileName: prepared.fileName, mimeType: prepared.mimeType, dataUrl: prepared.dataUrl });
      setFormData(current => ({ ...current, imageUrl: uploaded.url }));
      toast.success("تم رفع صورة المنتج وحفظها سحابيًا");
    } catch (error) {
      toast.error(error instanceof DOMException && error.name === "AbortError" ? "تعذر رفع الصورة خلال 20 ثانية؛ تحقق من الاتصال وحاول مرة أخرى" : error instanceof Error && error.message.includes("large") ? "الصورة كبيرة جدًا؛ جرّب صورة أصغر من 16 ميجابايت" : "تعذر تجهيز أو رفع صورة المنتج، حاول مرة أخرى");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const calculateWholesalePricePerPiece = (wholesalePrice: number, units: number) => {
    return units > 0 ? wholesalePrice / units : 0;
  };

  const calculateBulkProfit = (bulkPrice: number, wholesalePricePerPiece: number) => {
    if (wholesalePricePerPiece === 0) return 0;
    return Number(((bulkPrice - wholesalePricePerPiece) / wholesalePricePerPiece * 100).toFixed(1));
  };

  const getRetailCostPrice = (product: Product) => {
    if (product.wholesalePrice && product.unitsPerPackage && product.unitsPerPackage > 0) {
      return product.wholesalePrice / product.unitsPerPackage;
    }
    if (product.wholesalePricePerPiece && product.wholesalePricePerPiece > 0) {
      return product.wholesalePricePerPiece;
    }
    if (product.wholesalePricePerUnit && product.unitsPerPackage && product.unitsPerPackage > 0) {
      return product.wholesalePricePerUnit / product.unitsPerPackage;
    }
    return product.wholesalePricePerUnit || product.wholesalePrice || 0;
  };

  const getSectorSalePrice = (product: Product) => {
    return Number(product.wholesaleRetailPrice) || Number(product.retailPrice) || 0;
  };

  const getStockCostValue = (product: Product) => {
    const cartons = Math.max(0, Number(product.availableQuantity ?? product.quantity ?? 0));
    const cartonCost = Number(product.wholesalePrice) || Number(product.wholesalePricePerUnit) || 0;
    return cartons * cartonCost;
  };

  const calculateRetailProfitPercent = (retailPrice: number, costPrice: number) => {
    if (costPrice <= 0) return 0;
    return Number(((retailPrice - costPrice) / costPrice * 100).toFixed(1));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canViewSensitiveFinancials) return;
    if (barcodeFieldError) {
      toast.error("أدخل باركودًا واحدًا فقط في كل خانة؛ احذف الفاصلة أو أضف خانة جديدة لكل كود.");
      return;
    }
    if (!formData.name.trim()) {
      toast.error("❌ اسم المنتج مطلوب");
      return;
    }

    const wholesalePrice = Number(formData.wholesalePrice) || 0;
    const unitsPerPkg = Number(formData.unitsPerPackage) || 1;
    const pieceCost = calculateWholesalePricePerPiece(wholesalePrice, unitsPerPkg);
    const retailPrice = Number(formData.retailPrice) || 0;
    const wholesaleRetailPrice = Number(formData.wholesaleRetailPrice) || retailPrice;
    const bulkPrice = Number(formData.bulkPrice) || 0;
    const bulkProfit = calculateBulkProfit(bulkPrice, pieceCost);
    const retailProfit = calculateRetailProfitPercent(wholesaleRetailPrice, pieceCost);

    const productData: Product = {
      id: editingId || Date.now().toString(),
      code: formData.code.trim() || `PRD-${Date.now().toString().slice(-4)}`,
      plu: formData.plu.trim() || formData.code.trim() || undefined,
      saleMode: formData.saleMode,
      barcodes: collectProductBarcodes(formData.code, formData.barcodes),
      name: formData.name.trim(),
      unit: formData.unit,
      unitsPerPackage: unitsPerPkg,
      wholesalePricePerUnit: wholesalePrice,
      wholesalePricePerPiece: pieceCost,
      retailPrice: retailPrice,
      wholesaleRetailPrice,
      bulkPrice: bulkPrice,
      bulkProfitPercent: bulkProfit,
      retailProfitPercent: retailProfit,
      wholesalePrice: wholesalePrice,
      category: formData.category.trim() || "منظفات عامة",
      contentUnit: formData.contentUnit.trim() || "قطعة",
      loyaltyPoints: normalizeLoyaltyPoints(formData.loyaltyPoints),
      createdDate: new Date().toLocaleDateString('ar-EG'),
      availableQuantity: Math.max(0, Number(formData.availableQuantity) || 0),
      quantity: Math.max(0, Number(formData.availableQuantity) || 0),
      imageUrl: formData.imageUrl || undefined,
      catalogImageUrl: formData.imageUrl || undefined
    };

    if (editingId) {
      const updated = products.map(p => p.id === editingId ? productData : p);
      saveProducts(updated);
      toast.success("✨ تم تحديث المنتج بنجاح وتحديثه سحابياً لجميع الأجهزة");
    } else {
      const updated = [...products, productData];
      saveProducts(updated);
      toast.success("✨ تمت إضافة المنتج بنجاح ومزامنته مع أجهزة الموظفين");
    }

    setFormData(createEmptyProductForm());
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (product: Product) => {
    if (!canViewSensitiveFinancials) return;
    setFormData({
      code: product.code || "",
      plu: product.plu || product.code || "",
      saleMode: product.saleMode || "unit",
      barcodes: getAdditionalBarcodeSlots(product),
      name: product.name || "",
      unit: product.unit || "كرتونة",
      unitsPerPackage: product.unitsPerPackage?.toString() || "",
      retailPrice: product.retailPrice?.toString() || "",
      wholesaleRetailPrice: getSectorSalePrice(product).toString(),
      bulkPrice: product.bulkPrice?.toString() || "",
      wholesalePrice: (product.wholesalePrice || product.wholesalePricePerUnit || "").toString(),
      category: product.category || "",
      contentUnit: product.contentUnit || "قطعة",
      availableQuantity: product.availableQuantity?.toString() || "0",
      loyaltyPoints: product.loyaltyPoints?.toString() || "",
      imageUrl: product.imageUrl || product.catalogImageUrl || ""
    });
    setEditingId(product.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (!canViewSensitiveFinancials) return;
    if (!confirm("هل أنت متأكد من حذف هذا المنتج؟")) return;
    const updated = products.filter(p => p.id !== id);
    saveProducts(updated);
    toast.success("🗑️ تم حذف المنتج بنجاح وتحديث السحابة");
  };

  const updateStock = (product: Product, difference: number) => {
    if (!canViewSensitiveFinancials) return;
    const nextQuantity = Math.max(0, Number(product.availableQuantity || 0) + difference);
    saveProducts(products.map(item => item.id === product.id ? {
      ...item,
      availableQuantity: nextQuantity,
      quantity: nextQuantity
    } : item));
    toast.success(`تم تحديث مخزون ${product.name} إلى ${nextQuantity} ${product.unit || "وحدة"} ومزامنته سحابياً`);
  };

  const categoryProducts = useMemo(() => filterProductsByCategory(products, categoryFilter), [products, categoryFilter]);
  const filteredProducts = useMemo(() => categoryProducts.filter(p => {
    const query = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(query) || p.code.toLowerCase().includes(query) || normalizeBarcodes(p.barcodes || p.code).some(code => code.toLowerCase().includes(query)) || (p.category && p.category.toLowerCase().includes(query));
  }), [categoryProducts, searchQuery]);
  const visibleProducts = useMemo(() => filteredProducts.slice(0, 120), [filteredProducts]);
  const bulkImportCount = useMemo(() => bulkImportText.split(/\r?\n/).map(row => row.trim()).filter(Boolean).length, [bulkImportText]);

  const selectCategory = (category: string) => {
    setCategoryFilter(category);
    setSearchQuery("");
  };

  const storeSummary = useMemo(() => calculateStoreProfitSummary(products as any), [products]);
  const tradeMarginSummary = useMemo(() => calculateTradeMarginSummary(products as any, recipes), [products, recipes]);
  const viewingProduct = products.find(product => product.id === viewingProductId) || null;
  const formCartonCost = Number(formData.wholesalePrice) || 0;
  const formUnitsPerPackage = Number(formData.unitsPerPackage) || 1;
  const formPieceCost = calculateWholesalePricePerPiece(formCartonCost, formUnitsPerPackage);
  const formCartonsCount = Math.max(0, Number(formData.availableQuantity) || 0);
  const formStockCost = formCartonsCount * formCartonCost;
  const toMarketingPost = (product: Product) => ({
    kind: "product" as const,
    title: product.name,
    price: Number(product.retailPrice) || getSectorSalePrice(product),
    unit: product.unit,
    description: `متاح الآن بسعر مميز${product.category ? ` ضمن قسم ${product.category}` : ""}.`,
    link: `${window.location.origin}/catalog`,
    imageUrl: product.imageUrl || product.catalogImageUrl,
  });

  if (isSeller) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 pb-24" dir="rtl">
        <main className="mx-auto max-w-5xl space-y-5">
          <header className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-black text-slate-900">المنتجات وأسعار البيع</h1>
                <p className="mt-1 text-sm text-slate-600">يعرض لك أسماء المنتجات وأسعار البيع لتخدم العميل بسرعة.</p>
              </div>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>الرئيسية</Button>
            </div>
          </header>

          <Card className="border border-blue-100 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-slate-900">الفئات</p>{categoryFilter !== "all" && <Button type="button" size="sm" variant="outline" onClick={() => selectCategory("all")}><X className="ml-1 h-4 w-4" />كل الفئات</Button>}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"><Button type="button" size="sm" variant={categoryFilter === "all" ? "default" : "outline"} onClick={() => selectCategory("all")} className="justify-between">كل المنتجات <span>{products.length}</span></Button>{categoryCounts.map(({ category, count }) => <Button key={category} type="button" size="sm" variant={categoryFilter === category ? "default" : "outline"} onClick={() => selectCategory(category)} className="justify-between whitespace-normal text-right">{category} <span>{count}</span></Button>)}</div>
              <div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="ابحث باسم المنتج أو الكود..." className="pr-10" /></div><Button type="button" variant="outline" onClick={() => setShowBarcodeSearchScanner(true)} className="shrink-0 border-orange-300 text-orange-700"><Camera className="ml-1 h-4 w-4" />تصوير الكود</Button></div>
            </CardContent>
          </Card>

          {filteredProducts.length === 0 ? (
            <Card className="border-0 shadow-sm"><CardContent className="py-16 text-center text-slate-500">لا توجد منتجات مطابقة للبحث.</CardContent></Card>
          ) : (
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProducts.map((product) => (
                <Card key={product.id} className="border-0 shadow-sm">
                  <CardHeader className="pb-3"><div className="flex items-center gap-3">{product.imageUrl || product.catalogImageUrl ? <img src={product.imageUrl || product.catalogImageUrl} alt={product.name} className="h-14 w-14 rounded-2xl border object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Package className="h-6 w-6" /></div>}<div><CardTitle className="text-lg text-slate-900">{product.name}</CardTitle><p className="text-xs text-slate-500">{product.category || "بدون فئة"} · {getPackageDescription(product)}</p></div></div></CardHeader>
                  <CardContent className="grid grid-cols-1 gap-2 text-sm">
                    <div className="rounded-xl bg-blue-50 p-3"><p className="text-xs text-slate-500">سعر التجزئة</p><p className="mt-1 font-black text-blue-700">{product.retailPrice || 0} ج.م</p></div>
                    <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-slate-500">سعر القطاعي</p><p className="mt-1 font-black text-emerald-700">{getSectorSalePrice(product)} ج.م</p></div>
                    {Number(product.bulkPrice) > 0 && <div className="rounded-xl bg-violet-50 p-3"><p className="text-xs text-slate-500">سعر البيع بالجملة</p><p className="mt-1 font-black text-violet-700">{product.bulkPrice} ج.م</p></div>}
                    <MarketingShareButton post={toMarketingPost(product)} compact />
                  </CardContent>
                </Card>
              ))}
            </section>
          )}
          <AdvancedBarcodeScanner isOpen={showBarcodeSearchScanner} onClose={() => setShowBarcodeSearchScanner(false)} onDetect={(code) => { setSearchQuery(code); setCategoryFilter("all"); setShowBarcodeSearchScanner(false); toast.success(`تم البحث بالكود: ${code}`); }} title="تصوير باركود للبحث عن السعر" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm mb-6">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1"
            >
              الرئيسية
            </Button>
            <h1 className="text-lg sm:text-xl font-bold text-gray-800 leading-tight">📦 إدارة المنتجات والأسعار <span className="text-sm text-blue-600">(سحابي مباشر ☁️)</span></h1>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
            <Button
              onClick={() => setShowStats(!showStats)}
              variant="outline"
              className="border-indigo-500 text-indigo-600 font-bold"
            >
              📊 هامش ربح المهنة ({Math.round(tradeMarginSummary.marginPercent)}%)
            </Button>
            <Button
              onClick={openNewProductForm}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              <Plus className="w-4 h-4 mr-1" /> إضافة منتج جديد
            </Button>
            <Button
              type="button"
              onClick={() => setShowBulkImport(true)}
              variant="outline"
              className="border-emerald-500 text-emerald-700 font-bold"
            >
              <Plus className="w-4 h-4 mr-1" /> إضافة مجموعة منتجات
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-6">
        {/* Store Profit Summary Banner */}
        {showStats && (
          <Card className="border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl text-indigo-900">📊 تحليل هامش المهنة وربح المخزون</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-5 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div><p className="font-black text-emerald-950">هامش ربح المهنة — من سعر وحدة واحدة لكل صنف وتركيبة</p><p className="mt-1 text-xs text-emerald-800">لا يتأثر بعدد الكراتين أو المخزون؛ يجمع تكلفة وسعر بيع وحدة واحدة من كل منتج وتركيبة مسعّرة.</p></div>
                  <div className="rounded-xl bg-white px-5 py-3 text-center shadow-sm"><p className="text-xs text-slate-500">هامش ربح المهنة</p><p className="text-3xl font-black text-emerald-700">{tradeMarginSummary.marginPercent.toFixed(2)}%</p></div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm md:grid-cols-4"><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">أصناف المنتجات</p><p className="font-black text-slate-800">{tradeMarginSummary.pricedProducts}</p></div><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">التركيبات</p><p className="font-black text-slate-800">{tradeMarginSummary.pricedRecipes}</p></div><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">تكلفة وحدة من كل صنف</p><p className="font-black text-orange-700">{tradeMarginSummary.unitCost.toFixed(2)} ج.م</p></div><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">ربح نفس الوحدات</p><p className="font-black text-emerald-700">{tradeMarginSummary.unitProfit.toFixed(2)} ج.م</p></div></div>
              </div>
              <p className="mb-3 text-sm font-black text-indigo-900">ربح المخزون الحالي — يتغير مع كمية الكراتين أو الوحدات المتوفرة</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                <div className="bg-white p-4 rounded-xl shadow-sm border">
                  <p className="text-xs text-gray-500">الأصناف المسعرة</p>
                  <p className="text-2xl font-bold text-gray-800">{storeSummary.pricedProducts}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border">
                  <p className="text-xs text-gray-500">تكلفة مخزون الجملة</p>
                  <p className="text-xl font-bold text-blue-600">{Math.round(storeSummary.stockCost).toLocaleString()} ج.م</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border">
                  <p className="text-xs text-gray-500">قيمة مخزون البيع</p>
                  <p className="text-xl font-bold text-green-600">{Math.round(storeSummary.stockSale).toLocaleString()} ج.م</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border bg-indigo-600 text-white">
                  <p className="text-xs text-indigo-100">نسبة ربح المخزون الحالي</p>
                  <p className="text-2xl font-black">{Math.round(storeSummary.stockProfitPercent)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Category navigation and search */}
        <Card className="border-2 border-blue-100 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">قائمة الفئات</CardTitle>
                <p className="mt-1 text-xs text-slate-500">اضغط على أي فئة لعرض المنتجات المسجلة داخلها فقط.</p>
              </div>
              {categoryFilter !== "all" && <Button type="button" size="sm" variant="outline" onClick={() => selectCategory("all")}><X className="ml-1 h-4 w-4" />عرض كل الفئات</Button>}
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-5">
            <Button type="button" variant={categoryFilter === "all" ? "default" : "outline"} onClick={() => selectCategory("all")} className="h-auto min-h-16 justify-between gap-2 whitespace-normal text-right">
              <span>كل المنتجات</span><span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{products.length}</span>
            </Button>
            {categoryCounts.map(({ category, count }) => (
              <Button key={category} type="button" variant={categoryFilter === category ? "default" : "outline"} onClick={() => selectCategory(category)} className="h-auto min-h-16 justify-between gap-2 whitespace-normal text-right">
                <span>{category}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{count}</span>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="flex flex-col items-center justify-between gap-4 p-4 md:flex-row">
            <div className="flex w-full gap-2 md:max-w-xl">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ابحث باسم المنتج أو الكود..." className="pr-10" />
              </div>
              <Button type="button" variant="outline" onClick={() => setShowBarcodeSearchScanner(true)} className="shrink-0 border-orange-300 text-orange-700" title="تصوير باركود للبحث"><Camera className="ml-1 h-4 w-4" />تصوير الكود</Button>
            </div>
            <select value={categoryFilter} onChange={event => selectCategory(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm md:w-56"><option value="all">كل الفئات</option>{availableCategories.map(category => <option key={category} value={category}>{category}</option>)}</select>
            <div className="text-sm font-semibold text-gray-600">{categoryFilter === "all" ? "كل المنتجات" : `منتجات فئة: ${categoryFilter}`} · <span className="font-bold text-blue-600">{filteredProducts.length}</span> منتج</div>
          </CardContent>
        </Card>

        <Card className="border-2 border-blue-100 bg-blue-50/60 shadow-sm">
          <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button onClick={openNewProductForm} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
              <Plus className="w-4 h-4 ml-1" /> إضافة منتج جديد
            </Button>
            <Button variant="outline" onClick={() => setSearchQuery("")} className="border-indigo-300 text-indigo-700 font-bold">
              <Search className="w-4 h-4 ml-1" /> بحث بالاسم أو الباركود
            </Button>
            <Button variant="outline" onClick={() => setShowStats(true)} className="border-green-300 text-green-700 font-bold">
              <DollarSign className="w-4 h-4 ml-1" /> تفاصيل الربح والمخزون
            </Button>
          </CardContent>
        </Card>

        {/* Products Table / Grid */}
        <Card className="border shadow-lg">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div><CardTitle>قائمة المنتجات والأسعار (تحديث سحابي فوري)</CardTitle><p className="mt-1 text-xs text-slate-500">حدد منتجًا أو عدة منتجات لنقلها إلى فئة أخرى أو حذفها معًا.</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={toggleVisibleProducts}>{filteredProducts.length > 0 && filteredProducts.every(product => selectedProductIds.includes(product.id)) ? "إلغاء تحديد الظاهر" : "تحديد الظاهر"}</Button>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">محدد: {selectedProductIds.length}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {selectedProductIds.length > 0 && <div className="mb-4 flex flex-col gap-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-3 lg:flex-row lg:items-center">
              <p className="text-sm font-black text-indigo-950">إجراءات المحدد ({selectedProductIds.length})</p>
              <div className="flex flex-1 flex-wrap gap-2">
                <select value={moveCategory} onChange={event => setMoveCategory(event.target.value)} className="h-10 min-w-48 flex-1 rounded-lg border border-indigo-200 bg-white px-3 text-sm"><option value="">اختر فئة النقل...</option>{availableCategories.map(category => <option key={category} value={category}>{category}</option>)}</select>
                <Button type="button" onClick={moveSelectedProducts} className="bg-indigo-600 text-white hover:bg-indigo-700">نقل المحدد إلى الفئة</Button>
                <Button type="button" variant="outline" onClick={deleteSelectedProducts} className="border-red-300 text-red-700 hover:bg-red-50">حذف المحدد</Button>
                <Button type="button" variant="ghost" onClick={() => setSelectedProductIds([])}>إلغاء التحديد</Button>
              </div>
            </div>}
            {filteredProducts.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-3" />
                <p className="font-semibold text-lg">لا توجد منتجات مسجلة حتى الآن</p>
                <p className="text-sm mt-1">اضغط على "إضافة منتج جديد" للبدء</p>
              </div>
            ) : (
              <>
              <div className="space-y-3 md:hidden">
                {visibleProducts.map((p) => {
                  const cost = getRetailCostPrice(p);
                  const sectorPrice = getSectorSalePrice(p);
                  const profit = calculateRetailProfitPercent(sectorPrice, cost);
                  const stockCost = getStockCostValue(p);
                  return (
                    <div key={p.id} className={`rounded-xl border bg-white p-4 shadow-sm ${selectedProductIds.includes(p.id) ? "border-indigo-400 ring-2 ring-indigo-100" : "border-gray-200"}`}>
                      <div className="flex justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <input type="checkbox" checked={selectedProductIds.includes(p.id)} onChange={() => toggleProductSelection(p.id)} className="h-5 w-5 shrink-0 accent-indigo-600" aria-label={`تحديد ${p.name}`} />
                          {p.imageUrl || p.catalogImageUrl ? <img src={p.imageUrl || p.catalogImageUrl} alt={p.name} className="h-12 w-12 shrink-0 rounded-xl border object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><Package className="h-5 w-5" /></div>}
                          <div className="min-w-0">
                          <h3 className="font-bold text-gray-900 truncate">{p.name}</h3>
                          <p className="text-xs text-gray-500 mt-1">{p.category || "بدون فئة"} · {getPackageDescription(p)}</p>
                          </div>
                        </div>
                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-800 h-fit">ربح {profit}%</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                        <div className="rounded-lg bg-blue-50 p-2"><p className="text-xs text-gray-500">سعر التجزئة</p><p className="font-bold text-blue-700">{p.retailPrice || 0} ج.م</p></div>
                        <div className="rounded-lg bg-green-50 p-2"><p className="text-xs text-gray-500">سعر القطاعي</p><p className="font-bold text-green-700">{sectorPrice} ج.م</p></div>
                        <div className="rounded-lg bg-indigo-50 p-2"><p className="text-xs text-gray-500">المخزون</p><p className="font-bold text-indigo-700">{p.availableQuantity || 0} {p.unit || "عبوة"}</p></div>
                        <div className="rounded-lg bg-amber-50 p-2"><p className="text-xs text-gray-500">قيمة المخزون</p><p className="font-bold text-amber-700">{stockCost.toLocaleString("ar-EG")} ج.م</p></div>
                      </div>
                      <div className="grid grid-cols-5 gap-2 mt-3">
                        <Button size="sm" variant="outline" onClick={() => setViewingProductId(p.id)} className="text-gray-700"><Eye className="w-4 h-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => updateStock(p, 1)} className="text-green-700 border-green-200"><Plus className="w-4 h-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => updateStock(p, -1)} className="text-orange-700 border-orange-200"><Minus className="w-4 h-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(p)} className="text-blue-700 border-blue-200"><Edit2 className="w-4 h-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(p.id)} className="text-red-700 border-red-200"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                      <div className="mt-2"><MarketingShareButton post={toMarketingPost(p)} compact /></div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b bg-gray-100 text-gray-700 text-sm">
                      <th className="p-3 text-center">تحديد</th>
                      <th className="p-3">الكود</th>
                      <th className="p-3">صورة واسم المنتج</th>
                      <th className="p-3">الفئة والعبوة</th>
                      <th className="p-3">تكلفة المحتوى</th>
                      <th className="p-3">سعر التجزئة</th>
                      <th className="p-3">سعر القطاعي</th>
                      <th className="p-3">نسبة الربح القطاعي</th>
                      <th className="p-3">تكلفة العبوة</th>
                      <th className="p-3">المخزون / القيمة</th>
                      <th className="p-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {visibleProducts.map((p) => {
                      const cost = getRetailCostPrice(p);
                      const sectorPrice = getSectorSalePrice(p);
                      const profit = calculateRetailProfitPercent(sectorPrice, cost);
                      const stockCost = getStockCostValue(p);
                      return (
                        <tr key={p.id} className={`transition hover:bg-gray-50 ${selectedProductIds.includes(p.id) ? "bg-indigo-50" : ""}`}>
                          <td className="p-3 text-center"><input type="checkbox" checked={selectedProductIds.includes(p.id)} onChange={() => toggleProductSelection(p.id)} className="h-5 w-5 accent-indigo-600" aria-label={`تحديد ${p.name}`} /></td>
                          <td className="p-3 font-mono text-xs text-gray-500">{p.code}</td>
                          <td className="p-3 font-bold text-gray-800"><div className="flex items-center gap-2">{p.imageUrl || p.catalogImageUrl ? <img src={p.imageUrl || p.catalogImageUrl} alt={p.name} className="h-10 w-10 rounded-lg border object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><Package className="h-4 w-4" /></div>}<span>{p.name}</span></div></td>
                          <td className="p-3 text-gray-600"><p>{p.category || "بدون فئة"}</p><p className="text-xs text-slate-500">{getPackageDescription(p)}</p></td>
                          <td className="p-3 text-blue-600 font-semibold">{cost.toFixed(2)} ج.م</td>
                          <td className="p-3 text-blue-600 font-bold">{p.retailPrice || 0} ج.م</td>
                          <td className="p-3 text-green-600 font-bold">{sectorPrice} ج.م</td>
                          <td className="p-3">
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                              {profit}%
                            </span>
                          </td>
                          <td className="p-3 text-gray-700">{p.wholesalePrice || p.wholesalePricePerUnit || 0} ج.م</td>
                          <td className="p-3 font-bold text-indigo-600">{p.availableQuantity || 0} {p.unit || "عبوة"}<br /><span className="text-xs text-amber-700">{stockCost.toLocaleString("ar-EG")} ج.م</span></td>
                          <td className="p-3 text-center flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setViewingProductId(p.id)}
                              className="h-8 px-2 text-gray-700 border-gray-200 hover:bg-gray-50"
                              title="عرض تفاصيل المنتج"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <MarketingShareButton post={toMarketingPost(p)} compact />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStock(p, 1)}
                              className="h-8 px-2 text-green-700 border-green-200 hover:bg-green-50"
                              title="زيادة قطعة أو وحدة في المخزون"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStock(p, -1)}
                              className="h-8 px-2 text-orange-700 border-orange-200 hover:bg-orange-50"
                              title="إنقاص قطعة أو وحدة من المخزون"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(p)}
                              className="h-8 px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(p.id)}
                              className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Product Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border-2 border-blue-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              {editingId ? "✏️ تعديل بيانات المنتج" : "➕ إضافة منتج جديد (سحابي مباشر)"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">اسم المنتج *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: كيس أوقية أو صابون سائل..."
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">الباركود الأساسي (اختياري)</label>
                  <div className="flex gap-2">
                    <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="رمز واحد فقط — صوّر أو اكتب" dir="ltr" className="text-left" aria-invalid={barcodeFieldError?.field === "primary"} />
                    <Button type="button" variant="outline" onClick={() => { setBarcodeScannerTarget(-1); setShowBarcodeScanner(true); }} className="shrink-0 border-orange-300 text-orange-700" title="تصوير الباركود الأساسي"><Camera className="ml-1 h-4 w-4" />تصوير</Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-bold text-gray-700">باركودات إضافية — كل خانة لباركود واحد</p>
                    {formData.barcodes.map((barcode, index) => (
                      <div key={index} className="flex min-w-0 gap-2">
                        <Input value={barcode} onChange={event => updateAdditionalBarcode(index, event.target.value)} placeholder={`باركود إضافي ${index + 1} — رمز واحد فقط`} dir="ltr" className="min-w-0 text-left" aria-invalid={barcodeFieldError?.field === "additional" && barcodeFieldError.index === index} />
                        <Button type="button" variant="outline" onClick={() => { setBarcodeScannerTarget(index); setShowBarcodeScanner(true); }} className="shrink-0 border-orange-300 px-3 text-orange-700" title={`تصوير الباركود الإضافي ${index + 1}`}><Camera className="h-4 w-4" /><span className="sr-only">تصوير</span></Button>
                        <Button type="button" variant="outline" onClick={() => removeBarcodeSlot(index)} className="shrink-0 px-3 text-red-600" title="حذف خانة الباركود"><Trash2 className="h-4 w-4" /><span className="sr-only">حذف</span></Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" onClick={addBarcodeSlot} className="w-full border-dashed border-orange-300 text-orange-700"><Plus className="ml-1 h-4 w-4" />إضافة خانة باركود أخرى</Button>
                    {editingId && <Button type="button" variant="outline" onClick={printProductBarcodeLabels} className="w-full border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"><Printer className="ml-1 h-4 w-4" />طباعة ملصقات الباركود ({collectProductBarcodes(formData.code, formData.barcodes).length})</Button>}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">تبدأ بخمس خانات للمنتج (باركود أساسي و4 إضافية)، ويمكنك إضافة خانات بلا حد. لا تضع فاصلة؛ كل رمز في خانته، وسيبحث الكاشير بها كلها.</p>
                  {barcodeFieldError && <p role="alert" className="mt-1 text-xs font-bold text-red-600">يوجد أكثر من باركود في خانة واحدة. انقل كل باركود إلى خانة منفصلة وأزل الفاصلة أو المسافات.</p>}
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">كود PLU داخلي / كود الرف</label>
                  <Input value={formData.plu} onChange={event => setFormData({ ...formData, plu: event.target.value })} placeholder="مثال: PLU-1001 أو اتركه ليُستخدم الكود تلقائيًا" dir="ltr" className="text-left" />
                  <p className="mt-1 text-[11px] text-indigo-700">لمنتج بلا باركود: اطبع هذا الكود على الرف أو ابحث به من الكاشير. لا يلزم وضع ملصق على كل قطعة.</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">طريقة البيع في الكاشير</label>
                  <select value={formData.saleMode} onChange={event => setFormData({ ...formData, saleMode: event.target.value as "unit" | "weight" })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="unit">بالقطعة / الكمية</option>
                    <option value="weight">بالوزن — يسمح بربع ونصف كيلو</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">يمكن تغيير الكمية داخل الكاشير مثل 0.25 أو 0.5 بدون إنشاء باركود جديد.</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">فئة المنتج</label>
                  <Button type="button" variant="outline" onClick={() => setShowCategoryPicker(true)} className="h-11 w-full justify-between bg-white text-right font-normal">
                    <span className={formData.category ? "text-slate-900" : "text-slate-400"}>{formData.category || "اضغط لاختيار الفئة"}</span>
                    <span className="text-xs text-slate-400">اختيار</span>
                  </Button>
                  <div className="mt-2 flex gap-2"><Input value={newCategoryName} onChange={event => setNewCategoryName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addProductCategory(); } }} placeholder="اكتب فئة جديدة" /><Button type="button" size="sm" onClick={addProductCategory} className="shrink-0 bg-indigo-600 hover:bg-indigo-700"><Plus className="ml-1 h-4 w-4" />إضافة فئة</Button></div>
                  <p className="mt-1 text-[11px] text-indigo-700">الفئة الجديدة تُحفظ وتظهر في القائمة على كل الأجهزة.</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">نوع العبوة / الوحدة الكبرى</label>
                  <Input list="product-package-options" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} placeholder="مثال: حقيبة أو شكارة أو كرتونة" />
                  <datalist id="product-package-options">{PACKAGE_TYPES.map(unit => <option key={unit} value={unit} />)}</datalist>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">وحدة محتوى العبوة</label>
                  <Input list="product-content-unit-options" value={formData.contentUnit} onChange={(e) => setFormData({ ...formData, contentUnit: e.target.value })} placeholder="قطعة أو كيلو أو لتر" />
                  <datalist id="product-content-unit-options">{CONTENT_UNITS.map(unit => <option key={unit} value={unit} />)}</datalist>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">عدد المحتويات داخل {formData.unit || "العبوة"}</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.unitsPerPackage}
                    onChange={(e) => setFormData({ ...formData, unitsPerPackage: e.target.value })}
                    placeholder={`مثال: 40 ${formData.contentUnit || "قطعة"}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">سعر جملة {formData.unit || "العبوة"} (ج.م)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.wholesalePrice}
                    onChange={(e) => setFormData({ ...formData, wholesalePrice: e.target.value })}
                    placeholder="مثال: 400"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">تكلفة {formData.contentUnit || "الوحدة"} (محسوبة تلقائيًا)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formPieceCost ? formPieceCost.toFixed(2) : ""}
                    placeholder="سعر العبوة ÷ عدد محتوياتها"
                    readOnly
                    className="bg-slate-100 font-bold text-blue-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">سعر البيع بالتجزئة لكل {formData.contentUnit || "وحدة"} (ج.م)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.retailPrice}
                    onChange={(e) => setFormData({ ...formData, retailPrice: e.target.value })}
                    placeholder="مثال: 105"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">سعر البيع القطاعي لكل {formData.contentUnit || "وحدة"} (ج.م)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.wholesaleRetailPrice}
                    onChange={(e) => setFormData({ ...formData, wholesaleRetailPrice: e.target.value })}
                    placeholder="مثال: 110"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">سعر البيع بالجملة لكل {formData.contentUnit || "وحدة"} (اختياري)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.bulkPrice}
                    onChange={(e) => setFormData({ ...formData, bulkPrice: e.target.value })}
                    placeholder="مثال: 100"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">نقاط الولاء لكل {formData.contentUnit || "وحدة"} (اختياري)</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.loyaltyPoints}
                    onChange={(e) => setFormData({ ...formData, loyaltyPoints: e.target.value })}
                    placeholder="اتركها فارغة أو اكتب 0 إذا لم توجد نقاط"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">تُضاف تلقائيًا عند بيع الوحدة، ولا توجد أي إجبارية لإدخالها.</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">عدد {formData.unit || "العبوات"} المتاحة بالمخزون</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.availableQuantity}
                    onChange={(e) => setFormData({ ...formData, availableQuantity: e.target.value })}
                    placeholder="مثال: 3"
                  />
                </div>
                <div className="md:col-span-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-indigo-900">إجمالي تكلفة المخزون: {formStockCost.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</p>
                      <p className="text-xs text-indigo-700">{formCartonsCount} {formData.unit || "عبوة"} × {formCartonCost.toFixed(2)} ج.م · كل {formData.unit || "عبوة"} فيها {formUnitsPerPackage} {formData.contentUnit || "قطعة"} وتُباع من الداخل بهذه الوحدة.</p>
                    </div>
                    <p className="text-xs font-semibold text-blue-700">تكلفة {formData.contentUnit || "الوحدة"}: {formPieceCost.toFixed(2)} ج.م</p>
                  </div>
                </div>
                <div className="md:col-span-2 rounded-xl border border-violet-200 bg-violet-50 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    {formData.imageUrl ? <img src={formData.imageUrl} alt="معاينة المنتج" className="h-24 w-24 rounded-2xl border-2 border-white bg-white object-cover shadow" /> : <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-violet-300 bg-white text-violet-400"><ImagePlus className="h-8 w-8" /></div>}
                    <div className="flex-1"><p className="font-black text-violet-950">صورة المنتج أو الأيقونة</p><p className="mt-1 text-xs text-violet-700">اختَر صورة من المعرض أو صوّر المنتج مباشرة بالكاميرا.</p><div className="mt-3 flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700"><ImagePlus className="h-4 w-4" /> اختيار من المعرض<input type="file" accept="image/*" className="hidden" onChange={(event) => handleProductImageUpload(event.target.files?.[0])} /></label><label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100"><Camera className="h-4 w-4" /> تصوير مباشر<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => handleProductImageUpload(event.target.files?.[0])} /></label>{formData.imageUrl && <Button type="button" size="sm" variant="outline" onClick={() => setFormData(current => ({ ...current, imageUrl: "" }))}>إزالة الصورة</Button>}</div>{isUploadingImage && <p className="mt-2 text-xs font-bold text-violet-700">جاري تجهيز ورفع صورة الكاميرا...</p>}</div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6"
                >
                  {editingId ? "حفظ التعديلات" : "إضافة وحفظ سحابي"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AdvancedBarcodeScanner isOpen={showBarcodeScanner} onClose={() => { setShowBarcodeScanner(false); setBarcodeScannerTarget(-1); }} onDetect={(code) => { const target = barcodeScannerTarget; setFormData(current => target < 0 ? ({ ...current, code }) : ({ ...current, barcodes: current.barcodes.map((value, index) => index === target ? code : value) })); setShowBarcodeScanner(false); setBarcodeScannerTarget(-1); toast.success(target < 0 ? `تم تسجيل الباركود الأساسي: ${code}` : `تم تسجيل الباركود الإضافي: ${code}`); }} title={barcodeScannerTarget < 0 ? "تصوير الباركود الأساسي" : `تصوير الباركود الإضافي ${barcodeScannerTarget + 1}`} />
      <AdvancedBarcodeScanner isOpen={showBarcodeSearchScanner} onClose={() => setShowBarcodeSearchScanner(false)} onDetect={(code) => { setSearchQuery(code); setCategoryFilter("all"); setShowBarcodeSearchScanner(false); toast.success(`تم البحث بالكود: ${code}`); }} title="تصوير باركود للبحث عن المنتج" />

      {showCategoryPicker && (
        <div className="fixed inset-0 z-[70] bg-black/35" onClick={() => setShowCategoryPicker(false)}>
          <div className="fixed inset-x-0 bottom-0 rounded-t-3xl border-t border-blue-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl" dir="rtl" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="mb-3 flex items-center justify-between">
              <div><p className="font-black text-slate-900">اختيار فئة المنتج</p><p className="text-xs text-slate-500">حرّك الشريط يمينًا ويسارًا ثم اختر الفئة</p></div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowCategoryPicker(false)}><X className="h-5 w-5" /></Button>
            </div>
            <div className="flex snap-x gap-2 overflow-x-auto pb-2">
              {availableCategories.map(category => (
                <Button key={category} type="button" variant={formData.category === category ? "default" : "outline"} onClick={() => { setFormData(current => ({ ...current, category })); setShowCategoryPicker(false); }} className="min-w-max shrink-0 snap-start rounded-full px-5">{category}</Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showBulkImport && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-black/60 p-4" dir="rtl" onClick={() => setShowBulkImport(false)}>
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="overflow-y-auto p-5 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-900">إضافة مجموعة منتجات</h2>
                <p className="mt-1 text-sm text-slate-600">اكتب الفئة مرة واحدة، ثم الصق الأسماء؛ سيُنشئ التطبيق خانة مستقلة لكل منتج داخل الفئة نفسها.</p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowBulkImport(false)}><X className="h-5 w-5" /></Button>
            </div>
            <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
              <label className="mb-2 block text-sm font-black text-indigo-950">اسم الفئة التي ستوضع فيها كل المنتجات *</label>
              <Input value={bulkCategoryName} onChange={event => setBulkCategoryName(event.target.value)} placeholder="مثال: منظفات أو ورقيات أو مستحضرات تجميل" />
              <p className="mt-2 text-xs text-indigo-700">إن كانت الفئة جديدة ستُضاف تلقائيًا إلى قائمة الفئات.</p>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-black text-slate-900">الأسماء المنسوخة</p><p className="text-xs text-slate-500">كل سطر مستقل = منتج مستقل، ويمكن كتابة الاسم فقط أو الاسم ثم الكود.</p></div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowBulkPaste(current => !current)}>{showBulkPaste ? "إخفاء الأسماء" : "إظهار الأسماء"}</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setBulkImportText("")} disabled={!bulkImportText}>مسح الكل</Button>
                </div>
              </div>
              {showBulkPaste && <>
                <Textarea ref={bulkPasteRef} value={bulkImportText} onChange={event => setBulkImportText(event.target.value)} className="mt-3 h-64 max-h-[45vh] min-h-52 resize-y overflow-y-scroll overscroll-contain whitespace-pre text-right leading-7" placeholder={'مثال سريع:\nمسحوق غسيل\nمناديل مطبخ\nسائل أطباق\n\nأو الصق الاسم ثم الكود مفصولًا بعلامة Tab أو فاصلة'} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-500">استخدم عجلة الماوس أو اسحب شريط التمرير داخل المربع للتنقل بين كل الأسماء.</p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => scrollBulkPaste("top")}>↑ إلى البداية</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => scrollBulkPaste("bottom")}>↓ إلى النهاية</Button>
                  </div>
                </div>
              </>}
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>{bulkImportCount} منتجًا جاهزًا للإضافة</span>
                {!showBulkPaste && <span>النص مخفي مؤقتًا ولن يُحذف</span>}
              </div>
            </div>
            <div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-xs leading-6 text-emerald-900">
              <b>مهم:</b> تُنشأ المنتجات بأسعار ومخزون صفر حتى تدخل السعر والرمز والوحدة والإضافات المطلوبة يدويًا من زر التعديل لكل منتج. لا تُضاف أي بيانات سعرية من النص الملصوق.
            </div>
            </div>
            <div className="sticky bottom-0 border-t border-slate-200 bg-white p-4 shadow-[0_-8px_20px_-18px_rgba(15,23,42,0.6)]">
              <div className="mb-2 text-center text-xs font-bold text-slate-600">سيتم إضافة {bulkImportCount} منتجًا إلى فئة «{bulkCategoryName.trim() || "غير محددة"}»</div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setShowBulkImport(false)}>إلغاء</Button>
                <Button type="button" className="min-h-12 bg-emerald-600 text-base font-black text-white hover:bg-emerald-700" onClick={importProductsInBulk}>إضافة المنتجات الآن وحفظها</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setViewingProductId(null)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                {viewingProduct.imageUrl || viewingProduct.catalogImageUrl ? <img src={viewingProduct.imageUrl || viewingProduct.catalogImageUrl} alt={viewingProduct.name} className="h-16 w-16 shrink-0 rounded-2xl border object-cover" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Package className="h-7 w-7" /></div>}
                <div>
                <p className="text-xs font-bold text-blue-600">تفاصيل المنتج</p>
                <h3 className="mt-1 text-xl font-black text-gray-900">{viewingProduct.name}</h3>
                <p className="mt-1 text-xs text-gray-500">الكود: {viewingProduct.code || "غير مسجل"}</p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setViewingProductId(null)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-blue-50 p-3">
                <p className="text-xs text-gray-500">تكلفة القطعة</p>
                <p className="font-black text-blue-700">{getRetailCostPrice(viewingProduct).toFixed(2)} ج.م</p>
              </div>
              <div className="rounded-xl bg-green-50 p-3">
                <p className="text-xs text-gray-500">سعر البيع بالتجزئة</p>
                <p className="font-black text-green-700">{viewingProduct.retailPrice || 0} ج.م</p>
              </div>
              <div className="rounded-xl bg-indigo-50 p-3">
                <p className="text-xs text-gray-500">سعر البيع القطاعي</p>
                <p className="font-black text-indigo-700">{getSectorSalePrice(viewingProduct)} ج.م</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs text-gray-500">عدد الكراتين بالمخزون</p>
                <p className="font-black text-amber-700">{viewingProduct.availableQuantity || 0} {viewingProduct.unit || "كرتونة"}</p>
              </div>
              <div className="rounded-xl bg-purple-50 p-3">
                <p className="text-xs text-gray-500">تكلفة الكرتونة</p>
                <p className="font-black text-purple-700">{Number(viewingProduct.wholesalePrice || viewingProduct.wholesalePricePerUnit || 0).toFixed(2)} ج.م</p>
              </div>
              <div className="rounded-xl bg-rose-50 p-3">
                <p className="text-xs text-gray-500">إجمالي تكلفة المخزون</p>
                <p className="font-black text-rose-700">{getStockCostValue(viewingProduct).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-xs text-gray-500">نسبة ربح القطاعي</p>
                <p className="font-black text-emerald-700">{calculateRetailProfitPercent(getSectorSalePrice(viewingProduct), getRetailCostPrice(viewingProduct))}%</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <Button onClick={() => updateStock(viewingProduct, -1)} variant="outline" className="border-orange-200 text-orange-700">
                <Minus className="w-4 h-4 ml-1" /> إنقاص {viewingProduct.unit || "كرتونة"}
              </Button>
              <Button onClick={() => updateStock(viewingProduct, 1)} className="bg-green-600 hover:bg-green-700 text-white">
                <Plus className="w-4 h-4 ml-1" /> زيادة {viewingProduct.unit || "كرتونة"}
              </Button>
              <Button onClick={() => { handleEdit(viewingProduct); setViewingProductId(null); }} variant="outline" className="border-blue-200 text-blue-700">
                <Edit2 className="w-4 h-4 ml-1" /> تعديل
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
