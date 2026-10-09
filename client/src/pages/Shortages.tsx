import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, AlertTriangle, TrendingDown, Package, Plus, Trash2, Edit2, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getActiveShopContext, subscribeToShopChanges } from "@/lib/supabase/products";
import {
  createCloudShortageCategory,
  deleteCloudShortage,
  listCloudManualProducts,
  listCloudShortageCategories,
  listCloudShortages,
  listShortageProducts,
  replaceCloudManualProducts,
  saveCloudShortage,
  type CloudManualProduct,
  type CloudShortage,
} from "@/lib/supabase/shortages";

interface Product {
  id: string;
  name: string;
  quantity: number;
  availableQuantity?: number;
  minQuantity?: number;
  unit: string;
  wholesalePricePerUnit: number;
  category: string;
}

type ManualProduct = CloudManualProduct;
type Shortage = CloudShortage;

const DEFAULT_CATEGORIES = [
  "مستحضرات التجميل",
  "منظفات متنوعة",
  "خامات",
  "تركيبات",
  "أدوات منزلية",
  "خردوات",
  "ورقيات"
];

export default function Shortages() {
  const [, navigate] = useLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [manualProducts, setManualProducts] = useState<ManualProduct[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [manualProductsText, setManualProductsText] = useState("");
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("مستحضرات التجميل");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["مستحضرات التجميل"]));
  const [minThreshold, setMinThreshold] = useState("5");
  const [showForm, setShowForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manualProductName, setManualProductName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [formData, setFormData] = useState({
    productId: "",
    minQuantity: "",
    notes: "",
    category: "مستحضرات التجميل"
  });
  const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...customCategories]));

  const refreshCloudData = async () => {
    try {
      const [cloudProducts, cloudManual, cloudCategories, cloudShortageRows] = await Promise.all([
        listShortageProducts(),
        listCloudManualProducts(),
        listCloudShortageCategories(),
        listCloudShortages(),
      ]);
      const normalizedProducts: Product[] = cloudProducts.map(product => ({
        id: product.id,
        name: product.name,
        quantity: product.quantity,
        availableQuantity: product.quantity,
        minQuantity: product.minQuantity,
        unit: product.unit,
        wholesalePricePerUnit: product.wholesalePricePerUnit ?? 0,
        category: product.category,
      }));
      setProducts(normalizedProducts.sort((a, b) => a.name.localeCompare(b.name, "ar")));
      setManualProducts(cloudManual);
      setCustomCategories(cloudCategories.map(category => category.name));
      setShortages(cloudShortageRows);
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تحميل بيانات النواقص من السحابة.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => Promise<unknown>) | undefined;
    const refreshOnReturn = () => { if (mounted) void refreshCloudData(); };
    window.addEventListener("focus", refreshOnReturn);
    void refreshCloudData();
    void getActiveShopContext()
      .then(({ shopId }) => subscribeToShopChanges(shopId, () => { if (mounted) void refreshCloudData(); }))
      .then(stop => { if (mounted) unsubscribe = stop; else void stop(); })
      .catch(error => { if (mounted) toast.error(error instanceof Error ? error.message : "تعذر الاتصال بمزامنة النواقص."); });
    return () => {
      mounted = false;
      window.removeEventListener("focus", refreshOnReturn);
      if (unsubscribe) void unsubscribe();
    };
  }, []);

  const checkShortages = async () => {
    const threshold = parseFloat(minThreshold) || 5;
    const candidates = products.filter(product => {
      const currentQty = product.availableQuantity ?? product.quantity ?? 0;
      const minQty = product.minQuantity || threshold;
      return currentQty < minQty && !shortages.some(item => item.productId === product.id && item.status !== "received");
    });
    try {
      const created: Shortage[] = [];
      for (const product of candidates) {
        created.push(await saveCloudShortage({
          productId: product.id,
          productName: product.name,
          currentQuantity: product.availableQuantity ?? product.quantity ?? 0,
          minQuantity: product.minQuantity || threshold,
          unit: product.unit,
          status: "pending",
          notes: "",
          category: product.category || "أخرى",
        }));
      }
      if (created.length) {
        setShortages(current => [...created, ...current]);
        toast.warning(`تم اكتشاف ${created.length} منتج ناقص`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ النواقص المكتشفة.");
    }
  };

  const handleSaveManualProductList = async () => {
    const names = manualProductsText
      .split(/[\n,،]+/)
      .map(name => name.trim())
      .filter(Boolean);

    if (names.length === 0) {
      toast.error("اكتب اسم منتج واحد على الأقل، كل منتج في سطر");
      return;
    }

    try {
      const categoryProducts = await replaceCloudManualProducts(formData.category, names);
      setManualProducts(current => [...current.filter(product => product.category !== formData.category), ...categoryProducts]);
      setManualProductsText("");
      toast.success(`تم حفظ ${categoryProducts.length} منتج في فئة ${formData.category}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ القائمة اليدوية في السحابة.");
    }
  };

  const handleAddCustomCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      toast.error("اكتب اسم الفئة أولاً");
      return;
    }

    const existingCategory = categories.find(category => category.trim() === name);
    if (existingCategory) {
      setFormData(current => ({ ...current, category: existingCategory }));
      setExpandedCategories(current => {
        const updated = new Set(current);
        updated.add(existingCategory);
        return updated;
      });
      setNewCategoryName("");
      setShowCategoryForm(false);
      toast.message("الفئة موجودة بالفعل");
      return;
    }

    try {
      const created = await createCloudShortageCategory(name);
      setCustomCategories(current => Array.from(new Set([...current, created.name])));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الفئة في السحابة.");
      return;
    }
    setFormData(current => ({ ...current, category: name, productId: "" }));
    setSelectedCategory(name);
    setExpandedCategories(current => {
      const updated = new Set(current);
      updated.add(name);
      return updated;
    });
    setNewCategoryName("");
    setShowCategoryForm(false);
    toast.success(`✅ تمت إضافة فئة «${name}»`);
  };

  const handleAddShortage = async () => {
    const product = products.find(p => p.id === formData.productId);
    const manualListProduct = manualProducts.find(p => p.id === formData.productId);
    const manualName = manualProductName.trim();

    if (!product && !manualName) {
      toast.error("اختر منتجاً من قائمة المنتجات أو اكتب اسم النقص يدوياً");
      return;
    }

    const productName = product?.name || manualListProduct?.name || manualName;
    const currentQty = product ? (product.availableQuantity ?? product.quantity ?? 0) : 0;
    const parsedMinimum = Number(formData.minQuantity);
    const minQty = formData.minQuantity.trim() && Number.isFinite(parsedMinimum)
      ? Math.max(0, parsedMinimum)
      : product?.minQuantity ?? 5;
    const unit = product?.unit || manualListProduct?.unit || "";
    const current = editingId ? shortages.find(item => item.id === editingId) : undefined;
    try {
      const saved = await saveCloudShortage({
        productId: product?.id || "",
        productName,
        currentQuantity: currentQty,
        minQuantity: minQty,
        unit,
        status: current?.status ?? "pending",
        notes: formData.notes,
        category: formData.category,
      }, current);
      setShortages(items => current ? items.map(item => item.id === saved.id ? saved : item) : [saved, ...items]);
      toast.success(current ? "تم تحديث النقص في السحابة" : "تم حفظ النقص في السحابة");
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ النقص في السحابة.");
    }
  };

  const handleDeleteShortage = async (id: string) => {
    const item = shortages.find(shortage => shortage.id === id);
    if (!item || !confirm("هل تريد حذف هذا النقص؟")) return;
    try {
      await deleteCloudShortage(item);
      setShortages(current => current.filter(shortage => shortage.id !== id));
      toast.success("تم الحذف من السحابة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حذف النقص.");
    }
  };

  const handleStatusChange = async (id: string, status: "pending" | "ordered" | "received") => {
    const current = shortages.find(item => item.id === id);
    if (!current) return;
    try {
      const saved = await saveCloudShortage({
        productId: current.productId,
        productName: current.productName,
        currentQuantity: current.currentQuantity,
        minQuantity: current.minQuantity,
        unit: current.unit,
        status,
        notes: current.notes,
        category: current.category,
      }, current);
      setShortages(items => items.map(item => item.id === id ? saved : item));
      toast.success(`تم تحديث الحالة إلى ${status}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تغيير حالة النقص.");
    }
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const resetForm = () => {
    setFormData({ productId: "", minQuantity: "", notes: "", category: "مستحضرات التجميل" });
    setManualProductName("");
    setManualProductsText("");
    setEditingId(null);
    setShowForm(false);
  };

  const handleProductSelection = (productId: string) => {
    const selected = products.find((product) => product.id === productId);
    const selectedManual = manualProducts.find((product) => product.id === productId);
    const selectedCategory = selected?.category || selectedManual?.category;
    setFormData({
      ...formData,
      productId,
      category: selectedCategory && categories.includes(selectedCategory) ? selectedCategory : formData.category,
      minQuantity: selected?.minQuantity !== undefined ? String(selected.minQuantity) : formData.minQuantity
    });
    if (selected || selectedManual) setManualProductName("");
  };

  const handleCategoryChange = (category: string) => {
    setFormData({ ...formData, category, productId: "" });
    setManualProductsText(manualProducts.filter(product => product.category === category).map(product => product.name).join("\n"));
  };

  const getCategoryShortages = (category: string) => {
    return shortages.filter(s => s.category === category);
  };

  const getCategoryStats = (category: string) => {
    const categoryShortages = getCategoryShortages(category);
    return {
      total: categoryShortages.length,
      pending: categoryShortages.filter(s => s.status === "pending").length,
      ordered: categoryShortages.filter(s => s.status === "ordered").length,
      received: categoryShortages.filter(s => s.status === "received").length,
      value: categoryShortages.reduce((sum, s) => {
        const product = products.find(p => p.id === s.productId);
        return sum + (s.shortage * (product?.wholesalePricePerUnit || 0));
      }, 0)
    };
  };

  const totalStats = {
    total: shortages.length,
    pending: shortages.filter(s => s.status === "pending").length,
    ordered: shortages.filter(s => s.status === "ordered").length,
    received: shortages.filter(s => s.status === "received").length,
    value: shortages.reduce((sum, s) => {
      const product = products.find(p => p.id === s.productId);
      return sum + (s.shortage * (product?.wholesalePricePerUnit || 0));
    }, 0)
  };

  const ShortageCard = ({ shortage }: { shortage: Shortage }) => (
    <div className="border-2 border-gray-200 rounded-lg p-4 hover:shadow-lg transition">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
        <div>
          <p className="font-bold text-lg">{shortage.productName}</p>
          <p className="text-sm text-gray-600">{shortage.reportedDate}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">الكمية الحالية</p>
          <p className="text-lg font-bold">{shortage.currentQuantity} {shortage.unit}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">الحد الأدنى</p>
          <p className="text-lg font-bold">{shortage.minQuantity} {shortage.unit}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">النقص</p>
          <p className="text-lg font-bold text-red-600">{shortage.shortage} {shortage.unit}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {shortage.status === "pending" && (
            <Button 
              onClick={() => handleStatusChange(shortage.id, "ordered")}
              size="sm"
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              طلب
            </Button>
          )}
          {shortage.status === "ordered" && (
            <Button 
              onClick={() => handleStatusChange(shortage.id, "received")}
              size="sm"
              className="bg-green-600 hover:bg-green-700"
            >
              استلام
            </Button>
          )}
          <Button 
            onClick={() => handleDeleteShortage(shortage.id)}
            size="sm"
            variant="destructive"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
      {shortage.notes && <p className="text-sm text-gray-600 mt-2">📝 {shortage.notes}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-800">⚠️ نواقص أبو رغوة</h1>
            <p className="text-gray-600 mt-1">تتبع المنتجات الناقصة والمخزون المنخفض حسب الفئات</p>
            {isLoading && <p className="mt-1 text-sm text-blue-700">جارٍ تحميل بيانات المحل من السحابة…</p>}
            {loadError && <p role="alert" className="mt-2 text-sm font-medium text-red-700">تعذر تحميل بيانات السحابة: {loadError}</p>}
          </div>
          <Button 
            onClick={() => navigate('/dashboard')}
            variant="outline"
            className="bg-gray-600 hover:bg-gray-700 text-white"
          >
            <ArrowLeft size={20} className="mr-2" />
            العودة
          </Button>
        </div>

        {/* Overall Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card className="border-2 border-red-200 bg-red-50">
            <CardContent className="p-4">
              <p className="text-sm text-red-600 font-semibold">إجمالي النواقص</p>
              <p className="text-3xl font-bold text-red-700">{totalStats.total}</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-yellow-200 bg-yellow-50">
            <CardContent className="p-4">
              <p className="text-sm text-yellow-600 font-semibold">قيد الانتظار</p>
              <p className="text-3xl font-bold text-yellow-700">{totalStats.pending}</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-orange-200 bg-orange-50">
            <CardContent className="p-4">
              <p className="text-sm text-orange-600 font-semibold">مطلوب</p>
              <p className="text-3xl font-bold text-orange-700">{totalStats.ordered}</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-green-200 bg-green-50">
            <CardContent className="p-4">
              <p className="text-sm text-green-600 font-semibold">مستلم</p>
              <p className="text-3xl font-bold text-green-700">{totalStats.received}</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-purple-200 bg-purple-50">
            <CardContent className="p-4">
              <p className="text-sm text-purple-600 font-semibold">القيمة الإجمالية</p>
              <p className="text-2xl font-bold text-purple-700">{totalStats.value.toFixed(2)} ج.م</p>
            </CardContent>
          </Card>
        </div>

        {/* Add Shortage Form */}
        {showForm && (
          <Card className="mb-6 border-2 border-blue-200">
            <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <CardTitle>{editingId ? "تعديل نقص" : "إضافة نقص جديد"}</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">الفئة</label>
                  <select 
                    value={formData.category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full border-2 border-blue-300 rounded-lg p-2 focus:outline-none focus:border-blue-600"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">المنتج من صفحة المنتجات</label>
                  <select 
                    value={formData.productId}
                    onChange={(e) => handleProductSelection(e.target.value)}
                    className="w-full border-2 border-blue-300 rounded-lg p-2 focus:outline-none focus:border-blue-600"
                  >
                    <option value="">اختر منتجاً من القائمة</option>
                    {products.length > 0 && (
                      <optgroup label={`منتجات صفحة المنتجات (${products.length})`}>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name || "منتج بدون اسم"} — المتاح: {p.availableQuantity ?? p.quantity ?? 0} {p.unit || ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {manualProducts.length > 0 && (
                      <optgroup label={`القائمة اليدوية (${manualProducts.length})`}>
                        {manualProducts.filter(p => p.category === formData.category).map(p => (
                          <option key={p.id} value={p.id}>{p.name} — مكتوب يدوياً</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {products.length === 0 && (
                    <p className="text-xs text-red-600 mt-1">لا توجد منتجات مسجلة حالياً. أضفها من صفحة المنتجات أو استخدم الاسم اليدوي بالأسفل.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">منتج يدوي سريع</label>
                  <Input 
                    value={manualProductName}
                    onChange={(e) => {
                      setManualProductName(e.target.value);
                      if (e.target.value.trim()) setFormData({...formData, productId: ""});
                    }}
                    placeholder="اكتب اسم صنف واحد"
                    className="border-2 border-blue-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">الحد الأدنى</label>
                  <Input 
                    type="number"
                    value={formData.minQuantity}
                    onChange={(e) => setFormData({...formData, minQuantity: e.target.value})}
                    placeholder="0"
                    className="border-2 border-blue-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">ملاحظات</label>
                  <Input 
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="ملاحظات إضافية"
                    className="border-2 border-blue-300"
                  />
                </div>
              </div>

              <div className="rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 p-4">
                <label className="block text-sm font-bold text-indigo-800 mb-2">قائمة منتجات يدوية للفئة المختارة</label>
                <textarea
                  value={manualProductsText}
                  onChange={(e) => setManualProductsText(e.target.value)}
                  placeholder="اكتب كل منتج في سطر مستقل، مثال:\nأوكسي\nكلور\nصابون سائل"
                  className="w-full min-h-24 rounded-lg border-2 border-indigo-300 bg-white p-3 text-sm focus:outline-none focus:border-indigo-600"
                  dir="rtl"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-indigo-700">يمكنك الفصل بين الأسماء بأسطر جديدة أو بفاصلة.</span>
                  <Button onClick={handleSaveManualProductList} type="button" className="bg-indigo-600 hover:bg-indigo-700">
                    حفظ قائمة المنتجات
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleAddShortage}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {editingId ? "تحديث" : "إضافة"}
                </Button>
                <Button 
                  onClick={resetForm}
                  variant="outline"
                  className="flex-1"
                >
                  إلغاء
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!showForm && (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button 
              onClick={() => { void refreshCloudData(); setShowForm(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg font-bold"
            >
              <Plus size={24} className="mr-2" />
              إضافة نقص جديد
            </Button>
            <Button
              onClick={() => setShowCategoryForm(current => !current)}
              variant="outline"
              className="border-2 border-indigo-500 bg-white py-6 text-lg font-bold text-indigo-700 hover:bg-indigo-50"
            >
              <Plus size={24} className="mr-2" />
              إضافة فئة
            </Button>
          </div>
        )}

        {showCategoryForm && (
          <Card className="mb-6 border-2 border-indigo-200">
            <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <CardTitle>إضافة فئة جديدة للنواقص</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddCustomCategory();
                    }
                  }}
                  placeholder="مثال: مبيدات حشرية"
                  className="border-2 border-indigo-300"
                  dir="rtl"
                />
                <Button onClick={handleAddCustomCategory} className="bg-indigo-600 hover:bg-indigo-700 sm:min-w-36">
                  حفظ الفئة
                </Button>
                <Button
                  onClick={() => { setShowCategoryForm(false); setNewCategoryName(""); }}
                  variant="outline"
                >
                  إلغاء
                </Button>
              </div>
              <p className="mt-3 text-sm text-indigo-700">ستظهر الفئة فورًا كبطاقة مثل الفئات الموجودة، وتستطيع اختيارها عند تسجيل أي نقص.</p>
            </CardContent>
          </Card>
        )}

        {/* Categories with Shortages */}
        <div className="space-y-4">
          {categories.map(category => {
            const categoryShortages = getCategoryShortages(category);
            const stats = getCategoryStats(category);
            const isExpanded = expandedCategories.has(category);

            return (
              <Card key={category} className="border-2 border-gray-300">
                <CardHeader 
                  onClick={() => toggleCategory(category)}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white cursor-pointer hover:from-blue-700 hover:to-indigo-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                      <CardTitle>{category}</CardTitle>
                      <span className="bg-white text-blue-600 px-3 py-1 rounded-full text-sm font-bold">
                        {stats.total}
                      </span>
                    </div>
                    <div className="flex gap-2 text-sm">
                      <span className="bg-yellow-400 text-gray-900 px-2 py-1 rounded">قيد الانتظار: {stats.pending}</span>
                      <span className="bg-orange-400 text-gray-900 px-2 py-1 rounded">مطلوب: {stats.ordered}</span>
                      <span className="bg-green-400 text-gray-900 px-2 py-1 rounded">مستلم: {stats.received}</span>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="p-6">
                    {categoryShortages.length > 0 ? (
                      <div className="space-y-3">
                        {categoryShortages.map(shortage => (
                          <ShortageCard key={shortage.id} shortage={shortage} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Package size={48} className="mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600 font-semibold">لا توجد نواقص في هذه الفئة</p>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {!isLoading && !loadError && shortages.length === 0 && (
          <Card className="border-2 border-dashed border-gray-300 mt-8">
            <CardContent className="py-12 text-center">
              <Package size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 font-semibold">لا توجد نواقص حالياً</p>
              <p className="text-gray-500 text-sm mt-2">جميع المنتجات بمستويات مخزون صحية</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
