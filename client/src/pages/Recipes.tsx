import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Edit2, Eye, Lock, Unlock, Camera, ImagePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { withPasswordProtection } from "@/components/withPasswordProtection";
import { toast } from "sonner";
import { calculateRecipeProfit, calculateRecipesProfitSummary } from "../lib/recipeProfit";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { MarketingShareButton } from "@/components/MarketingShareComposer";
import { normalizeLoyaltyPoints } from "@/lib/loyaltyPoints";
import { deleteCloudFormulation, listCloudFormulations, saveCloudFormulation, verifyFormulationPassword } from "@/lib/supabase/formulations";
import { removeCloudFormulationImage, uploadCloudFormulationImage } from "@/lib/supabase/formulationImages";
import { listRawMaterials } from "@/lib/supabase/operations";

interface RawMaterial {
  id: string;
  name: string;
  unit: string;
  totalWeight?: number;
  totalPrice?: number;
  pricePerKilo?: number;
  price?: number;
  wholesalePrice?: number;
}

interface RecipeIngredient {
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  cost: number;
}

interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  totalCost: number;
  productionQuantity: number;
  productionUnit: string;
  costPerUnit: number;
  salePrice: number;
  profitValue: number;
  profitPercent: number;
  notes: string;
  createdDate: string;
  isPasswordProtected?: boolean;
  password?: string;
  imageUrl?: string;
  imageStoragePath?: string;
  catalogImageUrl?: string;
  loyaltyPoints?: number;
  version: number;
}

// دالة مساعدة لحساب سعر الوحدة الصحيح (سعر الكيلو/الوحدة) من إجمالي السعر ÷ الوزن الكلي
const getMaterialUnitPrice = (material: RawMaterial): number => {
  if (!material) return 0;
  // إذا كان هناك pricePerKilo مسجل مسبقاً وكان صحيحاً
  if (material.pricePerKilo && material.pricePerKilo > 0) {
    return material.pricePerKilo;
  }
  // إذا كان هناك إجمالي سعر ووزن كلي (مثل 12000 و 60 كجم)
  if (material.totalPrice && material.totalWeight && material.totalWeight > 0) {
    return material.totalPrice / material.totalWeight;
  }
  // البدائل الأخرى
  return material.price || material.wholesalePrice || 0;
};

