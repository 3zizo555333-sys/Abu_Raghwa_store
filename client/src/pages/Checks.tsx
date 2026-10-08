import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Edit2, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { deleteCloudBankCheck, listCloudBankChecks, saveCloudBankCheck, subscribeToCheckChanges, type BankCheckInput, type CloudBankCheck } from "@/lib/supabase/checks";

type Check = CloudBankCheck;

export default function Checks() {
  const [, navigate] = useLocation();
  const [checks, setChecks] = useState<Check[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<BankCheckInput>({
    checkNumber: "",
    amount: 0,
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    bankName: "",
    accountHolder: "",
    status: "معلق",
    type: "صادر",
    notes: ""
  });

  const loadChecks = useCallback(async () => {
    setLoadError("");
    try {
      setChecks(await listCloudBankChecks());
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تحميل الشيكات من Supabase.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => Promise<unknown>) | undefined;
    void loadChecks();
    void subscribeToCheckChanges(() => { if (active) void loadChecks(); })
      .then(cleanup => { if (active) unsubscribe = cleanup; else void cleanup(); })
      .catch(error => { if (active) toast.error(error instanceof Error ? error.message : "تعذر تفعيل تحديثات الشيكات."); });
    return () => { active = false; if (unsubscribe) void unsubscribe(); };
  }, [loadChecks]);

  const handleAddCheck = async () => {
    if (isSaving) return;
    const amount = Number(formData.amount);
    if (!formData.checkNumber.trim() || !Number.isFinite(amount) || amount <= 0 || !formData.issueDate || !formData.dueDate || formData.dueDate < formData.issueDate) {
      toast.error("أدخل رقم الشيك ومبلغًا موجبًا وتاريخي إصدار واستحقاق صحيحين.");
      return;
    }
    const current = editingId ? checks.find(check => check.id === editingId) : undefined;
    if (editingId && !current) {
      toast.error("لم يعد الشيك موجودًا في السجل السحابي. حدّث الصفحة قبل التعديل.");
      return;
    }
    setIsSaving(true);
    try {
      await saveCloudBankCheck({ ...formData, amount, checkNumber: formData.checkNumber.trim() }, current ? { id: current.id, version: current.version } : undefined);
      toast.success(editingId ? "تم تحديث الشيك في Supabase." : "تم حفظ الشيك في Supabase.");
      resetForm();
      await loadChecks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الشيك سحابيًا؛ لم يُحفظ محليًا.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCheck = async (id: string) => {
    const check = checks.find(item => item.id === id);
    if (!check || isSaving || !confirm("هل تريد حذف هذا الشيك من السجل السحابي؟")) return;
    setIsSaving(true);
    try {
      await deleteCloudBankCheck({ id: check.id, version: check.version });
      toast.success("تم حذف الشيك من Supabase.");
      await loadChecks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حذف الشيك سحابيًا؛ لم يُحذف السجل.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditCheck = (check: Check) => {
    setFormData(check);
    setEditingId(check.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      checkNumber: "",
      amount: 0,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      bankName: "",
      accountHolder: "",
      status: "معلق",
      type: "صادر",
      notes: ""
    });
    setEditingId(null);
    setShowForm(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "مسحوب":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "معلق":
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case "ملغي":
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case "مرتجع":
        return <AlertCircle className="w-4 h-4 text-orange-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "مسحوب":
        return "bg-green-50 border-green-200";
      case "معلق":
        return "bg-yellow-50 border-yellow-200";
      case "ملغي":
        return "bg-red-50 border-red-200";
      case "مرتجع":
        return "bg-orange-50 border-orange-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const totalAmount = checks.reduce((sum, check) => sum + check.amount, 0);
  const outgoingAmount = checks.filter(c => c.type === "صادر").reduce((sum, check) => sum + check.amount, 0);
  const incomingAmount = checks.filter(c => c.type === "وارد").reduce((sum, check) => sum + check.amount, 0);
  const pendingAmount = checks.filter(c => c.status === "معلق").reduce((sum, check) => sum + check.amount, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">إدارة الشيكات</h1>
            <p className="text-gray-600 mt-1">تسجيل وتتبع الشيكات الصادرة والواردة</p>
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
        {loadError && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}<Button variant="outline" disabled={isSaving} className="mr-3" onClick={() => void loadChecks()}>إعادة المحاولة</Button></div>}
        {isLoading && <p className="mb-4 text-sm text-slate-600">جاري تحميل الشيكات من Supabase...</p>}
        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">إجمالي الشيكات</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-900">{checks.length}</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">إجمالي المبلغ</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-900">{totalAmount.toFixed(2)} ج.م</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">شيكات معلقة</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-yellow-600">{pendingAmount.toFixed(2)} ج.م</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">الفرق (وارد - صادر)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${incomingAmount - outgoingAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(incomingAmount - outgoingAmount).toFixed(2)} ج.م
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Add Check Button */}
        <div className="mb-8">
          <Button
            disabled={isSaving}
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            إضافة شيك جديد
          </Button>
        </div>

        {/* Form */}
        {showForm && (
          <Card className="border-0 shadow-sm mb-8">
            <CardHeader>
              <CardTitle>{editingId ? "تعديل الشيك" : "إضافة شيك جديد"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">رقم الشيك</label>
                  <input
                    type="text"
                    value={formData.checkNumber}
                    onChange={(e) => setFormData({ ...formData, checkNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="مثال: 123456"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">المبلغ</label>
                  <input
                    type="number"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">تاريخ الإصدار</label>
                  <input
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">تاريخ الاستحقاق</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">اسم البنك</label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="مثال: بنك مصر"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">صاحب الحساب</label>
                  <input
                    type="text"
                    value={formData.accountHolder}
                    onChange={(e) => setFormData({ ...formData, accountHolder: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="الاسم"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">نوع الشيك</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as BankCheckInput["type"] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="صادر">صادر</option>
                    <option value="وارد">وارد</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">الحالة</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as BankCheckInput["status"] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="معلق">معلق</option>
                    <option value="مسحوب">مسحوب</option>
                    <option value="ملغي">ملغي</option>
                    <option value="مرتجع">مرتجع</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">ملاحظات</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="أضف ملاحظات إضافية"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <Button
                  disabled={isSaving}
                  onClick={handleAddCheck}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {editingId ? "تحديث الشيك" : "إضافة الشيك"}
                </Button>
                <Button
                  disabled={isSaving}
                  onClick={resetForm}
                  variant="outline"
                >
                  إلغاء
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Checks List */}
        <div className="space-y-4">
          {checks.length === 0 && !isLoading && !loadError ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center">
                <p className="text-gray-600">لا توجد شيكات مسجلة حتى الآن</p>
              </CardContent>
            </Card>
          ) : (
            checks.map((check) => (
              <Card key={check.id} className={`border ${getStatusColor(check.status)} border-0 shadow-sm`}>
                <CardContent className="py-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        {getStatusIcon(check.status)}
                        <h3 className="text-lg font-semibold text-gray-900">الشيك #{check.checkNumber}</h3>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${check.type === "صادر" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                          {check.type}
                        </span>
                        <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
                          {check.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">المبلغ</p>
                          <p className="font-semibold text-gray-900">{check.amount.toFixed(2)} ج.م</p>
                        </div>
                        <div>
                          <p className="text-gray-600">البنك</p>
                          <p className="font-semibold text-gray-900">{check.bankName}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">تاريخ الاستحقاق</p>
                          <p className="font-semibold text-gray-900">{check.dueDate}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">صاحب الحساب</p>
                          <p className="font-semibold text-gray-900">{check.accountHolder}</p>
                        </div>
                      </div>

                      {check.notes && (
                        <div className="mt-3 p-3 bg-gray-100 rounded text-sm text-gray-700">
                          <strong>ملاحظات:</strong> {check.notes}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 mr-4">
                      <Button
                        disabled={isSaving}
                        onClick={() => handleEditCheck(check)}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        <Edit2 className="w-4 h-4" />
                        تعديل
                      </Button>
                      <Button
                        disabled={isSaving}
                        onClick={() => handleDeleteCheck(check.id)}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                        حذف
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
