import { useCallback, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Plus, Trash2, Edit2, TrendingDown, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { deleteCloudExpense, getCloudExpenseSummary, listCloudExpenses, saveCloudExpense, subscribeToExpenseChanges, type CloudExpense, type ExpenseSummary } from "@/lib/supabase/expenses";

const EXPENSE_CATEGORIES = [
  "الإيجار",
  "الكهرباء والماء",
  "الموظفين",
  "التسويق",
  "الصيانة",
  "النقل",
  "التأمين",
  "أخرى"
];

export default function Expenses() {
  const [, navigate] = useLocation();
  const [expenses, setExpenses] = useState<CloudExpense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary>({ totalRevenue: 0, totalProfit: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"daily" | "monthly" | "all">("all");
  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    category: "أخرى",
    date: new Date().toISOString().split('T')[0],
    type: "daily" as "daily" | "monthly",
    notes: ""
  });

  const loadCloudData = useCallback(async () => {
    setLoadError("");
    try {
      const [nextExpenses, nextSummary] = await Promise.all([listCloudExpenses(), getCloudExpenseSummary()]);
      setExpenses(nextExpenses);
      setSummary(nextSummary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تحميل المصروفات من Supabase.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => Promise<unknown>) | undefined;
    void loadCloudData();
    void subscribeToExpenseChanges(() => { if (active) void loadCloudData(); })
      .then(cleanup => { if (active) unsubscribe = cleanup; else void cleanup(); })
      .catch(error => { if (active) toast.error(error instanceof Error ? error.message : "تعذر تفعيل مزامنة المصروفات."); });
    return () => { active = false; if (unsubscribe) void unsubscribe(); };
  }, [loadCloudData]);

  const handleAddExpense = async () => {
    if (isSaving) return;
    const amount = Number(formData.amount);
    if (!formData.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error("أدخل اسم المصروفة ومبلغًا صحيحًا أكبر من صفر.");
      return;
    }
    const current = editingId ? expenses.find(expense => expense.id === editingId) : undefined;
    if (editingId && !current) {
      toast.error("لم تعد المصروفة موجودة في السجل السحابي. حدّث الصفحة قبل التعديل.");
      return;
    }
    setIsSaving(true);
    try {
      await saveCloudExpense({
        name: formData.name,
        amount,
        category: formData.category,
        date: formData.date,
        type: formData.type,
        notes: formData.notes,
      }, current ? { id: current.id, version: current.version } : undefined);
      toast.success(editingId ? "تم تحديث المصروفة في Supabase." : "تم حفظ المصروفة في Supabase.");
      setEditingId(null);
      resetForm();
      await loadCloudData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ المصروفة سحابيًا؛ لم تُحفظ محليًا.");
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      amount: "",
      category: "أخرى",
      date: new Date().toISOString().split('T')[0],
      type: "daily",
      notes: ""
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (expense: CloudExpense) => {
    setFormData({
      name: expense.name,
      amount: expense.amount.toString(),
      category: expense.category,
      date: expense.date,
      type: expense.type,
      notes: expense.notes
    });
    setEditingId(expense.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const expense = expenses.find(item => item.id === id);
    if (!expense || isSaving || !confirm("هل أنت متأكد من حذف هذه المصروفة من السجل السحابي؟")) return;
    setIsSaving(true);
    try {
      await deleteCloudExpense({ id: expense.id, version: expense.version });
      toast.success("تم حذف المصروفة من Supabase.");
      await loadCloudData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حذف المصروفة سحابيًا؛ لم يُحذف السجل.");
    } finally {
      setIsSaving(false);
    }
  };

  // حساب الإحصائيات
  const filteredExpenses = filterType === "all" 
    ? expenses 
    : expenses.filter(e => e.type === filterType);

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const dailyExpenses = expenses
    .filter(e => e.type === "daily")
    .reduce((sum, e) => sum + e.amount, 0);
  const monthlyExpenses = expenses
    .filter(e => e.type === "monthly")
    .reduce((sum, e) => sum + e.amount, 0);

  // حساب الإيرادات والأرباح
  const totalRevenue = summary.totalRevenue;
  const totalProfit = summary.totalProfit;
  const netProfit = totalProfit - (dailyExpenses + monthlyExpenses);
  const netProfitPercent = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // إحصائيات حسب الفئة
  const categoryStats = EXPENSE_CATEGORIES.map(cat => ({
    category: cat,
    amount: filteredExpenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0),
    count: filteredExpenses.filter(e => e.category === cat).length
  })).filter(s => s.amount > 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">إدارة المصاريف</h1>
            <p className="text-gray-600 mt-1">تتبع المصاريف اليومية والشهرية وحساب الربح النقدي</p>
          </div>
          <div className="flex gap-2">
            <Button
              disabled={isSaving}
              onClick={() => {
                setShowForm(!showForm);
                if (showForm) resetForm();
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              مصروفة جديدة
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard")}
            >
              العودة
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {loadError && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}<Button variant="outline" disabled={isSaving} className="mr-3" onClick={() => void loadCloudData()}>إعادة المحاولة</Button></div>}
        {isLoading && <p className="mb-4 text-sm text-slate-600">جاري تحميل المصروفات والملخص المالي من Supabase...</p>}
        {/* بطاقات الإحصائيات */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* إجمالي الإيرادات */}
          <Card className="border-0 shadow-sm bg-gradient-to-br from-green-50 to-emerald-50 border-l-4 border-green-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">إجمالي الإيرادات</p>
                  <p className="text-2xl font-bold text-green-600">{totalRevenue.toFixed(2)} ج.م</p>
                </div>
                <div className="text-4xl text-green-200">💰</div>
              </div>
            </CardContent>
          </Card>

          {/* إجمالي المصاريف */}
          <Card className="border-0 shadow-sm bg-gradient-to-br from-red-50 to-rose-50 border-l-4 border-red-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">إجمالي المصاريف</p>
                  <p className="text-2xl font-bold text-red-600">{(dailyExpenses + monthlyExpenses).toFixed(2)} ج.م</p>
                </div>
                <div className="text-4xl text-red-200">📉</div>
              </div>
            </CardContent>
          </Card>

          {/* الربح قبل المصاريف */}
          <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-cyan-50 border-l-4 border-blue-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">الربح قبل المصاريف</p>
                  <p className="text-2xl font-bold text-blue-600">{totalProfit.toFixed(2)} ج.م</p>
                </div>
                <div className="text-4xl text-blue-200">📊</div>
              </div>
            </CardContent>
          </Card>

          {/* الربح النقدي بعد المصاريف */}
          <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-indigo-50 border-l-4 border-purple-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">الربح النقدي (بعد المصاريف)</p>
                  <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                    {netProfit.toFixed(2)} ج.م
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{netProfitPercent.toFixed(1)}% من الإيرادات</p>
                </div>
                <div className="text-4xl">{netProfit >= 0 ? '✅' : '⚠️'}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* نموذج الإضافة */}
        {showForm && (
          <Card className="border-0 shadow-sm mb-8">
            <CardHeader>
              <CardTitle>{editingId ? "تعديل المصروفة" : "إضافة مصروفة جديدة"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">اسم المصروفة</label>
                  <Input
                    disabled={isSaving}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: إيجار المحل"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">المبلغ (ج.م)</label>
                  <Input
                    disabled={isSaving}
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="المبلغ"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">الفئة</label>
                  <select
                    disabled={isSaving}
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">النوع</label>
                  <select
                    disabled={isSaving}
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as "daily" | "monthly" })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="daily">يومي</option>
                    <option value="monthly">شهري</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">التاريخ</label>
                  <Input
                    disabled={isSaving}
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">ملاحظات</label>
                  <Input
                    disabled={isSaving}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="ملاحظات إضافية (اختياري)"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  disabled={isSaving}
                  onClick={handleAddExpense}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  {editingId ? "تحديث المصروفة" : "إضافة المصروفة"}
                </Button>
                <Button
                  disabled={isSaving}
                  onClick={resetForm}
                  variant="outline"
                  className="flex-1"
                >
                  إلغاء
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* فلاتر */}
        {expenses.length > 0 && (
          <div className="mb-6 flex gap-2">
            <Button
              onClick={() => setFilterType("all")}
              variant={filterType === "all" ? "default" : "outline"}
              className="flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              الكل ({expenses.length})
            </Button>
            <Button
              onClick={() => setFilterType("daily")}
              variant={filterType === "daily" ? "default" : "outline"}
            >
              يومي ({expenses.filter(e => e.type === "daily").length})
            </Button>
            <Button
              onClick={() => setFilterType("monthly")}
              variant={filterType === "monthly" ? "default" : "outline"}
            >
              شهري ({expenses.filter(e => e.type === "monthly").length})
            </Button>
          </div>
        )}

        {/* جدول المصاريف */}
        {expenses.length > 0 && (
          <Card className="border-0 shadow-sm mb-8">
            <CardHeader>
              <CardTitle>قائمة المصاريف</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b-2 border-gray-300">
                    <tr>
                      <th className="text-right px-4 py-3 font-bold">اسم المصروفة</th>
                      <th className="text-right px-4 py-3 font-bold">الفئة</th>
                      <th className="text-right px-4 py-3 font-bold">المبلغ</th>
                      <th className="text-right px-4 py-3 font-bold">النوع</th>
                      <th className="text-right px-4 py-3 font-bold">التاريخ</th>
                      <th className="text-center px-4 py-3 font-bold">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((expense) => (
                      <tr key={expense.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold">{expense.name}</td>
                        <td className="px-4 py-3 text-gray-600">{expense.category}</td>
                        <td className="px-4 py-3 text-red-600 font-bold">{expense.amount.toFixed(2)} ج.م</td>
                        <td className="px-4 py-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            expense.type === "daily" 
                              ? "bg-blue-100 text-blue-800" 
                              : "bg-purple-100 text-purple-800"
                          }`}>
                            {expense.type === "daily" ? "يومي" : "شهري"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{expense.date}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSaving}
                              onClick={() => handleEdit(expense)}
                            >
                              ✏️
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={isSaving}
                              onClick={() => handleDelete(expense.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* إحصائيات حسب الفئة */}
        {categoryStats.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5" />
                توزيع المصاريف حسب الفئة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {categoryStats.map((stat) => (
                  <div key={stat.category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-semibold text-gray-800">{stat.category}</p>
                      <p className="text-xs text-gray-500">{stat.count} عنصر</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">{stat.amount.toFixed(2)} ج.م</p>
                      <p className="text-xs text-gray-500">
                        {((stat.amount / totalExpenses) * 100).toFixed(1)}% من الإجمالي
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {expenses.length === 0 && !showForm && !isLoading && !loadError && (
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-center text-gray-600 py-8">لا توجد مصاريف حتى الآن. أضف مصروفة جديدة للبدء!</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
