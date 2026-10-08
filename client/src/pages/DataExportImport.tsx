import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Download, Upload, FileText, Package, ShoppingCart, Users } from "lucide-react";

export default function DataExportImport() {
  const [, navigate] = useLocation();
  const [exportFormat, setExportFormat] = useState("csv");

  const exportData = (dataType: string, format: string) => {
    let data: any[] = [];
    let filename = "";

    switch (dataType) {
      case "products":
        data = JSON.parse(localStorage.getItem("abu_raghwa_products") || "[]");
        filename = `products_${new Date().toISOString().split("T")[0]}.${format}`;
        break;
      case "sales":
        data = JSON.parse(localStorage.getItem("abu_raghwa_sales") || "[]");
        filename = `sales_${new Date().toISOString().split("T")[0]}.${format}`;
        break;
      case "materials":
        data = JSON.parse(localStorage.getItem("abu_raghwa_raw_materials") || "[]");
        filename = `materials_${new Date().toISOString().split("T")[0]}.${format}`;
        break;
      case "recipes":
        data = JSON.parse(localStorage.getItem("abu_raghwa_recipes") || "[]");
        filename = `recipes_${new Date().toISOString().split("T")[0]}.${format}`;
        break;
      default:
        return;
    }

    if (format === "csv") {
      exportCSV(data, filename);
    } else if (format === "json") {
      exportJSON(data, filename);
    }
  };

  const exportCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      alert("لا توجد بيانات للتصدير");
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            if (typeof value === "object") {
              return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
            }
            return `"${String(value).replace(/"/g, '""')}"`;
          })
          .join(",")
      )
    ].join("\n");

    const element = document.createElement("a");
    element.setAttribute("href", "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent));
    element.setAttribute("download", filename);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const exportJSON = (data: any[], filename: string) => {
    if (data.length === 0) {
      alert("لا توجد بيانات للتصدير");
      return;
    }

    const jsonContent = JSON.stringify(data, null, 2);
    const element = document.createElement("a");
    element.setAttribute("href", "data:application/json;charset=utf-8," + encodeURIComponent(jsonContent));
    element.setAttribute("download", filename);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>, dataType: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        if (Array.isArray(data)) {
          localStorage.setItem(`abu_raghwa_${dataType}`, JSON.stringify(data));
          alert("تم استيراد البيانات بنجاح!");
          window.location.reload();
        } else {
          alert("صيغة الملف غير صحيحة");
        }
      } catch (error) {
        alert("خطأ في قراءة الملف");
      }
    };
    reader.readAsText(file);
  };

  const exportAllData = () => {
    const allData = {
      products: JSON.parse(localStorage.getItem("abu_raghwa_products") || "[]"),
      sales: JSON.parse(localStorage.getItem("abu_raghwa_sales") || "[]"),
      materials: JSON.parse(localStorage.getItem("abu_raghwa_raw_materials") || "[]"),
      recipes: JSON.parse(localStorage.getItem("abu_raghwa_recipes") || "[]"),
      employees: JSON.parse(localStorage.getItem("abu_raghwa_employees") || "[]"),
      tasks: JSON.parse(localStorage.getItem("abu_raghwa_tasks") || "[]"),
      offers: JSON.parse(localStorage.getItem("abu_raghwa_offers") || "[]"),
      exportDate: new Date().toISOString()
    };

    const jsonContent = JSON.stringify(allData, null, 2);
    const element = document.createElement("a");
    element.setAttribute(
      "href",
      "data:application/json;charset=utf-8," + encodeURIComponent(jsonContent)
    );
    element.setAttribute("download", `abu_raghwa_backup_${new Date().toISOString().split("T")[0]}.json`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">تصدير واستيراد البيانات</h1>
            <p className="text-gray-600 mt-1">نسخ احتياطية وتبادل البيانات</p>
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
        {/* Quick Backup */}
        <Card className="mb-8 border-0 shadow-sm bg-gradient-to-r from-blue-50 to-blue-100">
          <CardHeader>
            <CardTitle className="text-blue-900">نسخة احتياطية شاملة</CardTitle>
            <CardDescription className="text-blue-700">
              تصدير جميع البيانات في ملف واحد
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={exportAllData}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              تحميل النسخة الاحتياطية الكاملة
            </Button>
          </CardContent>
        </Card>

        {/* Export/Import Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Products */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                المنتجات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">تصدير</label>
                <div className="flex gap-2">
                  <Button
                    onClick={() => exportData("products", "csv")}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    CSV
                  </Button>
                  <Button
                    onClick={() => exportData("products", "json")}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    JSON
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">استيراد</label>
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => handleImport(e, "products")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </CardContent>
          </Card>

          {/* Sales */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-green-600" />
                المبيعات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">تصدير</label>
                <div className="flex gap-2">
                  <Button
                    onClick={() => exportData("sales", "csv")}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    CSV
                  </Button>
                  <Button
                    onClick={() => exportData("sales", "json")}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    JSON
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">استيراد</label>
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => handleImport(e, "sales")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </CardContent>
          </Card>

          {/* Materials */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-600" />
                الخامات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">تصدير</label>
                <div className="flex gap-2">
                  <Button
                    onClick={() => exportData("materials", "csv")}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    CSV
                  </Button>
                  <Button
                    onClick={() => exportData("materials", "json")}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    JSON
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">استيراد</label>
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => handleImport(e, "raw_materials")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </CardContent>
          </Card>

          {/* Recipes */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" />
                التركيبات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">تصدير</label>
                <div className="flex gap-2">
                  <Button
                    onClick={() => exportData("recipes", "csv")}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    CSV
                  </Button>
                  <Button
                    onClick={() => exportData("recipes", "json")}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    JSON
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">استيراد</label>
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => handleImport(e, "recipes")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Information */}
        <Card className="mt-8 border-0 shadow-sm bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900">ملاحظات مهمة</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-amber-800 space-y-2">
            <p>• قم بعمل نسخة احتياطية منتظمة لبياناتك</p>
            <p>• تأكد من صيغة الملف قبل الاستيراد</p>
            <p>• الاستيراد سيستبدل البيانات الحالية</p>
            <p>• احفظ النسخ الاحتياطية في مكان آمن</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