function RecipesContent() {
  const [, navigate] = useLocation();
  const { isSeller } = useStaffAccess();
  const toMarketingPost = (recipe: Recipe) => ({
    kind: "recipe" as const,
    title: recipe.name,
    price: Number(recipe.salePrice) || 0,
    unit: recipe.productionUnit,
    description: recipe.notes || "تركيبة مميزة جاهزة من أبو رغوة.",
    link: `${window.location.origin}/catalog`,
    imageUrl: recipe.imageUrl || recipe.catalogImageUrl,
  });
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIngredients, setSelectedIngredients] = useState<RecipeIngredient[]>([]);
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState("");
  const [ingredientQuantity, setIngredientQuantity] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState<string | null>(null);
  const [recipePasswordInput, setRecipePasswordInput] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState("");
  const [imagePathToRemove, setImagePathToRemove] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    productionQuantity: "",
    productionUnit: "قطعة",
    salePrice: "",
    notes: "",
    password: "",
    loyaltyPoints: "",
    imageUrl: "",
    imageStoragePath: ""
  });

  useEffect(() => () => { if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview); }, [pendingImagePreview]);

  useEffect(() => {
    void Promise.all([listCloudFormulations(), listRawMaterials()]).then(([formulas, rows]) => {
      setRecipes(formulas as Recipe[]);
      setMaterials(rows.map(row => ({ id: row.id, name: row.name, unit: row.unit, totalWeight: row.total_weight, totalPrice: row.total_price, pricePerKilo: row.price_per_kilo, wholesalePrice: row.wholesale_price })));
    }).catch(error => toast.error(error instanceof Error ? error.message : "تعذر تحميل التركيبات والخامات من Supabase."));
  }, []);

  const handleRecipeImageUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (!file.type.startsWith("image/")) throw new Error("اختر ملف صورة صالحًا.");
      setPendingImageFile(file);
      setPendingImagePreview(URL.createObjectURL(file));
      setImagePathToRemove("");
      toast.message("ستُرفع الصورة مباشرة إلى مخزن Supabase الخاص عند حفظ التركيبة.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر اختيار الصورة.");
    }
  };

  const handleAddIngredient = () => {
    if (!selectedMaterial || !ingredientQuantity) {
      toast.error("اختر خامة وأدخل الكمية");
      return;
    }

    const material = materials.find(m => m.id === selectedMaterial);
    if (!material) return;

    const unitPrice = getMaterialUnitPrice(material);
    const qty = parseFloat(ingredientQuantity) || 0;
    const cost = qty * unitPrice;

    const newIngredient: RecipeIngredient = {
      materialId: material.id,
      materialName: material.name,
      quantity: qty,
      unit: material.unit || 'كيلو',
      cost
    };

    setSelectedIngredients([...selectedIngredients, newIngredient]);
    setSelectedMaterial("");
    setIngredientQuantity("");
  };

  const handleSaveRecipe = async () => {
    const totalCost = selectedIngredients.reduce((sum, ing) => sum + ing.cost, 0);
    const productionQty = parseFloat(formData.productionQuantity) || 1;
    const salePrice = parseFloat(formData.salePrice) || 0;
    const profitMetrics = calculateRecipeProfit({ totalCost, productionQuantity: productionQty, salePrice });

    const current = editingId ? recipes.find(recipe => recipe.id === editingId) : undefined;
    const input = {
      ...(editingId ? { id: editingId, version: current?.version } : {}),
      name: formData.name || "تركيبة بدون اسم",
      ingredients: selectedIngredients,
      totalCost,
      productionQuantity: productionQty,
      productionUnit: formData.productionUnit,
      costPerUnit: profitMetrics.costPerUnit,
      salePrice,
      loyaltyPoints: normalizeLoyaltyPoints(formData.loyaltyPoints),
      profitValue: profitMetrics.profitValue,
      profitPercent: profitMetrics.profitPercent,
      notes: formData.notes,
      createdDate: new Date().toISOString(),
      isPasswordProtected: !!formData.password || Boolean(current?.isPasswordProtected),
      password: formData.password || undefined,
      imageUrl: formData.imageUrl || undefined,
      imageStoragePath: formData.imageStoragePath || undefined,
      catalogImageUrl: formData.imageUrl || undefined,
      version: current?.version ?? 1,
    };

    try {
      let saved = await saveCloudFormulation(input);
      setRecipes(previous => previous.some(recipe => recipe.id === saved.id) ? previous.map(recipe => recipe.id === saved.id ? saved as Recipe : recipe) : [saved as Recipe, ...previous]);
      setEditingId(saved.id);
      if (pendingImageFile) {
        setIsUploadingImage(true);
        try {
          const uploaded = await uploadCloudFormulationImage({ formulationId: saved.id, expectedVersion: saved.version, file: pendingImageFile, previousStoragePath: saved.imageStoragePath });
          saved = { ...saved, imageStoragePath: uploaded.publicUrl, imageUrl: uploaded.publicUrl, version: uploaded.version };
          setRecipes(previous => previous.map(recipe => recipe.id === saved.id ? saved as Recipe : recipe));
        } catch (imageError) {
          setRecipes(previous => previous.map(recipe => recipe.id === saved.id ? saved as Recipe : recipe));
          toast.error(`حُفظت بيانات التركيبة لكن لم يؤكد Supabase رفع الصورة وربطها. أعد المحاولة من النموذج: ${imageError instanceof Error ? imageError.message : "فشل رفع الصورة"}`);
          return;
        } finally { setIsUploadingImage(false); }
      } else if (imagePathToRemove) {
        try { await removeCloudFormulationImage(imagePathToRemove); } catch (cleanupError) { console.warn("Old formulation image cleanup failed.", cleanupError); }
      }
      toast.success(editingId ? "تم تحديث التركيبة ومكوناتها وصورتها في Supabase" : "تم حفظ التركيبة ومكوناتها وصورتها في Supabase");
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? `لم يتم حفظ التركيبة: ${error.message}` : "لم يتم حفظ التركيبة.");
    }
  };

  const resetForm = () => {
    setPendingImageFile(null);
    setPendingImagePreview("");
    setImagePathToRemove("");
    setFormData({
      name: "",
      productionQuantity: "",
      productionUnit: "قطعة",
      salePrice: "",
      notes: "",
      password: "",
      loyaltyPoints: "",
      imageUrl: "",
      imageStoragePath: ""
    });
    setSelectedIngredients([]);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (recipe: Recipe) => {
    setPendingImageFile(null);
    setPendingImagePreview("");
    setImagePathToRemove("");
    setFormData({
      name: recipe.name,
      productionQuantity: recipe.productionQuantity.toString(),
      productionUnit: recipe.productionUnit,
      salePrice: recipe.salePrice.toString(),
      notes: recipe.notes || "",
      password: "",
      loyaltyPoints: recipe.loyaltyPoints?.toString() || "",
      imageUrl: recipe.imageUrl || recipe.catalogImageUrl || "",
      imageStoragePath: recipe.imageStoragePath || ""
    });
    setSelectedIngredients(recipe.ingredients || []);
    setEditingId(recipe.id);
    setShowForm(true);
    // التمرير بسلاسة إلى أعلى الصفحة حيث يوجد نموذج التعديل
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذه التركيبة؟")) {
      const recipe = recipes.find(item => item.id === id);
      if (!recipe) return;
      try {
        await deleteCloudFormulation(id, recipe.version);
        setRecipes(previous => previous.filter(item => item.id !== id));
        toast.success("تم حذف التركيبة من Supabase");
      } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف التركيبة."); }
    }
  };

  const handleViewRecipeClick = (recipe: Recipe) => {
    if (recipe.isPasswordProtected && recipe.password) {
      setShowPasswordModal(recipe.id);
      setRecipePasswordInput("");
    } else {
      setViewingRecipe(recipe);
    }
  };

  const handleVerifyPassword = async (recipe: Recipe) => {
    if (await verifyFormulationPassword(recipe.password, recipePasswordInput)) {
      setShowPasswordModal(null);
      setRecipePasswordInput("");
      setViewingRecipe(recipe);
      toast.success("✅ تم فتح التركيبة بنجاح");
    } else {
      toast.error("كلمة المرور غير صحيحة");
    }
  };

  if (isSeller) {
    return (
      <div className="min-h-screen bg-slate-50 p-4" dir="rtl">
        <main className="mx-auto max-w-5xl space-y-5">
          <header className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-black text-slate-900">التركيبات وأسعار البيع</h1>
                <p className="mt-1 text-sm text-slate-600">تعرف على اسم التركيبة وسعر بيعها للعميل فقط.</p>
              </div>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>الرئيسية</Button>
            </div>
          </header>
          {recipes.length === 0 ? (
            <Card className="border-0 shadow-sm"><CardContent className="py-16 text-center text-slate-500">لا توجد تركيبات مسجلة حاليًا.</CardContent></Card>
          ) : (
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recipes.map((recipe) => (
                <Card key={recipe.id} className="border-0 shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="flex items-center gap-3 text-lg text-slate-900">{recipe.imageUrl || recipe.catalogImageUrl ? <img src={recipe.imageUrl || recipe.catalogImageUrl} alt={recipe.name} className="h-12 w-12 rounded-xl border object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><ImagePlus className="h-5 w-5" /></div>}<span>{recipe.name}</span></CardTitle></CardHeader>
                  <CardContent className="space-y-2"><div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs text-slate-500">سعر البيع</p><p className="mt-1 text-xl font-black text-emerald-700">{recipe.salePrice?.toFixed(2)} ج.م</p><p className="mt-2 text-xs text-slate-500">الوحدة: {recipe.productionUnit}</p></div><MarketingShareButton post={toMarketingPost(recipe)} compact /></CardContent>
                </Card>
              ))}
            </section>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh w-full max-w-full overflow-x-hidden bg-gray-50 p-3 sm:p-4" dir="rtl">
      <div className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden">
        <div className="mb-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="break-words text-2xl font-bold text-gray-800 sm:text-3xl">🧪 إدارة التركيبات</h1>
            <p className="mt-1 break-words text-sm text-gray-600">حساب دقيق لتكلفة الكيلو من الخامات (مثل 12000 ÷ 60 = 200 ج.م)</p>
          </div>
          <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto">
            <Button
              onClick={() => {
                setShowForm(!showForm);
                if (showForm) resetForm();
              }}
              className="min-w-0 flex-1 whitespace-normal bg-blue-600 text-white hover:bg-blue-700 sm:flex-none"
            >
              <Plus className="w-4 h-4" />
              تركيبة جديدة
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="min-w-0 flex-1 whitespace-normal sm:flex-none"
            >
              <ArrowLeft className="w-4 h-4" />
              العودة
            </Button>
          </div>
        </div>

        {/* Modal عرض التركيبة الأصلي بالملاحظات وتفاصيل الخامات */}
        {viewingRecipe && (
          <div className="fixed inset-0 z-50 flex max-w-full items-center justify-center overflow-x-hidden bg-black/60 p-2 sm:p-4">
            <div className="w-full min-w-0 max-w-lg space-y-4 overflow-x-hidden overflow-y-auto rounded-xl bg-white p-4 shadow-2xl sm:p-6 max-h-[90vh]">
              <div className="flex min-w-0 items-center justify-between gap-2 border-b pb-3">
                <h2 className="flex min-w-0 items-center gap-2 break-words text-lg font-bold text-gray-900 sm:text-xl">
                  {viewingRecipe.imageUrl || viewingRecipe.catalogImageUrl ? <img src={viewingRecipe.imageUrl || viewingRecipe.catalogImageUrl} alt={viewingRecipe.name} className="h-12 w-12 rounded-xl border object-cover" /> : <span>🧪</span>} {viewingRecipe.name}
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setViewingRecipe(null)}>
                  ✕
                </Button>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-3 overflow-x-hidden rounded-lg bg-blue-50 p-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-gray-600">كمية الإنتاج: </span>
                  <span className="font-bold">{viewingRecipe.productionQuantity} {viewingRecipe.productionUnit}</span>
                </div>
                <div>
                  <span className="text-gray-600">التكلفة الإجمالية: </span>
                  <span className="font-bold text-orange-600">{viewingRecipe.totalCost.toFixed(2)} ج.م</span>
                </div>
                <div>
                  <span className="text-gray-600">تكلفة الوحدة: </span>
                  <span className="font-bold">{viewingRecipe.costPerUnit.toFixed(2)} ج.م</span>
                </div>
                <div>
                  <span className="text-gray-600">سعر البيع: </span>
                  <span className="font-bold text-green-600">{viewingRecipe.salePrice.toFixed(2)} ج.م</span>
                </div>
                <div>
                  <span className="text-gray-600">صافي الربح للوحدة: </span>
                  <span className="font-bold text-emerald-700">{calculateRecipeProfit(viewingRecipe).profitPerUnit.toFixed(2)} ج.م</span>
                </div>
                <div>
                  <span className="text-gray-600">إجمالي ربح الدفعة: </span>
                  <span className="font-bold text-emerald-700">{calculateRecipeProfit(viewingRecipe).profitValue.toFixed(2)} ج.م</span>
                </div>
                <div>
                  <span className="text-gray-600">هامش الربح من البيع: </span>
                  <span className="font-bold text-emerald-700">{calculateRecipeProfit(viewingRecipe).profitPercent.toFixed(2)}%</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold mb-2 text-sm text-gray-700">مكونات الخامات وتكلفتها الفعلية (حسب سعر الكيلو):</h4>
                <div className="space-y-2">
                  {viewingRecipe.ingredients.map((ing, idx) => {
                    const mat = materials.find(m => m.id === ing.materialId || m.name === ing.materialName);
                    const unitPrice = mat ? getMaterialUnitPrice(mat) : (ing.cost / (ing.quantity || 1));
                    return (
                      <div key={idx} className="flex justify-between items-center bg-gray-50 p-2.5 rounded border text-xs">
                        <div>
                          <span className="font-bold text-gray-800">{ing.materialName}</span>
                          <span className="mr-2 break-words text-gray-500">({ing.quantity} {ing.unit} × {unitPrice.toFixed(2)} ج.م)</span>
                        </div>
                        <span className="max-w-full break-words font-bold tabular-nums text-orange-600">{ing.cost.toFixed(2)} ج.م</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {viewingRecipe.notes && (
                <div className="bg-yellow-50 p-3 rounded border border-yellow-200 text-xs text-yellow-800">
                  <span className="font-bold block mb-1">ملاحظات التركيبة:</span>
                  {viewingRecipe.notes}
                </div>
              )}

              <Button onClick={() => setViewingRecipe(null)} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                إغلاق
              </Button>
            </div>
          </div>
        )}

        {/* Modal إدخال كلمة المرور للتركيبة المقفلة */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center">
              <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                🔒
              </div>
              <h3 className="text-lg font-bold text-gray-800">هذه التركيبة محمية بكلمة مرور</h3>
              <p className="text-xs text-gray-500">أدخل كلمة المرور الخاصة بالمدير المعتمد لعرض التركيبة</p>
              <Input
                type="password"
                value={recipePasswordInput}
                onChange={(e) => setRecipePasswordInput(e.target.value)}
                placeholder="أدخل كلمة المرور..."
                className="text-center"
                autoFocus
              />
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => {
                    const recipe = recipes.find(r => r.id === showPasswordModal);
                    if (recipe) void handleVerifyPassword(recipe);
                  }}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                >
                  فتح
                </Button>
                <Button
                  onClick={() => setShowPasswordModal(null)}
                  variant="outline"
                  className="flex-1 text-xs"
                >
                  إلغاء
                </Button>
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <Card className="mb-6 border-2 border-blue-500">
            <CardHeader className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white">
              <CardTitle>{editingId ? "تعديل التركيبة" : "تركيبة جديدة"}</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">اسم التركيبة</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: صابون سائل مميز"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">كمية الإنتاج</label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.productionQuantity}
                      onChange={(e) => setFormData({ ...formData, productionQuantity: e.target.value })}
                      placeholder="الكمية"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">وحدة الإنتاج</label>
                    <select
                      value={formData.productionUnit}
                      onChange={(e) => setFormData({ ...formData, productionUnit: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option>قطعة</option>
                      <option>كيلو</option>
                      <option>لتر</option>
                      <option>دسته</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">نقاط الولاء لكل وحدة (اختياري)</label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={formData.loyaltyPoints}
                      onChange={(e) => setFormData({ ...formData, loyaltyPoints: e.target.value })}
                      placeholder="اتركها فارغة أو اكتب 0 بدون نقاط"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">تُضاف تلقائيًا عند بيع وحدة من التركيبة، وإدخالها اختياري.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">سعر البيع (للوحدة)</label>
                    <Input
                      type="number"
                      value={formData.salePrice}
                      onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                      placeholder="سعر البيع"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">ملاحظات التركيبة (تظهر عند العرض)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="أضف معلومات وملاحظات عن التركيبة"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg h-24"
                  />
                </div>

                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    {(pendingImagePreview || formData.imageUrl) ? <img src={pendingImagePreview || formData.imageUrl} alt="معاينة التركيبة" className="h-24 w-24 rounded-2xl border-2 border-white bg-white object-cover shadow" /> : <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-violet-300 bg-white text-violet-400"><ImagePlus className="h-8 w-8" /></div>}
                    <div className="flex-1"><p className="font-black text-violet-950">صورة التركيبة أو الأيقونة</p><p className="mt-1 text-xs text-violet-700">تُضغط الصورة إلى أقل من 300KB، ثم تُرفع إلى مخزن formulas العام ويُحفظ رابطها مباشرةً في سجل التركيبة.</p><div className="mt-3 flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700"><ImagePlus className="h-4 w-4" /> اختيار من المعرض<input type="file" accept="image/*" className="hidden" onChange={(event) => { void handleRecipeImageUpload(event.target.files?.[0]); event.target.value = ""; }} /></label><label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100"><Camera className="h-4 w-4" /> تصوير مباشر<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { void handleRecipeImageUpload(event.target.files?.[0]); event.target.value = ""; }} /></label>{(formData.imageUrl || pendingImagePreview) && <Button type="button" size="sm" variant="outline" onClick={() => { if (formData.imageStoragePath) setImagePathToRemove(formData.imageStoragePath); setPendingImageFile(null); setPendingImagePreview(""); setFormData(current => ({ ...current, imageUrl: "", imageStoragePath: "" })); }}>إزالة الصورة</Button>}</div>{isUploadingImage && <p className="mt-2 text-xs font-bold text-violet-700">جاري رفع الصورة إلى Supabase Storage وربطها بالتركيبة...</p>}</div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-bold mb-4">إضافة الخامات وسحب سعر الكيلو تلقائياً</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">اختر خامة</label>
                      <select
                        value={selectedMaterial}
                        onChange={(e) => setSelectedMaterial(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                      >
                        <option value="">-- اختر خامة (سعر الكيلو) --</option>
                        {materials.map(material => {
                          const unitPrice = getMaterialUnitPrice(material);
                          return (
                            <option key={material.id} value={material.id}>
                              {material.name} ({unitPrice.toFixed(2)} ج.م / {material.unit || 'كيلو'})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">الكمية المستخدمة</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={ingredientQuantity}
                        onChange={(e) => setIngredientQuantity(e.target.value)}
                        placeholder="الكمية"
                      />
                    </div>

                    <div className="flex items-end">
                      <Button
                        onClick={handleAddIngredient}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        إضافة للخامات
                      </Button>
                    </div>
                  </div>

                  {selectedIngredients.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">الخامات المضافة وتكلفتها الحسابية:</h4>
                      <div className="space-y-2">
                        {selectedIngredients.map((ing, index) => {
                          const mat = materials.find(m => m.id === ing.materialId);
                          const unitPrice = mat ? getMaterialUnitPrice(mat) : (ing.cost / (ing.quantity || 1));
                          return (
                            <div key={index} className="flex justify-between items-center bg-gray-50 border p-2.5 rounded-lg text-sm">
                              <div>
                                <span className="font-bold text-gray-800">{ing.materialName}</span>
                                <span className="text-gray-600 mr-2">({ing.quantity} {ing.unit} × {unitPrice.toFixed(2)} ج.م)</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-orange-600">{ing.cost.toFixed(2)} ج.م</span>
                                <Button
                                  onClick={() => setSelectedIngredients(selectedIngredients.filter((_, i) => i !== index))}
                                  size="sm"
                                  variant="destructive"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <label className="block text-sm font-medium mb-2">قفل التركيبة بكلمة مرور (اختياري)</label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="أدخل كلمة مرور لحماية التركيبة عن غير المدير"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button onClick={handleSaveRecipe} className="bg-green-600 hover:bg-green-700 text-white">
                    حفظ التركيبة
                  </Button>
                  <Button onClick={resetForm} variant="outline">
                    إلغاء
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {recipes.length > 0 && (() => {
          const summary = calculateRecipesProfitSummary(recipes);
          return (
            <Card className="mb-6 border-2 border-emerald-200 bg-gradient-to-l from-emerald-50 to-white shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-black text-emerald-900">📈 هامش ربح جميع التركيبات</p>
                    <p className="mt-1 text-xs text-emerald-700">محسوب موزونًا من صافي الربح ÷ إجمالي قيمة البيع لكل التركيبات.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center text-sm">
                    <div><p className="text-xs text-gray-500">إجمالي التكلفة</p><p className="font-black text-orange-700">{summary.totalCost.toFixed(2)} ج.م</p></div>
                    <div><p className="text-xs text-gray-500">إجمالي الربح</p><p className="font-black text-emerald-700">{summary.totalProfit.toFixed(2)} ج.م</p></div>
                    <div><p className="text-xs text-gray-500">هامش الربح</p><p className="font-black text-emerald-700">{summary.profitPercent.toFixed(2)}%</p></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Recipes Grid */}
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 sm:gap-6">
          {recipes.map((recipe) => (
            <Card key={recipe.id} className="relative min-w-0 max-w-full overflow-hidden border-0 bg-white shadow-sm">
              {recipe.isPasswordProtected && (
                <span className="absolute top-3 left-3 bg-orange-100 text-orange-700 p-1.5 rounded-full" title="محمية بكلمة مرور">
                  <Lock className="w-4 h-4" />
                </span>
              )}
              <CardHeader className="pb-3 border-b">
                <CardTitle className="flex justify-between items-center text-lg gap-3">
                  <span className="flex min-w-0 items-center gap-3">{recipe.imageUrl || recipe.catalogImageUrl ? <img src={recipe.imageUrl || recipe.catalogImageUrl} alt={recipe.name} className="h-12 w-12 shrink-0 rounded-xl border object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><ImagePlus className="h-5 w-5" /></div>}<span className="truncate">{recipe.name}</span></span>
                  <span className="max-w-[42%] shrink-0 break-words text-left text-xs tabular-nums bg-orange-100 text-orange-800 px-2 py-1 rounded sm:text-sm">
                    {recipe.totalCost?.toFixed(2)} ج.م
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="min-w-0 break-words text-sm text-gray-600 space-y-1">
                  <p>الإنتاج: {recipe.productionQuantity} {recipe.productionUnit}</p>
                  <p>تكلفة الوحدة: {recipe.costPerUnit?.toFixed(2)} ج.م</p>
                  <p className="break-words tabular-nums">سعر البيع: {recipe.salePrice?.toFixed(2)} ج.م</p>
                  <p>نقاط الولاء: {normalizeLoyaltyPoints(recipe.loyaltyPoints)}</p>
                  <p className="font-bold text-green-600">هامش الربح: {calculateRecipeProfit(recipe).profitPercent.toFixed(2)}%</p>
                </div>
                <div className="flex flex-wrap justify-between gap-1 border-t pt-3">
                  <Button onClick={() => handleViewRecipeClick(recipe)} size="sm" variant="outline" className="text-green-600 flex-1">
                    <Eye className="w-3.5 h-3.5 ml-1" /> عرض
                  </Button>
                  <Button onClick={() => handleEdit(recipe)} size="sm" variant="outline" className="text-blue-600 flex-1">
                    <Edit2 className="w-3.5 h-3.5 ml-1" /> تعديل
                  </Button>
                  <MarketingShareButton post={toMarketingPost(recipe)} compact />
                  <Button onClick={() => handleDelete(recipe.id)} size="sm" variant="outline" className="text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {recipes.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              لا توجد تركيبات مسجلة حتى الآن. اضغط على "تركيبة جديدة" للبدء.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default withPasswordProtection(RecipesContent, 'compositions', 'قائمة التركيبات');
