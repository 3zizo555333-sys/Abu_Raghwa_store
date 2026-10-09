import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Share2, Lock, Unlock, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

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
  profitValue: number;
  profitPercent: number;
  locked?: boolean;
  passcode?: string;
}

export default function RecipesDisplay() {
  const [, navigate] = useLocation();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showPasscodeInput, setShowPasscodeInput] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [unlockedRecipes, setUnlockedRecipes] = useState<string[]>([]);

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = () => {
    const recipesData = JSON.parse(localStorage.getItem("abu_raghwa_recipes") || "[]");
    setRecipes(recipesData);
  };

  const isRecipeUnlocked = (recipeId: string) => {
    return unlockedRecipes.includes(recipeId);
  };

  const handleUnlock = (recipe: Recipe) => {
    if (!recipe.locked) {
      setSelectedRecipe(recipe);
      return;
    }

    if (passcodeInput === recipe.passcode) {
      setUnlockedRecipes([...unlockedRecipes, recipe.id]);
      setSelectedRecipe(recipe);
      setShowPasscodeInput(false);
      setPasscodeInput("");
    } else {
      alert("كلمة المرور غير صحيحة");
      setPasscodeInput("");
    }
  };

  const toggleRecipeLock = (recipe: Recipe) => {
    const updatedRecipes = recipes.map((r) => {
      if (r.id === recipe.id) {
        return {
          ...r,
          locked: !r.locked,
          passcode: !r.locked ? "1234" : undefined
        };
      }
      return r;
    });

    setRecipes(updatedRecipes);
    localStorage.setItem("abu_raghwa_recipes", JSON.stringify(updatedRecipes));

    if (selectedRecipe?.id === recipe.id) {
      setSelectedRecipe(updatedRecipes.find((r) => r.id === recipe.id) || null);
    }
  };

  const shareRecipe = (recipe: Recipe) => {
    const message = `
*وصفة: ${recipe.name}*

*المكونات:*
${recipe.ingredients.map((ing) => `• ${ing.name}: ${ing.quantity} ${ing.unit}`).join("\n")}

*التكاليف:*
إجمالي التكلفة: ${recipe.totalCost.toFixed(2)} ج.م
التكلفة للوحدة: ${recipe.costPerUnit.toFixed(2)} ج.م

*الأسعار والأرباح:*
سعر البيع: ${recipe.salePrice.toFixed(2)} ج.م
الربح: ${recipe.profitValue.toFixed(2)} ج.م (${recipe.profitPercent.toFixed(2)}%)

من تطبيق أبو رغوة 🍵
    `;

    const whatsappNumber = "01069035599";
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${whatsappNumber}?text=${encodedMessage}`, "_blank");
  };

  const copyToClipboard = (recipe: Recipe) => {
    const text = `
وصفة: ${recipe.name}

المكونات:
${recipe.ingredients.map((ing) => `${ing.name}: ${ing.quantity} ${ing.unit}`).join("\n")}

التكاليف:
إجمالي التكلفة: ${recipe.totalCost.toFixed(2)} ج.م
التكلفة للوحدة: ${recipe.costPerUnit.toFixed(2)} ج.م

الأسعار والأرباح:
سعر البيع: ${recipe.salePrice.toFixed(2)} ج.م
الربح: ${recipe.profitValue.toFixed(2)} ج.م (${recipe.profitPercent.toFixed(2)}%)
    `;

    navigator.clipboard.writeText(text);
    alert("تم نسخ الوصفة إلى الحافظة");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">عرض التركيبات</h1>
            <p className="text-gray-600 mt-1">التركيبات مع المشاركة والحماية</p>
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
        {!selectedRecipe ? (
          <div>
            <h2 className="text-2xl font-bold mb-6">التركيبات المتاحة</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recipes.length > 0 ? (
                recipes.map((recipe) => (
                  <Card key={recipe.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold text-lg">{recipe.name}</h3>
                        {recipe.locked ? (
                          <Lock className="w-5 h-5 text-red-600" />
                        ) : (
                          <Unlock className="w-5 h-5 text-green-600" />
                        )}
                      </div>

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
                            {recipe.profitValue.toFixed(2)} ج.م
                          </span>
                        </div>
                      </div>

                      <Button
                        onClick={() => {
                          if (recipe.locked && !isRecipeUnlocked(recipe.id)) {
                            setShowPasscodeInput(true);
                            setSelectedRecipe(recipe);
                          } else {
                            setSelectedRecipe(recipe);
                          }
                        }}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center gap-2"
                      >
                        {recipe.locked && !isRecipeUnlocked(recipe.id) ? (
                          <>
                            <Lock className="w-4 h-4" />
                            فتح الوصفة
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4" />
                            عرض الوصفة
                          </>
                        )}
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
          </div>
        ) : (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{selectedRecipe.name}</CardTitle>
                <Button
                  onClick={() => setSelectedRecipe(null)}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  العودة
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Passcode Input */}
              {showPasscodeInput && selectedRecipe.locked && !isRecipeUnlocked(selectedRecipe.id) && (
                <div className="mb-6 bg-orange-50 p-4 rounded-lg">
                  <label className="block text-sm font-medium mb-2">أدخل كلمة المرور</label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="كلمة المرور"
                      value={passcodeInput}
                      onChange={(e) => setPasscodeInput(e.target.value)}
                    />
                    <Button
                      onClick={() => handleUnlock(selectedRecipe)}
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      فتح
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recipe Details */}
                <div className="lg:col-span-2">
                  {/* Ingredients */}
                  <div className="mb-8">
                    <h3 className="text-xl font-bold mb-4">المكونات</h3>
                    <div className="space-y-3">
                      {selectedRecipe.ingredients.map((ingredient, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                          <span className="font-medium">{ingredient.name}</span>
                          <span className="text-gray-600">
                            {ingredient.quantity} {ingredient.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Instructions Placeholder */}
                  <div className="mb-8">
                    <h3 className="text-xl font-bold mb-4">طريقة التحضير</h3>
                    <div className="bg-gray-50 p-4 rounded text-gray-600">
                      <p>أضف تعليمات التحضير هنا...</p>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div>
                  <Card className="border-0 shadow-sm bg-blue-50">
                    <CardHeader>
                      <CardTitle className="text-lg">ملخص التكاليف</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm text-gray-600">إجمالي التكلفة</p>
                        <p className="text-2xl font-bold text-orange-600">
                          {selectedRecipe.totalCost.toFixed(2)} ج.م
                        </p>
                      </div>

                      <div className="border-t pt-4">
                        <p className="text-sm text-gray-600">التكلفة للوحدة</p>
                        <p className="text-2xl font-bold text-orange-600">
                          {selectedRecipe.costPerUnit.toFixed(2)} ج.م
                        </p>
                      </div>

                      <div className="border-t pt-4">
                        <p className="text-sm text-gray-600">سعر البيع</p>
                        <p className="text-2xl font-bold text-green-600">
                          {selectedRecipe.salePrice.toFixed(2)} ج.م
                        </p>
                      </div>

                      <div className="border-t pt-4 bg-green-50 p-3 rounded">
                        <p className="text-sm text-gray-600">الربح</p>
                        <p className="text-2xl font-bold text-green-600">
                          {selectedRecipe.profitValue.toFixed(2)} ج.م
                        </p>
                        <p className="text-sm text-green-700 mt-1">
                          {selectedRecipe.profitPercent.toFixed(2)}%
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Actions */}
                  <div className="mt-6 space-y-3">
                    <Button
                      onClick={() => shareRecipe(selectedRecipe)}
                      className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                    >
                      <Share2 className="w-4 h-4" />
                      مشاركة WhatsApp
                    </Button>

                    <Button
                      onClick={() => copyToClipboard(selectedRecipe)}
                      variant="outline"
                      className="w-full"
                    >
                      نسخ الوصفة
                    </Button>

                    <Button
                      onClick={() => toggleRecipeLock(selectedRecipe)}
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2"
                    >
                      {selectedRecipe.locked ? (
                        <>
                          <Unlock className="w-4 h-4" />
                          إلغاء القفل
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          قفل الوصفة
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
