import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Plus, Trash2, Edit2, TrendingDown, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Expense {
  id: string;
  name: string;
  amount: number;
  category: string;
  date: string;
  type: "daily" | "monthly";
  notes: string;
}

interface DailySalesData {
  date: string;
  totalRevenue: number;
  totalProfit: number;
}

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
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [salesData, setSalesData] = useState<DailySalesData[]>([]);
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

  useEffect(() => {
    loadExpenses();
    loadSalesData();
  }, []);

  const loadExpenses = () => {
    const saved = localStorage.getItem("abu_raghwa_expenses");
    if (saved) {
      setExpenses(JSON.parse(saved));
    }
  };

  const loadSalesData = () => {
    const saved = localStorage.getItem("abu_raghwa_sales");
    if (saved) {
      setSalesData(JSON.parse(saved));
    }
  };

  const saveExpenses = (updated: Expense[]) => {
    localStorage.setItem("abu_raghwa_expenses", JSON.stringify(updated));
    setExpenses(updated);
  };

  const handleAddExpense = () => {
    // جميع الحقول اختيارية

    if (editingId) {
      const updated = expenses.map(e =>
        e.id === editingId
          ? {
              ...e,
              name: formData.name,
              amount: parseFloat(formData.amount),
              category: formData.category,
              date: formData.date,
              type: formData.type,
              notes: formData.notes
            }
          : e
      );
      saveExpenses(updated);
      setEditingId(null);
    } else {
      const newExpense: Expense = {
        id: Date.now().toString(),
        name: formData.name,
        amount: parseFloat(formData.amount),
        category: formData.category,
        date: formData.date,
        type: formData.type,
        notes: formData.notes
      };
      saveExpenses([...expenses, newExpense]);
    }

    resetForm();
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
    setShowForm(false);
  };

  const handleEdit = (expense: Expense) => {
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

  const handleDelete = (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذه المصروفة؟")) {
      saveExpenses(expenses.filter(e => e.id !== id));
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
  const totalRevenue = salesData.reduce((sum, s) => sum + s.totalRevenue, 0);
  const totalProfit = salesData.reduce((sum, s) => sum + s.totalProfit, 0);
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
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: إيجار المحل"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">المبلغ (ج.م)</label>
                  <Input
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
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">ملاحظات</label>
                  <Input
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="ملاحظات إضافية (اختياري)"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleAddExpense}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  {editingId ? "تحديث المصروفة" : "إضافة المصروفة"}
                </Button>
                <Button
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
                              onClick={() => handleEdit(expense)}
                            >
                              ✏️
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
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

        {expenses.length === 0 && !showForm && (
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
