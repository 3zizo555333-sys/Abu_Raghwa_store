import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, TrendingUp, Package, DollarSign, ShoppingCart, Users, CheckSquare, Gift, Mic, Beaker, Calculator, Settings, Facebook, MessageCircle, Instagram, TrendingDown, CreditCard, Camera, Banknote, Bell, Trophy, Lock, AlertTriangle, WalletCards } from "lucide-react";
import { calculateTradeMarginSummary } from "@/lib/profit";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { getSavedSocialLinks, openSocialApp } from "@/lib/socialAppLinks";
import { trpc } from "@/lib/trpc";

interface DashboardStats {
  totalSales: number;
  totalRevenue: number;
  totalProducts: number;
  lowStockItems: number;
  totalEmployees: number;
  activeTasks: number;
  activeOffers: number;
  totalRecipes: number;
  totalMaterials: number;
  shopProfitPercent: number;
  shopProfit: number;
  shopCost: number;
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user, canViewSensitiveFinancials } = useStaffAccess();
  const canOpenOwnEmployeeCard = Boolean(user && !canViewSensitiveFinancials);
  const [staffSessionReady, setStaffSessionReady] = useState(() => Boolean(sessionStorage.getItem("abu_staff_sync_token")));
  const pendingStaff = trpc.staffSync.pending.useQuery(undefined, { enabled: staffSessionReady && (user?.role === "manager" || user?.role === "admin"), retry: false, refetchInterval: staffSessionReady ? 5_000 : false });
  const [stats, setStats] = useState<DashboardStats>({
    totalSales: 0,
    totalRevenue: 0,
    totalProducts: 0,
    lowStockItems: 0,
    totalEmployees: 0,
    activeTasks: 0,
    activeOffers: 0,
    totalRecipes: 0,
    totalMaterials: 0,
    shopProfitPercent: 0,
    shopProfit: 0,
    shopCost: 0
  });
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!pendingStaff.data?.length) return;
    const current = JSON.parse(localStorage.getItem("abu_raghwa_notifications") || "[]");
    const known = new Set(current.map((item: any) => item.id));
    const additions = pendingStaff.data.filter(item => !known.has(`staff_pending_${item.email}`)).map(item => ({ id: `staff_pending_${item.email}`, type: "warning", message: `طلب تسجيل موظف جديد: ${item.email}. افتح إدارة المستخدمين للموافقة.`, timestamp: item.createdDate, read: false, userId: item.id }));
    if (additions.length) {
      const next = [...additions, ...current];
      localStorage.setItem("abu_raghwa_notifications", JSON.stringify(next));
      setNotifications(next);
    }
  }, [pendingStaff.data]);

  const loadData = () => {
    const products = JSON.parse(localStorage.getItem("abu_raghwa_products") || "[]");
    const sales = JSON.parse(localStorage.getItem("abu_raghwa_sales") || "[]");
    const employees = JSON.parse(localStorage.getItem("abu_raghwa_employees") || "[]");
    const tasks = JSON.parse(localStorage.getItem("abu_raghwa_tasks") || "[]");
    const offers = JSON.parse(localStorage.getItem("abu_raghwa_offers") || "[]");
    const recipes = JSON.parse(localStorage.getItem("abu_raghwa_recipes") || "[]");
    const materials = JSON.parse(localStorage.getItem("abu_raghwa_raw_materials") || "[]");
    const notifs = JSON.parse(localStorage.getItem("abu_raghwa_notifications") || "[]");
    setNotifications(notifs);

    const totalRevenue = sales.reduce((sum: number, sale: any) => sum + (sale.total || 0), 0);
    const lowStock = products.filter((p: any) => (p.quantity || 0) < 5).length;
    const activeTasks = tasks.filter((t: any) => t.status !== "completed").length;
    const activeOffers = offers.filter((o: any) => o.status === "active").length;
    const tradeMarginSummary = calculateTradeMarginSummary(products, recipes);

    setStats({
      totalSales: sales.length,
      totalRevenue,
      totalProducts: products.length,
      lowStockItems: lowStock,
      totalEmployees: employees.length,
      activeTasks,
      activeOffers,
      totalRecipes: recipes.length,
      totalMaterials: materials.length,
      shopProfitPercent: tradeMarginSummary.marginPercent,
      shopProfit: tradeMarginSummary.unitProfit,
      shopCost: tradeMarginSummary.unitCost
    });
  };

  const statCards = [
    {
      icon: ShoppingCart,
      label: "إجمالي المبيعات",
      value: stats.totalSales,
      color: "text-blue-600",
      bgColor: "bg-blue-50"
    },
    ...(canViewSensitiveFinancials ? [{
      icon: DollarSign,
      label: "إجمالي الإيرادات",
      value: `${stats.totalRevenue.toFixed(2)} ج.م`,
      color: "text-green-600",
      bgColor: "bg-green-50"
    }] : []),
    {
      icon: Package,
      label: "عدد المنتجات",
      value: stats.totalProducts,
      color: "text-purple-600",
      bgColor: "bg-purple-50"
    },
    {
      icon: TrendingUp,
      label: "المنتجات الناقصة",
      value: stats.lowStockItems,
      color: "text-orange-600",
      bgColor: "bg-orange-50"
    },
    {
      icon: Beaker,
      label: "التركيبات",
      value: stats.totalRecipes,
      color: "text-cyan-600",
      bgColor: "bg-cyan-50"
    },
    {
      icon: Package,
      label: "الخامات",
      value: stats.totalMaterials,
      color: "text-amber-600",
      bgColor: "bg-amber-50"
    },
    ...(canViewSensitiveFinancials ? [{
      icon: TrendingUp,
      label: "هامش ربح المهنة (بالوحدة)",
      value: `${stats.shopProfitPercent.toFixed(2)}%`,
      color: stats.shopProfitPercent >= 0 ? "text-emerald-600" : "text-red-600",
      bgColor: stats.shopProfitPercent >= 0 ? "bg-emerald-50" : "bg-red-50"
    }] : [])
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">لوحة التحكم</h1>
            <p className="text-gray-600 mt-1">مرحباً بك في أبو رغوة</p>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate("/notifications")}
              className="relative"
            >
              <Bell className="w-4 h-4" />
              {notifications.filter((n: any) => !n.read).length > 0 && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-red-600 rounded-full"></span>
              )}
            </Button>
            {(pendingStaff.data?.length || 0) > 0 && <Button onClick={() => navigate("/user-management")} className="bg-orange-600 hover:bg-orange-700">طلبات تسجيل جديدة ({pendingStaff.data?.length})</Button>}
            <Button
              variant="outline"
              onClick={() => navigate("/")}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              العودة
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <div className={`w-12 h-12 rounded-lg ${stat.bgColor} flex items-center justify-center mb-3`}>
                    <Icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  <CardTitle className="text-sm font-medium text-gray-600">
                    {stat.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions */}
        <Card className="border-0 shadow-sm mb-8">
          <CardHeader>
            <CardTitle>الإجراءات السريعة</CardTitle>
            <CardDescription>الوصول السريع للمميزات الرئيسية</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button
                onClick={() => navigate("/products")}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                إدارة المنتجات
              </Button>
              <Button
                onClick={() => navigate("/sales")}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                تسجيل مبيعة جديدة
              </Button>
              {canViewSensitiveFinancials && <Button
                onClick={() => navigate("/reports")}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                عرض التقارير
              </Button>}
              {canViewSensitiveFinancials && <Button
                onClick={() => navigate("/advanced-reports")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                جرد المبيعات والأرباح
              </Button>}
              <Button
                onClick={() => navigate("/apartment-management")}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                🏠 إدارة الشقة
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Production & Recipes */}
        <Card className="border-0 shadow-sm mb-8">
          <CardHeader>
            <CardTitle>الإنتاج والتركيبات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {canViewSensitiveFinancials && <Button
                onClick={() => navigate("/materials")}
                className="bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-2"
              >
                <Package className="w-4 h-4" />
                قائمة الخامات
              </Button>}
              <Button
                onClick={() => navigate("/recipes")}
                className="bg-cyan-600 hover:bg-cyan-700 text-white flex items-center justify-center gap-2"
              >
                <Beaker className="w-4 h-4" />
                قائمة التركيبات
              </Button>
              <Button
                onClick={() => navigate("/calculator")}
                className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2"
              >
                <Calculator className="w-4 h-4" />
                الحاسبة الذكية
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Additional Features */}
        <Card className="border-0 shadow-sm mb-8">
          <CardHeader>
            <CardTitle>مميزات إضافية</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {canViewSensitiveFinancials && <Button
                onClick={() => navigate("/employees")}
                className="bg-pink-600 hover:bg-pink-700 text-white"
              >
                إدارة الموظفين
              </Button>}
              {canOpenOwnEmployeeCard && <Button
                onClick={() => navigate("/employees")}
                className="bg-violet-700 hover:bg-violet-800 text-white flex items-center justify-center gap-2"
              >
                <WalletCards className="w-4 h-4" />
                حسابي ومسحوباتي
              </Button>}
              <Button
                onClick={() => navigate("/tasks")}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                إدارة المهام
              </Button>
              <Button
                onClick={() => navigate("/points-system")}
                className="bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center gap-2"
              >
                <Gift className="w-4 h-4" />
                نظام النقط
              </Button>
              <Button
                onClick={() => navigate("/leaderboard")}
                className="bg-yellow-600 hover:bg-yellow-700 text-white flex items-center justify-center gap-2"
              >
                <Trophy className="w-4 h-4" />
                لوحة الشرف
              </Button>
              <Button
                onClick={() => navigate("/voice")}
                className="bg-cyan-600 hover:bg-cyan-700 text-white flex items-center justify-center gap-2"
              >
                <Mic className="w-4 h-4" />
                المساعد الصوتي
              </Button>
              {canViewSensitiveFinancials && <Button
                onClick={() => navigate("/settings")}
                className="bg-gray-600 hover:bg-gray-700 text-white flex items-center justify-center gap-2"
              >
                <Settings className="w-4 h-4" />
                الإعدادات
              </Button>}
              {canViewSensitiveFinancials && <Button
                onClick={() => navigate("/security-settings")}
                className="bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                🔐 إدارة الأمان
              </Button>}
              {canViewSensitiveFinancials && <Button
                onClick={() => navigate("/expenses")}
                className="bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2"
              >
                <TrendingDown className="w-4 h-4" />
                إدارة المصاريف
              </Button>}
              <Button
                onClick={() => navigate("/shortages")}
                className="bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center gap-2"
              >
                <AlertTriangle className="w-4 h-4" />
                نواقص أبو رغوة
              </Button>
              <Button
                onClick={() => navigate("/smart-offers")}
                className="bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center gap-2"
              >
                <Gift className="w-4 h-4" />
                🎯 العروض الذكية
              </Button>
              <Button
                onClick={() => navigate("/catalog-manager")}
                className="bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-2"
              >
                <Package className="w-4 h-4" />
                🛍️ كتالوج وطلبات العملاء
              </Button>

              {canViewSensitiveFinancials && <Button
                onClick={() => navigate("/invoice-camera")}
                className="bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                تصوير الفواتير
              </Button>}
              {canViewSensitiveFinancials && <Button
                onClick={() => navigate("/credits-suppliers")}
                className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2"
              >
                <Banknote className="w-4 h-4" />
                الأجل والموردين
              </Button>}
              {canViewSensitiveFinancials && <Button
                variant="outline"
                onClick={() => navigate("/data-export-import")}
              >
                النسخ الاحتياطي وتصدير البيانات
              </Button>}
            </div>
          </CardContent>
        </Card>

        {/* Social Media */}
        <Card className="border-0 shadow-sm mb-8">
          <CardHeader>
            <CardTitle>تابعنا على وسائل التواصل</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                onClick={() => openSocialApp("whatsapp", getSavedSocialLinks().whatsapp)}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </Button>
              <Button
                onClick={() => openSocialApp("facebook", getSavedSocialLinks().facebook)}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
              >
                <Facebook className="w-4 h-4" />
                Facebook
              </Button>
              <Button
                onClick={() => openSocialApp("instagram", getSavedSocialLinks().instagram)}
                className="bg-pink-600 hover:bg-pink-700 text-white flex items-center justify-center gap-2"
              >
                <Instagram className="w-4 h-4" />
                Instagram
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Info Section */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900">نصيحة</CardTitle>
          </CardHeader>
          <CardContent className="text-blue-800">
            <p>
              استخدم المساعد الصوتي والحاسبة الذكية للتحكم السريع بالتطبيق. قل "يا أبو رغوة" متبوعاً بأمرك المطلوب!
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
