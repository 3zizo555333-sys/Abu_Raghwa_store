import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Search, Barcode, Mic, Image, Camera } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AdvancedBarcodeScanner } from "@/components/AdvancedBarcodeScanner";
import { useCloudState } from "@/lib/cloudSync";

interface SearchResult {
  type: "product" | "sale" | "material" | "recipe";
  id: string;
  name: string;
  details: string;
  price?: number;
  quantity?: number;
}

export default function AdvancedSearch() {
  const [, navigate] = useLocation();
  const initialSearchParams = new URLSearchParams(window.location.search);
  const [searchQuery, setSearchQuery] = useState(() => initialSearchParams.get("query") || "");
  const [searchType, setSearchType] = useState(() => initialSearchParams.get("type") || "all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cloudProducts] = useCloudState<any[]>("abu_raghwa_products", []);

  const performSearch = (query: string) => {
    // جميع الحقول اختيارية

    const lowerQuery = query.toLowerCase();
    const allResults: SearchResult[] = [];

    // البحث في المنتجات
    if (searchType === "all" || searchType === "products") {
      const products = Array.isArray(cloudProducts) ? cloudProducts : [];
      products.forEach((product: any) => {
        const productName = String(product.name || "");
        const productCode = String(product.code || product.barcode || product.sku || "");
        const price = Number(product.wholesaleRetailPrice) || Number(product.retailPrice) || Number(product.bulkPrice) || 0;
        const quantity = Number(product.availableQuantity ?? product.quantity ?? 0);
        if (productName.toLocaleLowerCase("ar-EG").includes(lowerQuery) || productCode.toLocaleLowerCase("en-US").includes(lowerQuery)) {
          allResults.push({
            type: "product",
            id: String(product.id),
            name: productName,
            details: `الفئة: ${product.category || "بدون فئة"} | الكمية: ${quantity} | السعر: ${price} ج.م | الكود: ${productCode || "غير مسجل"}`,
            price,
            quantity
          });
        }
      });
    }

    // البحث في المبيعات
    if (searchType === "all" || searchType === "sales") {
      const sales = JSON.parse(localStorage.getItem("abu_raghwa_sales") || "[]");
      sales.forEach((sale: any) => {
        if (
          sale.id.toLowerCase().includes(lowerQuery) ||
          sale.items?.some((item: any) => item.name.toLowerCase().includes(lowerQuery))
        ) {
          allResults.push({
            type: "sale",
            id: sale.id,
            name: `فاتورة: ${sale.id}`,
            details: `التاريخ: ${new Date(sale.date).toLocaleDateString("ar-EG")} | الإجمالي: ${sale.total} ج.م`,
            price: sale.total
          });
        }
      });
    }

    // البحث في الخامات
    if (searchType === "all" || searchType === "materials") {
      const materials = JSON.parse(localStorage.getItem("abu_raghwa_raw_materials") || "[]");
      materials.forEach((material: any) => {
        if (material.name.toLowerCase().includes(lowerQuery)) {
          allResults.push({
            type: "material",
            id: material.id,
            name: material.name,
            details: `الكمية: ${material.quantity} | السعر: ${material.pricePerKilo} ج.م/كيلو`,
            quantity: material.quantity
          });
        }
      });
    }

    // البحث في التركيبات
    if (searchType === "all" || searchType === "recipes") {
      const recipes = JSON.parse(localStorage.getItem("abu_raghwa_recipes") || "[]");
      recipes.forEach((recipe: any) => {
        if (recipe.name.toLowerCase().includes(lowerQuery)) {
          allResults.push({
            type: "recipe",
            id: recipe.id,
            name: recipe.name,
            details: `التكلفة: ${recipe.costPerUnit} ج.م | السعر: ${recipe.salePrice} ج.م`,
            price: recipe.salePrice
          });
        }
      });
    }

    setResults(allResults);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    performSearch(query);
  };

  useEffect(() => {
    if (searchQuery) performSearch(searchQuery);
  }, []);

  const handleVoiceSearch = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("المتصفح الخاص بك لا يدعم البحث الصوتي");
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "ar-EG";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(transcript);
      performSearch(transcript);
    };

    recognition.onerror = () => {
      alert("خطأ في التعرف على الصوت");
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleBarcodeSearch = (barcode: string) => {
    const normalized = barcode.trim();
    if (!normalized) return;
    setSearchQuery(normalized);
    performSearch(normalized);
    setScannerOpen(false);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "product":
        return "📦";
      case "sale":
        return "🛒";
      case "material":
        return "🧪";
      case "recipe":
        return "👨‍🍳";
      default:
        return "📄";
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      product: "منتج",
      sale: "مبيعة",
      material: "خامة",
      recipe: "تركيبة"
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">البحث المتقدم</h1>
            <p className="text-gray-600 mt-1">بحث متقدم بالنص والصوت والباركود</p>
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
        {/* Search Options */}
        <Card className="mb-8 border-0 shadow-sm">
          <CardHeader>
            <CardTitle>خيارات البحث</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Text Search */}
              <div>
                <label className="block text-sm font-medium mb-2">البحث بالنص</label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="ابحث عن منتج أو مبيعة..."
                    value={searchQuery}
                    onChange={handleSearch}
                    className="flex-1"
                  />
                  <Button type="button" className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2" onClick={() => performSearch(searchQuery)}>
                    <Search className="w-4 h-4" />
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setScannerOpen(true)} className="flex items-center gap-2 border-orange-300 text-orange-700">
                    <Camera className="w-4 h-4" /> تصوير الكود
                  </Button>
                </div>
              </div>

              {/* Voice Search */}
              <div>
                <label className="block text-sm font-medium mb-2">البحث الصوتي</label>
                <Button
                  onClick={handleVoiceSearch}
                  disabled={isListening}
                  className={`w-full flex items-center justify-center gap-2 ${
                    isListening
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-green-600 hover:bg-green-700"
                  } text-white`}
                >
                  <Mic className="w-4 h-4" />
                  {isListening ? "جاري الاستماع..." : "ابدأ البحث الصوتي"}
                </Button>
              </div>
            </div>

            {/* Search Type Filter */}
            <div>
              <label className="block text-sm font-medium mb-2">نوع البحث</label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  { value: "all", label: "الكل" },
                  { value: "products", label: "المنتجات" },
                  { value: "sales", label: "المبيعات" },
                  { value: "materials", label: "الخامات" },
                  { value: "recipes", label: "التركيبات" }
                ].map((option) => (
                  <Button
                    key={option.value}
                    onClick={() => {
                      setSearchType(option.value);
                      performSearch(searchQuery);
                    }}
                    variant={searchType === option.value ? "default" : "outline"}
                    className="text-sm"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <AdvancedBarcodeScanner isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onDetect={handleBarcodeSearch} title="تصوير باركود للبحث عن السعر" />

        {/* Results */}
        <div>
          <h2 className="text-2xl font-bold mb-6">
            نتائج البحث ({results.length})
          </h2>

          {results.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((result) => (
                <Card key={`${result.type}-${result.id}`} className="border-0 shadow-sm">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3 mb-3">
                      <span className="text-2xl">{getTypeIcon(result.type)}</span>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{result.name}</h3>
                        <p className="text-xs text-gray-500">
                          {getTypeLabel(result.type)}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-gray-600 mb-4">{result.details}</p>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                      >
                        عرض التفاصيل
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                      >
                        تحديث
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : searchQuery ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-12 pb-12 text-center text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg">لم يتم العثور على نتائج</p>
                <p className="text-sm mt-2">حاول البحث عن شيء آخر</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-12 pb-12 text-center text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg">ابدأ البحث عن منتج أو مبيعة</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
