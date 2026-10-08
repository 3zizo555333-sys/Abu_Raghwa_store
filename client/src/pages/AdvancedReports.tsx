import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Download, Send, Calendar, TrendingUp } from "lucide-react";

interface ReportData {
  totalSales: number;
  totalCost: number;
  netProfit: number;
  profitPercent: number;
  lowStockItems: string[];
  byCategory: { [key: string]: number };
  byRecipe: { [key: string]: number };
}

export default function AdvancedReports() {
  const [, navigate] = useLocation();
  const [reportType, setReportType] = useState<"daily" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  useEffect(() => {
    generateReport();
  }, [reportType, selectedDate]);

  const generateReport = () => {
    const sales = JSON.parse(localStorage.getItem("abu_raghwa_sales") || "[]");
    const products = JSON.parse(localStorage.getItem("abu_raghwa_products") || "[]");
    const recipes = JSON.parse(localStorage.getItem("abu_raghwa_recipes") || "[]");

    let filteredSales = sales;
    
    if (reportType === "daily") {
      const dateStart = new Date(selectedDate);
      const dateEnd = new Date(selectedDate);
      dateEnd.setDate(dateEnd.getDate() + 1);
      
      filteredSales = sales.filter((s: any) => {
        const saleDate = new Date(s.date);
        return saleDate >= dateStart && saleDate < dateEnd;
      });
    } else {
      const [year, month] = selectedDate.split('-');
      filteredSales = sales.filter((s: any) => {
        const saleDate = new Date(s.date);
        return saleDate.getFullYear() === parseInt(year) && 
               saleDate.getMonth() === parseInt(month) - 1;
      });
    }

    const totalSales = filteredSales.reduce((sum: number, s: any) => sum + (s.total || 0), 0);
    const totalCost = filteredSales.reduce((sum: number, s: any) => {
      return sum + (s.items?.reduce((itemSum: number, item: any) => {
        const product = products.find((p: any) => p.id === item.productId);
        return itemSum + ((product?.cost || 0) * item.quantity);
      }, 0) || 0);
    }, 0);
    const netProfit = totalSales - totalCost;
    const profitPercent = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;

    const lowStockItems = products
      .filter((p: any) => (p.quantity || 0) < 5)
      .map((p: any) => `${p.name} (${p.quantity || 0})`);

    const byCategory: { [key: string]: number } = {};
    filteredSales.forEach((s: any) => {
      s.items?.forEach((item: any) => {
        const product = products.find((p: any) => p.id === item.productId);
        const category = product?.category || "بدون فئة";
        byCategory[category] = (byCategory[category] || 0) + (item.quantity * item.price);
      });
    });

    const byRecipe: { [key: string]: number } = {};
    recipes.forEach((r: any) => {
      const recipeCount = filteredSales.reduce((sum: number, s: any) => {
        return sum + (s.items?.filter((i: any) => i.recipeId === r.id).length || 0);
      }, 0);
      if (recipeCount > 0) {
        byRecipe[r.name] = recipeCount * r.salePrice;
      }
    });

    setReportData({
      totalSales,
      totalCost,
      netProfit,
      profitPercent,
      lowStockItems,
      byCategory,
      byRecipe
    });
  };

  const exportToPDF = () => {
    if (!reportData) return;

    const content = `
تقرير ${reportType === "daily" ? "يومي" : "شهري"} - أبو رغوة
التاريخ: ${selectedDate}

الملخص المالي:
- إجمالي المبيعات: ${reportData.totalSales.toFixed(2)} ج.م
- إجمالي التكاليف: ${reportData.totalCost.toFixed(2)} ج.م
- صافي الربح: ${reportData.netProfit.toFixed(2)} ج.م
- نسبة الربح: ${reportData.profitPercent.toFixed(2)}%

الأصناف الناقصة:
${reportData.lowStockItems.join('\n')}

المبيعات حسب الفئة:
${Object.entries(reportData.byCategory)
  .map(([cat, amount]) => `${cat}: ${amount.toFixed(2)} ج.م`)
  .join('\n')}

المبيعات حسب التركيبة:
${Object.entries(reportData.byRecipe)
  .map(([recipe, amount]) => `${recipe}: ${amount.toFixed(2)} ج.م`)
  .join('\n')}
    `;

    try {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `report_${reportType}_${selectedDate}.txt`);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to download report');
    }
  };

  const exportToExcel = () => {
    if (!reportData) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += `تقرير ${reportType === "daily" ? "يومي" : "شهري"},${selectedDate}\n\n`;
    csvContent += "الملخص المالي\n";
    csvContent += `إجمالي المبيعات,${reportData.totalSales.toFixed(2)}\n`;
    csvContent += `إجمالي التكاليف,${reportData.totalCost.toFixed(2)}\n`;
    csvContent += `صافي الربح,${reportData.netProfit.toFixed(2)}\n`;
    csvContent += `نسبة الربح,${reportData.profitPercent.toFixed(2)}%\n\n`;

    csvContent += "المبيعات حسب الفئة\n";
    Object.entries(reportData.byCategory).forEach(([cat, amount]) => {
      csvContent += `${cat},${amount.toFixed(2)}\n`;
    });

    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `report_${reportType}_${selectedDate}.csv`);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to download report');
    }
  };

  const sendViaWhatsApp = () => {
    if (!reportData) return;

    const message = `
*تقرير ${reportType === "daily" ? "يومي" : "شهري"} - أبو رغوة*
التاريخ: ${selectedDate}

*الملخص المالي:*
📊 إجمالي المبيعات: ${reportData.totalSales.toFixed(2)} ج.م
💰 إجمالي التكاليف: ${reportData.totalCost.toFixed(2)} ج.م
✅ صافي الربح: ${reportData.netProfit.toFixed(2)} ج.م
📈 نسبة الربح: ${reportData.profitPercent.toFixed(2)}%

${reportData.lowStockItems.length > 0 ? `⚠️ *الأصناف الناقصة:*\n${reportData.lowStockItems.join('\n')}\n` : ''}
    `;

    const whatsappNumber = "01069035599";
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${whatsappNumber}?text=${encodedMessage}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">جرد المبيعات والأرباح</h1>
            <p className="text-gray-600 mt-1">راجع المبيعات والتكلفة وصافي الربح يوميًا أو شهريًا، ثم صدّر التقرير أو شاركه.</p>
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
        {/* Filters */}
        <Card className="mb-8 border-0 shadow-sm">
          <CardHeader>
            <CardTitle>خيارات الجرد</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">نوع التقرير</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="daily">يومي</option>
                  <option value="monthly">شهري</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  {reportType === "daily" ? "التاريخ" : "الشهر"}
                </label>
                <input
                  type={reportType === "daily" ? "date" : "month"}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  onClick={sendViaWhatsApp}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  WhatsApp
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {reportData && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">إجمالي المبيعات</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-blue-600">
                    {reportData.totalSales.toFixed(2)} ج.م
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">إجمالي التكاليف</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-orange-600">
                    {reportData.totalCost.toFixed(2)} ج.م
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">صافي الربح</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-600">
                    {reportData.netProfit.toFixed(2)} ج.م
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">نسبة الربح</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-purple-600">
                    {reportData.profitPercent.toFixed(2)}%
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Export Buttons */}
            <div className="flex gap-4 mb-8">
              <Button
                onClick={exportToPDF}
                className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                تصدير PDF
              </Button>
              <Button
                onClick={exportToExcel}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                تصدير Excel
              </Button>
            </div>

            {/* Detailed Reports */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* By Category */}
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>المبيعات حسب الفئة</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(reportData.byCategory).map(([category, amount]) => (
                      <div key={category} className="flex justify-between items-center pb-3 border-b">
                        <span className="font-medium">{category}</span>
                        <span className="text-green-600 font-bold">
                          {amount.toFixed(2)} ج.م
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* By Recipe */}
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>المبيعات حسب التركيبة</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(reportData.byRecipe).length > 0 ? (
                      Object.entries(reportData.byRecipe).map(([recipe, amount]) => (
                        <div key={recipe} className="flex justify-between items-center pb-3 border-b">
                          <span className="font-medium">{recipe}</span>
                          <span className="text-blue-600 font-bold">
                            {amount.toFixed(2)} ج.م
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500">لا توجد مبيعات من التركيبات</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Low Stock Items */}
            {reportData.lowStockItems.length > 0 && (
              <Card className="mt-8 border-0 shadow-sm border-l-4 border-l-orange-500">
                <CardHeader>
                  <CardTitle className="text-orange-600">⚠️ الأصناف الناقصة</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {reportData.lowStockItems.map((item, idx) => (
                      <div key={idx} className="bg-orange-50 p-3 rounded">
                        {item}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
