import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Download, Filter, AlertCircle, CheckCircle, Trash2 } from "lucide-react";
import { withPasswordProtection } from "@/components/withPasswordProtection";

interface AuditEntry {
  id?: string;
  type: string;
  timestamp: string;
  userId: string;
  action: string;
  details: string;
  status: "success" | "failed" | "warning";
}

function AuditLogContent() {
  const [, navigate] = useLocation();
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [filteredLog, setFilteredLog] = useState<AuditEntry[]>([]);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    loadAuditLog();
  }, []);

  useEffect(() => {
    filterLog();
  }, [auditLog, filterType, filterStatus, searchText]);

  const loadAuditLog = () => {
    const log = JSON.parse(localStorage.getItem("abu_raghwa_audit_log") || "[]");
    setAuditLog(log);
  };

  const filterLog = () => {
    let filtered = auditLog;

    if (filterType !== "all") {
      filtered = filtered.filter((entry) => entry.type === filterType);
    }

    if (filterStatus !== "all") {
      filtered = filtered.filter((entry) => entry.status === filterStatus);
    }

    if (searchText) {
      filtered = filtered.filter(
        (entry) =>
          entry.userId.includes(searchText) ||
          entry.action.includes(searchText) ||
          entry.details.includes(searchText)
      );
    }

    setFilteredLog(filtered);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case "warning":
        return <AlertCircle className="w-4 h-4 text-orange-600" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
      success: "نجح",
      failed: "فشل",
      warning: "تحذير"
    };
    return labels[status] || status;
  };

  const getTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      LOGIN: "تسجيل دخول",
      LOGOUT: "تسجيل خروج",
      SALE: "مبيعة",
      PRODUCT_ADD: "إضافة منتج",
      PRODUCT_EDIT: "تعديل منتج",
      PRODUCT_DELETE: "حذف منتج",
      INVENTORY_UPDATE: "تحديث المخزون",
      SCREENSHOT_ATTEMPT: "محاولة تصوير شاشة",
      RECIPE_VIEW: "عرض تركيبة",
      RECIPE_EDIT: "تعديل تركيبة",
      MATERIAL_ADD: "إضافة خامة",
      REPORT_EXPORT: "تصدير تقرير",
      USER_CREATE: "إنشاء مستخدم",
      USER_DELETE: "حذف مستخدم",
      PERMISSION_CHANGE: "تغيير الصلاحيات"
    };
    return labels[type] || type;
  };

  const exportLog = () => {
    const csvContent = [
      ["التاريخ", "النوع", "المستخدم", "الإجراء", "التفاصيل", "الحالة"].join(","),
      ...filteredLog.map((entry) =>
        [
          entry.timestamp,
          getTypeLabel(entry.type),
          entry.userId,
          entry.action,
          entry.details,
          getStatusLabel(entry.status)
        ].join(",")
      )
    ].join("\n");

    const element = document.createElement("a");
    element.setAttribute("href", "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent));
    element.setAttribute("download", `audit_log_${new Date().toISOString().split("T")[0]}.csv`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const clearLog = () => {
    if (confirm("هل أنت متأكد من حذف سجل التدقيق؟")) {
      localStorage.setItem("abu_raghwa_audit_log", "[]");
      setAuditLog([]);
      setFilteredLog([]);
    }
  };

  const getTypeColor = (type: string) => {
    if (type.includes("SCREENSHOT")) return "bg-red-50";
    if (type.includes("DELETE")) return "bg-orange-50";
    if (type.includes("LOGIN")) return "bg-blue-50";
    if (type.includes("SALE")) return "bg-green-50";
    return "bg-gray-50";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">سجل التدقيق</h1>
            <p className="text-gray-600 mt-1">تتبع جميع العمليات والتغييرات</p>
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
            <CardTitle>خيارات التصفية</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">البحث</label>
                <input
                  type="text"
                  placeholder="ابحث عن مستخدم أو إجراء..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">نوع العملية</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="all">الكل</option>
                  <option value="LOGIN">تسجيل دخول</option>
                  <option value="LOGOUT">تسجيل خروج</option>
                  <option value="SALE">مبيعة</option>
                  <option value="PRODUCT_ADD">إضافة منتج</option>
                  <option value="PRODUCT_EDIT">تعديل منتج</option>
                  <option value="PRODUCT_DELETE">حذف منتج</option>
                  <option value="SCREENSHOT_ATTEMPT">محاولة تصوير</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">الحالة</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="all">الكل</option>
                  <option value="success">نجح</option>
                  <option value="failed">فشل</option>
                  <option value="warning">تحذير</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <Button
                  onClick={exportLog}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  تصدير
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600">إجمالي العمليات</p>
              <p className="text-2xl font-bold text-blue-600">{auditLog.length}</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600">العمليات الناجحة</p>
              <p className="text-2xl font-bold text-green-600">
                {auditLog.filter((e) => e.status === "success").length}
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600">العمليات الفاشلة</p>
              <p className="text-2xl font-bold text-red-600">
                {auditLog.filter((e) => e.status === "failed").length}
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600">محاولات التصوير</p>
              <p className="text-2xl font-bold text-orange-600">
                {auditLog.filter((e) => e.type === "SCREENSHOT_ATTEMPT").length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Audit Log Table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>سجل العمليات</CardTitle>
            <Button
              onClick={clearLog}
              variant="destructive"
              size="sm"
              className="flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              مسح السجل
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">التاريخ والوقت</th>
                    <th className="px-4 py-3 text-right font-medium">النوع</th>
                    <th className="px-4 py-3 text-right font-medium">المستخدم</th>
                    <th className="px-4 py-3 text-right font-medium">الإجراء</th>
                    <th className="px-4 py-3 text-right font-medium">التفاصيل</th>
                    <th className="px-4 py-3 text-right font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLog.length > 0 ? (
                    filteredLog.map((entry, idx) => (
                      <tr key={idx} className={`border-b ${getTypeColor(entry.type)}`}>
                        <td className="px-4 py-3">
                          {new Date(entry.timestamp).toLocaleString("ar-EG")}
                        </td>
                        <td className="px-4 py-3 font-medium">{getTypeLabel(entry.type)}</td>
                        <td className="px-4 py-3">{entry.userId}</td>
                        <td className="px-4 py-3">{entry.action}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{entry.details}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(entry.status)}
                            <span>{getStatusLabel(entry.status)}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        لا توجد عمليات مطابقة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default withPasswordProtection(AuditLogContent, 'logs', 'السجل');
