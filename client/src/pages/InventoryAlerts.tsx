import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, AlertTriangle, TrendingDown, Clock } from "lucide-react";

interface Product {
  id: string;
  name: string;
  quantity: number;
  minStock: number;
  lastSale?: string;
  category?: string;
}

interface Alert {
  type: "low_stock" | "stagnant";
  product: Product;
  severity: "critical" | "warning" | "info";
}

export default function InventoryAlerts() {
  const [, navigate] = useLocation();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [stagnantDays, setStagnantDays] = useState(30);

  useEffect(() => {
    generateAlerts();
  }, [lowStockThreshold, stagnantDays]);

  const generateAlerts = () => {
    const products = JSON.parse(localStorage.getItem("abu_raghwa_products") || "[]");
    const sales = JSON.parse(localStorage.getItem("abu_raghwa_sales") || "[]");
    const newAlerts: Alert[] = [];

    products.forEach((product: any) => {
      // تنبيهات المخزون الناقص
      if (product.quantity <= lowStockThreshold) {
        let severity: "critical" | "warning" | "info" = "warning";
        if (product.quantity === 0) {
          severity = "critical";
        } else if (product.quantity <= lowStockThreshold / 2) {
          severity = "warning";
        }

        newAlerts.push({
          type: "low_stock",
          product,
          severity
        });
      }

      // تنبيهات المخزون الراكد
      const lastSale = sales
        .filter((s: any) => s.items?.some((i: any) => i.productId === product.id))
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      if (lastSale) {
        const daysSinceLastSale = Math.floor(
          (Date.now() - new Date(lastSale.date).getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceLastSale > stagnantDays && product.quantity > 0) {
          newAlerts.push({
            type: "stagnant",
            product: { ...product, lastSale: lastSale.date },
            severity: daysSinceLastSale > stagnantDays * 2 ? "critical" : "warning"
          });
        }
      }
    });

    setAlerts(newAlerts);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-50 border-l-4 border-l-red-500";
      case "warning":
        return "bg-orange-50 border-l-4 border-l-orange-500";
      case "info":
        return "bg-blue-50 border-l-4 border-l-blue-500";
      default:
        return "bg-gray-50";
    }
  };

  const getSeverityLabel = (severity: string) => {
    const labels: { [key: string]: string } = {
      critical: "حرج",
      warning: "تحذير",
      info: "معلومة"
    };
    return labels[severity] || severity;
  };

  const getSeverityBadgeColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800";
      case "warning":
        return "bg-orange-100 text-orange-800";
      case "info":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const lowStockAlerts = alerts.filter((a) => a.type === "low_stock");
  const stagnantAlerts = alerts.filter((a) => a.type === "stagnant");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">تنبيهات المخزون</h1>
            <p className="text-gray-600 mt-1">الأصناف الناقصة والراكدة</p>
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
        {/* Settings */}
        <Card className="mb-8 border-0 shadow-sm">
          <CardHeader>
            <CardTitle>إعدادات التنبيهات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  حد المخزون الناقص (الحد الأدنى)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-lg font-bold text-orange-600 w-12">
                    {lowStockThreshold}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  عدد أيام الركود (بدون مبيعات)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="7"
                    max="90"
                    step="7"
                    value={stagnantDays}
                    onChange={(e) => setStagnantDays(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-lg font-bold text-blue-600 w-12">
                    {stagnantDays}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600">إجمالي التنبيهات</p>
              <p className="text-3xl font-bold text-red-600">{alerts.length}</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600">أصناف ناقصة</p>
              <p className="text-3xl font-bold text-orange-600">{lowStockAlerts.length}</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600">أصناف راكدة</p>
              <p className="text-3xl font-bold text-blue-600">{stagnantAlerts.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Low Stock Alerts */}
        {lowStockAlerts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
              الأصناف الناقصة
            </h2>
            <div className="space-y-3">
              {lowStockAlerts.map((alert, idx) => (
                <Card key={idx} className={`border-0 shadow-sm ${getSeverityColor(alert.severity)}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{alert.product.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          الكمية الحالية: <span className="font-bold">{alert.product.quantity}</span>
                        </p>
                        {alert.product.minStock && (
                          <p className="text-sm text-gray-600">
                            الحد الأدنى: <span className="font-bold">{alert.product.minStock}</span>
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-semibold ${getSeverityBadgeColor(
                          alert.severity
                        )}`}
                      >
                        {getSeverityLabel(alert.severity)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Stagnant Stock Alerts */}
        {stagnantAlerts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <TrendingDown className="w-6 h-6 text-blue-600" />
              الأصناف الراكدة (بدون مبيعات)
            </h2>
            <div className="space-y-3">
              {stagnantAlerts.map((alert, idx) => {
                const daysSinceLastSale = Math.floor(
                  (Date.now() - new Date(alert.product.lastSale || "").getTime()) /
                    (1000 * 60 * 60 * 24)
                );
                return (
                  <Card key={idx} className={`border-0 shadow-sm ${getSeverityColor(alert.severity)}`}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-lg">{alert.product.name}</h3>
                          <p className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            آخر مبيعة: {daysSinceLastSale} يوم
                          </p>
                          <p className="text-sm text-gray-600">
                            الكمية المتاحة: <span className="font-bold">{alert.product.quantity}</span>
                          </p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${getSeverityBadgeColor(
                            alert.severity
                          )}`}
                        >
                          {getSeverityLabel(alert.severity)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* No Alerts */}
        {alerts.length === 0 && (
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-12 pb-12 text-center">
              <p className="text-lg text-gray-600">✅ لا توجد تنبيهات - المخزون بحالة جيدة!</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
