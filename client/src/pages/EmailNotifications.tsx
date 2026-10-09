import { browserState } from "@/lib/browserState";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Mail, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ADMIN_EMAIL } from "@/const";

interface EmailNotification {
  id: string;
  type: "daily_report" | "low_stock" | "high_sales" | "custom";
  email: string;
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  time: string;
  lastSent?: string;
}

export default function EmailNotifications() {
  const [, navigate] = useLocation();
  const [notifications, setNotifications] = useState<EmailNotification[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [time, setTime] = useState("09:00");

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = () => {
    const saved = browserState.get("abu_raghwa_email_notifications");
    if (saved) {
      setNotifications(JSON.parse(saved));
    } else {
      // إضافة الإشعار الافتراضي للمدير
      const defaultNotifications: EmailNotification[] = [
        {
          id: "1",
          type: "daily_report",
          email: ADMIN_EMAIL,
          enabled: true,
          frequency: "daily",
          time: "09:00",
          lastSent: new Date().toISOString()
        }
      ];
      setNotifications(defaultNotifications);
      browserState.set("abu_raghwa_email_notifications", JSON.stringify(defaultNotifications));
    }
  };

  const addNotification = () => {
    if (!newEmail) {
      alert("الرجاء إدخال بريد إلكتروني");
      return;
    }

    const newNotification: EmailNotification = {
      id: Date.now().toString(),
      type: "daily_report",
      email: newEmail,
      enabled: true,
      frequency,
      time,
      lastSent: new Date().toISOString()
    };

    const updated = [...notifications, newNotification];
    setNotifications(updated);
    browserState.set("abu_raghwa_email_notifications", JSON.stringify(updated));
    setNewEmail("");
    alert("تم إضافة الإشعار بنجاح!");
  };

  const toggleNotification = (id: string) => {
    const updated = notifications.map(n =>
      n.id === id ? { ...n, enabled: !n.enabled } : n
    );
    setNotifications(updated);
    browserState.set("abu_raghwa_email_notifications", JSON.stringify(updated));
  };

  const deleteNotification = (id: string) => {
    const updated = notifications.filter(n => n.id !== id);
    setNotifications(updated);
    browserState.set("abu_raghwa_email_notifications", JSON.stringify(updated));
  };

  const sendTestEmail = (email: string) => {
    alert(`تم إرسال بريد اختبار إلى ${email}\n\nملاحظة: في النسخة الحقيقية، سيتم إرسال البريد عبر خادم البريد`);
  };

  const generateDailyReport = () => {
    const products = JSON.parse(browserState.get("abu_raghwa_products") || "[]");
    const sales = JSON.parse(browserState.get("abu_raghwa_sales") || "[]");
    const todaySales = sales.filter((s: any) => {
      const saleDate = new Date(s.date).toDateString();
      const today = new Date().toDateString();
      return saleDate === today;
    });

    const totalRevenue = todaySales.reduce((sum: number, s: any) => sum + (s.total || 0), 0);
    const lowStock = products.filter((p: any) => (p.quantity || 0) < 5);

    return {
      date: new Date().toLocaleDateString("ar-EG"),
      totalSales: todaySales.length,
      totalRevenue,
      lowStockItems: lowStock.length,
      topProducts: products.slice(0, 5)
    };
  };

  const report = generateDailyReport();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">الإشعارات البريدية</h1>
            <p className="text-gray-600 mt-1">إدارة التقارير اليومية والإشعارات</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/settings")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            العودة
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add New Notification */}
          <div className="lg:col-span-2 space-y-8">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-600" />
                  إضافة إشعار جديد
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">البريد الإلكتروني</label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="example@gmail.com"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">التكرار</label>
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="daily">يومي</option>
                      <option value="weekly">أسبوعي</option>
                      <option value="monthly">شهري</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">الوقت</label>
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                    />
                  </div>
                </div>

                <Button
                  onClick={addNotification}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  إضافة الإشعار
                </Button>
              </CardContent>
            </Card>

            {/* Active Notifications */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>الإشعارات النشطة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {notif.enabled ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-gray-400" />
                          )}
                          <p className="font-medium">{notif.email}</p>
                        </div>
                        <p className="text-sm text-gray-600 flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {notif.frequency === "daily" && "يومي"}
                          {notif.frequency === "weekly" && "أسبوعي"}
                          {notif.frequency === "monthly" && "شهري"}
                          {" في "} {notif.time}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={notif.enabled ? "default" : "outline"}
                          onClick={() => toggleNotification(notif.id)}
                        >
                          {notif.enabled ? "مفعل" : "معطل"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => sendTestEmail(notif.email)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          اختبار
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteNotification(notif.id)}
                        >
                          حذف
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Report Preview */}
          <div>
            <Card className="border-0 shadow-sm sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg">معاينة التقرير اليومي</CardTitle>
                <CardDescription>{report.date}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">إجمالي المبيعات</p>
                  <p className="text-2xl font-bold text-blue-600">{report.totalSales}</p>
                </div>

                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">إجمالي الإيرادات</p>
                  <p className="text-2xl font-bold text-green-600">
                    {report.totalRevenue.toFixed(2)} ج.م
                  </p>
                </div>

                <div className="bg-orange-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">المنتجات الناقصة</p>
                  <p className="text-2xl font-bold text-orange-600">{report.lowStockItems}</p>
                </div>

                <Button
                  onClick={() => sendTestEmail(ADMIN_EMAIL)}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  إرسال التقرير الآن
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
