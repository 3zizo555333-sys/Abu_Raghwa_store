import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, DollarSign, Users, Edit2, Check, Package } from "lucide-react";
import { Input } from "@/components/ui/input";

interface DebtRecord {
  id: string;
  name: string;
  totalAmount: number;
  paidAmount: number;
  invoiceNumber?: string;
  products?: string;
  date: string;
  notes?: string;
}

export default function CreditPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"debts" | "receivables">("debts");
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [receivables, setReceivables] = useState<DebtRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ 
    name: "", 
    totalAmount: "", 
    paidAmount: "", 
    invoiceNumber: "", 
    products: "",
    notes: "" 
  });

  // Load data from localStorage
  useEffect(() => {
    const savedDebts = localStorage.getItem("abu_raghwa_debts");
    const savedReceivables = localStorage.getItem("abu_raghwa_receivables");
    if (savedDebts) setDebts(JSON.parse(savedDebts));
    if (savedReceivables) setReceivables(JSON.parse(savedReceivables));
  }, []);

  const handleAddRecord = () => {
    // جميع الحقول اختيارية

    const newRecord: DebtRecord = {
      id: editingId || Date.now().toString(),
      name: formData.name,
      totalAmount: parseFloat(formData.totalAmount),
      paidAmount: parseFloat(formData.paidAmount) || 0,
      invoiceNumber: formData.invoiceNumber,
      products: formData.products,
      date: new Date().toISOString(),
      notes: formData.notes
    };

    if (activeTab === "debts") {
      let updated;
      if (editingId) {
        updated = debts.map(d => d.id === editingId ? newRecord : d);
      } else {
        updated = [...debts, newRecord];
      }
      setDebts(updated);
      localStorage.setItem("abu_raghwa_debts", JSON.stringify(updated));
    } else {
      let updated;
      if (editingId) {
        updated = receivables.map(r => r.id === editingId ? newRecord : r);
      } else {
        updated = [...receivables, newRecord];
      }
      setReceivables(updated);
      localStorage.setItem("abu_raghwa_receivables", JSON.stringify(updated));
    }

    setFormData({ name: "", totalAmount: "", paidAmount: "", invoiceNumber: "", products: "", notes: "" });
    setShowForm(false);
    setEditingId(null);
  };

  const handleDeleteRecord = (id: string) => {
    if (confirm("هل أنت متأكد من الحذف؟")) {
      if (activeTab === "debts") {
        const updated = debts.filter(d => d.id !== id);
        setDebts(updated);
        localStorage.setItem("abu_raghwa_debts", JSON.stringify(updated));
      } else {
        const updated = receivables.filter(r => r.id !== id);
        setReceivables(updated);
        localStorage.setItem("abu_raghwa_receivables", JSON.stringify(updated));
      }
    }
  };

  const handleEditRecord = (record: DebtRecord) => {
    setFormData({
      name: record.name,
      totalAmount: record.totalAmount.toString(),
      paidAmount: record.paidAmount.toString(),
      invoiceNumber: record.invoiceNumber || "",
      products: record.products || "",
      notes: record.notes || ""
    });
    setEditingId(record.id);
    setShowForm(true);
  };

  const currentList = activeTab === "debts" ? debts : receivables;
  const totalAmount = currentList.reduce((sum, record) => sum + record.totalAmount, 0);
  const totalPaid = currentList.reduce((sum, record) => sum + record.paidAmount, 0);
  const totalRemaining = totalAmount - totalPaid;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">الأجل (كناش)</h1>
            <p className="text-gray-600 mt-1">تسجيل الديون والمستحقات</p>
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
        {/* Tabs */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Button
            onClick={() => {
              setActiveTab("debts");
              setShowForm(false);
              setEditingId(null);
              setFormData({ name: "", totalAmount: "", paidAmount: "", invoiceNumber: "", products: "", notes: "" });
            }}
            className={`py-6 text-lg font-semibold flex items-center justify-center gap-2 ${
              activeTab === "debts"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-gray-200 hover:bg-gray-300 text-gray-900"
            }`}
          >
            <Users className="w-5 h-5" />
            ديوني (العملاء)
          </Button>
          <Button
            onClick={() => {
              setActiveTab("receivables");
              setShowForm(false);
              setEditingId(null);
              setFormData({ name: "", totalAmount: "", paidAmount: "", invoiceNumber: "", products: "", notes: "" });
            }}
            className={`py-6 text-lg font-semibold flex items-center justify-center gap-2 ${
              activeTab === "receivables"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-200 hover:bg-gray-300 text-gray-900"
            }`}
          >
            <DollarSign className="w-5 h-5" />
            مستحقاتي (الموردين)
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="pt-6">
              <p className="text-gray-600 text-sm mb-2">الإجمالي الكلي</p>
              <p className="text-3xl font-bold text-blue-600">
                {totalAmount.toLocaleString("ar-EG")} ج.م
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-gradient-to-br from-green-50 to-green-100">
            <CardContent className="pt-6">
              <p className="text-gray-600 text-sm mb-2">المبلغ المدفوع</p>
              <p className="text-3xl font-bold text-green-600">
                {totalPaid.toLocaleString("ar-EG")} ج.م
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-gradient-to-br from-red-50 to-red-100">
            <CardContent className="pt-6">
              <p className="text-gray-600 text-sm mb-2">المتبقي</p>
              <p className="text-3xl font-bold text-red-600">
                {totalRemaining.toLocaleString("ar-EG")} ج.م
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Add New Record Form */}
        {showForm && (
          <Card className="border-0 shadow-sm mb-8 bg-gray-100">
            <CardHeader>
              <CardTitle>
                {editingId ? "تعديل" : "إضافة"} {activeTab === "debts" ? "دين جديد" : "مستحقة جديدة"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {activeTab === "debts" ? "اسم العميل" : "اسم المورد"} *
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={activeTab === "debts" ? "أحمد محمود" : "مورد المنظفات"}
                    className="text-right"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    المبلغ الإجمالي (ج.م) *
                  </label>
                  <Input
                    type="number"
                    value={formData.totalAmount}
                    onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                    placeholder="1000"
                    className="text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    المبلغ المدفوع (ج.م)
                  </label>
                  <Input
                    type="number"
                    value={formData.paidAmount}
                    onChange={(e) => setFormData({ ...formData, paidAmount: e.target.value })}
                    placeholder="0"
                    className="text-right"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    رقم الفاتورة
                  </label>
                  <Input
                    value={formData.invoiceNumber}
                    onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                    placeholder="INV-001"
                    className="text-right"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {activeTab === "debts" ? "البضاعة التي خدها العميل" : "البضاعة التي خدتها من المورد"}
                </label>
                <textarea
                  value={formData.products}
                  onChange={(e) => setFormData({ ...formData, products: e.target.value })}
                  placeholder={activeTab === "debts" ? "مثال: 10 علب منظف + 5 فرش" : "مثال: 20 كيس صابون + 10 علب معطر"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-right resize-none"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ملاحظات (اختياري)
                </label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="ملاحظات إضافية"
                  className="text-right"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleAddRecord}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Check className="w-4 h-4 ml-2" />
                  حفظ
                </Button>
                <Button
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setFormData({ name: "", totalAmount: "", paidAmount: "", invoiceNumber: "", products: "", notes: "" });
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  إلغاء
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add Button */}
        {!showForm && (
          <Button
            onClick={() => setShowForm(true)}
            className="w-full mb-8 bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg font-semibold flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            إضافة {activeTab === "debts" ? "دين جديد" : "مستحقة جديدة"}
          </Button>
        )}

        {/* Records List */}
        <div className="space-y-3">
          {currentList.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <p className="text-center text-gray-600 py-8">
                  لا توجد سجلات بعد. ابدأ بإضافة {activeTab === "debts" ? "دين" : "مستحقة"} جديدة
                </p>
              </CardContent>
            </Card>
          ) : (
            currentList.map((record) => {
              const remaining = record.totalAmount - record.paidAmount;
              return (
                <Card key={record.id} className="border-0 shadow-sm hover:shadow-md transition">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      {/* Header Row */}
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-lg text-gray-900">{record.name}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {new Date(record.date).toLocaleDateString("ar-EG")}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditRecord(record)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteRecord(record.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Invoice Number */}
                      {record.invoiceNumber && (
                        <div className="bg-blue-50 p-2 rounded text-sm">
                          <span className="text-gray-600">رقم الفاتورة: </span>
                          <span className="font-semibold text-blue-600">{record.invoiceNumber}</span>
                        </div>
                      )}

                      {/* Products */}
                      {record.products && (
                        <div className="bg-purple-50 p-3 rounded text-sm border-r-4 border-purple-600">
                          <div className="flex items-start gap-2">
                            <Package className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-gray-600 font-medium mb-1">
                                {activeTab === "debts" ? "البضاعة المُسلّمة:" : "البضاعة المستلمة:"}
                              </p>
                              <p className="text-gray-800 whitespace-pre-wrap">{record.products}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Amount Details */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-gray-50 p-3 rounded text-center">
                          <p className="text-xs text-gray-600">الإجمالي</p>
                          <p className="font-bold text-gray-900">
                            {record.totalAmount.toLocaleString("ar-EG")}
                          </p>
                        </div>
                        <div className="bg-green-50 p-3 rounded text-center">
                          <p className="text-xs text-gray-600">المدفوع</p>
                          <p className="font-bold text-green-600">
                            {record.paidAmount.toLocaleString("ar-EG")}
                          </p>
                        </div>
                        <div className={`p-3 rounded text-center ${remaining > 0 ? "bg-red-50" : "bg-green-50"}`}>
                          <p className="text-xs text-gray-600">المتبقي</p>
                          <p className={`font-bold ${remaining > 0 ? "text-red-600" : "text-green-600"}`}>
                            {remaining.toLocaleString("ar-EG")}
                          </p>
                        </div>
                      </div>

                      {/* Notes */}
                      {record.notes && (
                        <div className="bg-yellow-50 p-2 rounded text-sm">
                          <span className="text-gray-600">📝 </span>
                          <span className="text-yellow-800">{record.notes}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
