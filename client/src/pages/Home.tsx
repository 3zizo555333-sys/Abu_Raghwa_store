import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { LogOut, Settings, Users, BarChart3, Package, ShoppingCart, Gift, Mic, Beaker, Calculator, FileText, Camera } from "lucide-react";
import SocialMediaLinks from "@/components/SocialMediaLinks";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function Home() {
  const [, navigate] = useLocation();
  const { user, isLoading, error, isAuthenticated, membershipState, canViewSensitiveFinancials, refresh } = useStaffAccess({ monitorMembership: true });

  useEffect(() => {
    if (!isLoading && !error && (!isAuthenticated || membershipState !== "active")) navigate("/auth");
  }, [error, isAuthenticated, isLoading, membershipState, navigate]);

  const handleLogout = async () => {
    try {
      await getSupabaseClient().auth.signOut();
    } catch (logoutError) {
      console.error("Supabase logout failed", logoutError);
    } finally {
      navigate("/auth");
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: { [key: string]: string } = {
      manager: "مدير",
      admin: "مسؤول",
      supervisor: "مشرف",
      seller: "بائع"
    };
    return labels[role] || role;
  };

  const getPermissions = (role: string) => {
    const permissions: { [key: string]: string[] } = {
      manager: [
        "التحكم الكامل",
        "إدارة المستخدمين",
        "تغيير الشعار والغلاف",
        "تصدير البيانات",
        "عرض جميع التقارير"
      ],
      admin: [
        "إدارة المخزون",
        "عرض أسعار الجملة",
        "تنفيذ المبيعات",
        "طباعة الفواتير",
        "إدارة الخامات والتركيبات"
      ],
      supervisor: ["إدارة المخزون", "عرض البيانات المالية المصرح بها", "مراجعة السجلات الحساسة"],
      seller: [
        "نظام POS",
        "طباعة الفواتير",
        "البحث عن المنتجات",
        "تسجيل المبيعات"
      ]
    };
    return permissions[role] || [];
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-600">جارٍ التحقق من جلسة Supabase...</div>;
  }
  if (error) {
    return <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center"><p>تعذر التحقق من جلسة المتجر من Supabase: {error instanceof Error ? error.message : "خطأ غير معروف"}</p><Button onClick={() => void refresh()}>إعادة المحاولة</Button></div>;
  }
  if (!user || membershipState !== "active") {
    return null;
  }

  const mainFeatures = [
    {
      icon: ShoppingCart,
      label: "المبيعات",
      description: "تسجيل المبيعات والفواتير",
      path: "/sales",
      color: "bg-green-50",
      textColor: "text-green-600"
    },
    {
      icon: Package,
      label: "المنتجات",
      description: "إدارة المخزون والأصناف",
      path: "/products",
      color: "bg-blue-50",
      textColor: "text-blue-600"
    },
    {
      icon: BarChart3,
      label: "التقارير",
      description: "تقارير يومية وشهرية",
      path: "/reports",
      color: "bg-purple-50",
      textColor: "text-purple-600"
    },
    {
      icon: Gift,
      label: "العروض",
      description: "عروض ذكية ومشاركة",
      path: "/offers",
      color: "bg-red-50",
      textColor: "text-red-600"
    }
  ];

  const productionFeatures = [
    {
      icon: Package,
      label: "الخامات",
      description: "قائمة الخامات والأسعار",
      path: "/materials",
      color: "bg-amber-50",
      textColor: "text-amber-600"
    },
    {
      icon: Beaker,
      label: "التركيبات",
      description: "إدارة التركيبات والوصفات",
      path: "/recipes",
      color: "bg-cyan-50",
      textColor: "text-cyan-600"
    },
    {
      icon: Camera,
      label: "استيراد الفواتير",
      description: "قراءة فواتير المورد",
      path: "/invoice-ocr",
      color: "bg-indigo-50",
      textColor: "text-indigo-600"
    }
  ];

  const toolsFeatures = [
    {
      icon: Calculator,
      label: "الحاسبة",
      description: "حاسبة ذكية مع صوت",
      path: "/calculator",
      color: "bg-orange-50",
      textColor: "text-orange-600"
    },
    {
      icon: Mic,
      label: "المساعد الصوتي",
      description: "التحكم بالصوت",
      path: "/voice",
      color: "bg-pink-50",
      textColor: "text-pink-600"
    },
    {
      icon: FileText,
      label: "التقارير المتقدمة",
      description: "تقارير مع تصدير",
      path: "/advanced-reports",
      color: "bg-teal-50",
      textColor: "text-teal-600"
    }
  ];

  const staffFeatures = [
    {
      icon: Users,
      label: "الموظفون",
      description: "إدارة الموظفين والحضور",
      path: "/employees",
      color: "bg-pink-50",
      textColor: "text-pink-600"
    },
    {
      icon: Settings,
      label: "المهام",
      description: "إدارة المهام والتقدم",
      path: "/tasks",
      color: "bg-indigo-50",
      textColor: "text-indigo-600"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-orange-600">🍵 أبو رغوة</h1>
            <p className="text-sm text-gray-600">نظام إدارة المحل الذكي</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold">{user.email}</p>
              <p className="text-xs text-gray-600">{getRoleLabel(user.role)}</p>
            </div>
            <Button
              onClick={handleLogout}
              variant="destructive"
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              تسجيل خروج
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome Section */}
        <Card className="mb-8 border-0 shadow-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white">
          <CardContent className="pt-6">
            <h2 className="text-3xl font-bold mb-2">مرحباً بك في أبو رغوة! 👋</h2>
            <p className="text-lg opacity-90">
              نظام متكامل لإدارة محلك بكفاءة واحترافية
            </p>
          </CardContent>
        </Card>

        {/* User Permissions */}
        <Card className="mb-8 border-0 shadow-sm">
          <CardHeader>
            <CardTitle>صلاحياتك</CardTitle>
            <CardDescription>{getRoleLabel(user.role)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {getPermissions(user.role).map((perm, idx) => (
                <div key={idx} className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                  ✓ {perm}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Main Features */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold mb-4 text-gray-900">المميزات الرئيسية</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {mainFeatures.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={idx}
                  className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(feature.path)}
                >
                  <CardContent className="pt-6">
                    <div className={`w-12 h-12 rounded-lg ${feature.color} flex items-center justify-center mb-3`}>
                      <Icon className={`w-6 h-6 ${feature.textColor}`} />
                    </div>
                    <h4 className="font-semibold mb-1">{feature.label}</h4>
                    <p className="text-xs text-gray-600">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Production Features */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold mb-4 text-gray-900">الإنتاج والتركيبات</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {productionFeatures.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={idx}
                  className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(feature.path)}
                >
                  <CardContent className="pt-6">
                    <div className={`w-12 h-12 rounded-lg ${feature.color} flex items-center justify-center mb-3`}>
                      <Icon className={`w-6 h-6 ${feature.textColor}`} />
                    </div>
                    <h4 className="font-semibold mb-1">{feature.label}</h4>
                    <p className="text-xs text-gray-600">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Tools */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold mb-4 text-gray-900">الأدوات المساعدة</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {toolsFeatures.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={idx}
                  className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(feature.path)}
                >
                  <CardContent className="pt-6">
                    <div className={`w-12 h-12 rounded-lg ${feature.color} flex items-center justify-center mb-3`}>
                      <Icon className={`w-6 h-6 ${feature.textColor}`} />
                    </div>
                    <h4 className="font-semibold mb-1">{feature.label}</h4>
                    <p className="text-xs text-gray-600">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Staff Management */}
        {canViewSensitiveFinancials && (
          <div className="mb-8">
            <h3 className="text-2xl font-bold mb-4 text-gray-900">إدارة الموظفين</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {staffFeatures.map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <Card
                    key={idx}
                    className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => navigate(feature.path)}
                  >
                    <CardContent className="pt-6">
                      <div className={`w-12 h-12 rounded-lg ${feature.color} flex items-center justify-center mb-3`}>
                        <Icon className={`w-6 h-6 ${feature.textColor}`} />
                      </div>
                      <h4 className="font-semibold mb-1">{feature.label}</h4>
                      <p className="text-xs text-gray-600">{feature.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <Card className="border-0 shadow-sm bg-blue-50 mb-8">
          <CardHeader>
            <CardTitle>إجراءات سريعة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                onClick={() => navigate("/dashboard")}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                لوحة التحكم
              </Button>
              <Button
                onClick={() => navigate("/sales")}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                مبيعة جديدة
              </Button>
              <Button
                onClick={() => navigate("/advanced-reports")}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                التقارير
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Social Media */}
        <Card className="border-0 shadow-sm bg-gradient-to-r from-orange-50 to-amber-50">
          <CardHeader>
            <CardTitle>تابعنا على وسائل التواصل</CardTitle>
            <CardDescription>محلات أبو رغوة للمنظفات - أصل الرغوة في مصر</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-8">
              <SocialMediaLinks
                whatsappNumber="201069035599"
                facebookUrl="aburagwa"
                instagramUrl="aburagwa"
                showLabels={true}
                size="lg"
              />
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
