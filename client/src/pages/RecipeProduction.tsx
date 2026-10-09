import { browserState } from "@/lib/browserState";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Check, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { createProductionRun, listProductionRuns } from "@/lib/supabase/operations";

interface Recipe {
  id: string;
  name: string;
  ingredients: Array<{
    rawId: string;
    name: string;
    quantity: number;
    unit: string;
  }>;
  totalCost: number;
  costPerUnit: number;
  salePrice: number;
}

interface Production {
  id: string;
  recipeId: string;
  recipeName: string;
  quantity: number;
  date: string;
  status: "pending" | "completed";
}

export default function RecipeProduction() {
  const [, navigate] = useLocation();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [productionQty, setProductionQty] = useState(1);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadRecipes();
    loadProductions().catch(() => setProductions([]));
  }, []);

  const loadRecipes = () => {
    const recipesData = JSON.parse(browserState.get("abu_raghwa_recipes") || "[]");
    setRecipes(recipesData);
  };

  const loadProductions = async () => {
    const rows = await listProductionRuns();
    setProductions(rows.map(row => ({ id: row.id, recipeId: row.recipe_id || "", recipeName: row.recipe_name, quantity: row.quantity, date: row.produced_at, status: row.status === "completed" ? "completed" : "pending" })));
  };

  const handleProduction = async () => {
    if (!selectedRecipe || productionQty <= 0) {
      alert("يرجى اختيار تركيبة وإدخال كمية صحيحة");
      return;
    }

    // تحديث المخزون
    const materials = JSON.parse(browserState.get("abu_raghwa_raw_materials") || "[]");
    
    selectedRecipe.ingredients.forEach((ingredient) => {
      const material = materials.find((m: any) => m.id === ingredient.rawId);
      if (material) {
        material.quantity -= ingredient.quantity * productionQty;
      }
    });

    browserState.set("abu_raghwa_raw_materials", JSON.stringify(materials));

    // إضافة منتج جديد أو تحديث الكمية
    const products = JSON.parse(browserState.get("abu_raghwa_products") || "[]");
    const existingProduct = products.find((p: any) => p.name === selectedRecipe.name);

    if (existingProduct) {
      existingProduct.quantity += productionQty;
    } else {
      products.push({
        id: `prod_${Date.now()}`,
        name: selectedRecipe.name,
        category: "تركيبات",
        quantity: productionQty,
        cost: selectedRecipe.costPerUnit,
        price: selectedRecipe.salePrice,
        createdDate: new Date().toLocaleDateString("ar-EG")
      });
    }

    browserState.set("abu_raghwa_products", JSON.stringify(products));

    // تسجيل الإنتاج
    const newProduction: Production = {
      id: `prod_${Date.now()}`,
      recipeId: selectedRecipe.id,
      recipeName: selectedRecipe.name,
      quantity: productionQty,
      date: new Date().toISOString(),
      status: "completed"
    };

    const updatedProductions = [...productions, newProduction];
    const saved = await createProductionRun({ recipe_id: selectedRecipe.id, recipe_name: selectedRecipe.name, quantity: productionQty, status: "completed", produced_at: new Date().toISOString(), notes: "" });
    setProductions(current => [...current, { id: saved.id, recipeId: saved.recipe_id || "", recipeName: saved.recipe_name, quantity: saved.quantity, date: saved.produced_at, status: "completed" }]);

    alert("تم الإنتاج بنجاح! تم تحديث المخزون تلقائياً");
    setSelectedRecipe(null);
    setProductionQty(1);
    setShowForm(false);
  };

  const canProduce = (recipe: Recipe): boolean => {
    const materials = JSON.parse(browserState.get("abu_raghwa_raw_materials") || "[]");
    
    return recipe.ingredients.every((ingredient) => {
      const material = materials.find((m: any) => m.id === ingredient.rawId);
      return material && material.quantity >= ingredient.quantity * productionQty;
    });
  };

  const getMissingMaterials = (recipe: Recipe): Array<{name: string; needed: number; available: number; unit: string}> => {
    const materials = JSON.parse(browserState.get("abu_raghwa_raw_materials") || "[]");
    const missing: Array<{name: string; needed: number; available: number; unit: string}> = [];

    recipe.ingredients.forEach((ingredient) => {
      const material = materials.find((m: any) => m.id === ingredient.rawId);
      if (!material || material.quantity < ingredient.quantity * productionQty) {
        missing.push({
          name: ingredient.name,
          needed: ingredient.quantity * productionQty,
          available: material?.quantity || 0,
          unit: ingredient.unit
        });
      }
    });

    return missing;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">إنتاج التركيبات</h1>
            <p className="text-gray-600 mt-1">إنتاج التركيبات وتحديث المخزون تلقائياً</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            العودة
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Production Form */}
        {showForm && selectedRecipe && (
          <Card className="mb-8 border-0 shadow-sm">
            <CardHeader>
              <CardTitle>إنتاج: {selectedRecipe.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium mb-2">الكمية المراد إنتاجها</label>
                  <Input
                    type="number"
                    min="1"
                    value={productionQty}
                    onChange={(e) => setProductionQty(parseInt(e.target.value) || 1)}
                    placeholder="أدخل الكمية"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">إجمالي التكلفة</label>
                  <div className="bg-gray-100 p-3 rounded-md">
                    <p className="text-lg font-bold text-orange-600">
                      {(selectedRecipe.costPerUnit * productionQty).toFixed(2)} ج.م
                    </p>
                  </div>
                </div>
              </div>

              {/* Ingredients Check */}
              <div className="mt-6">
                <h3 className="font-semibold mb-3">المكونات المطلوبة:</h3>
                <div className="space-y-2">
                  {selectedRecipe.ingredients.map((ingredient, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <span>{ingredient.name}</span>
                      <span className="font-semibold">
                        {ingredient.quantity * productionQty} {ingredient.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Missing Materials Warning */}
              {!canProduce(selectedRecipe) && (
                <div className="mt-6 bg-red-50 border border-red-200 p-4 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-red-800 mb-2">مواد ناقصة:</h4>
                      <ul className="text-sm text-red-700 space-y-1">
                        {getMissingMaterials(selectedRecipe).map((missingItem, idx) => (
                          <li key={idx}>
                            {missingItem.name}: متوفر {missingItem.available} {missingItem.unit}، مطلوب{" "}
                            {missingItem.needed} {missingItem.unit}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-4 mt-6">
                <Button
                  onClick={handleProduction}
                  disabled={!canProduce(selectedRecipe)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  تأكيد الإنتاج
                </Button>
                <Button
                  onClick={() => {
                    setShowForm(false);
                    setSelectedRecipe(null);
                    setProductionQty(1);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  إلغاء
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recipes List */}
        {!showForm && (
          <>
            <h2 className="text-2xl font-bold mb-6">التركيبات المتاحة</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recipes.length > 0 ? (
                recipes.map((recipe) => (
                  <Card
                    key={recipe.id}
                    className="border-0 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <CardContent className="pt-6">
                      <h3 className="font-semibold text-lg mb-2">{recipe.name}</h3>
                      <p className="text-sm text-gray-600 mb-3">
                        {recipe.ingredients.length} مكون
                      </p>
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">التكلفة:</span>
                          <span className="font-semibold">{recipe.costPerUnit.toFixed(2)} ج.م</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">السعر:</span>
                          <span className="font-semibold text-green-600">
                            {recipe.salePrice.toFixed(2)} ج.م
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">الربح:</span>
                          <span className="font-semibold text-blue-600">
                            {(recipe.salePrice - recipe.costPerUnit).toFixed(2)} ج.م
                          </span>
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          setSelectedRecipe(recipe);
                          setShowForm(true);
                        }}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        إنتاج
                      </Button>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="border-0 shadow-sm col-span-full">
                  <CardContent className="pt-6 text-center text-gray-500">
                    لا توجد تركيبات
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}

        {/* Production History */}
        {productions.length > 0 && !showForm && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold mb-6">سجل الإنتاج</h2>
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-right font-medium">التركيبة</th>
                        <th className="px-4 py-3 text-right font-medium">الكمية</th>
                        <th className="px-4 py-3 text-right font-medium">التاريخ</th>
                        <th className="px-4 py-3 text-right font-medium">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productions
                        .slice()
                        .reverse()
                        .map((prod) => (
                          <tr key={prod.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3">{prod.recipeName}</td>
                            <td className="px-4 py-3 font-semibold">{prod.quantity}</td>
                            <td className="px-4 py-3">
                              {new Date(prod.date).toLocaleDateString("ar-EG")}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                                ✓ مكتمل
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
