import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Share2 } from "lucide-react";

interface Check {
  id: string;
  customerName: string;
  employeeName: string;
  productsList: string;
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  date: string;
  time: string;
}

export default function ChecksPage() {
  const [, navigate] = useLocation();
  const [checks, setChecks] = useState<Check[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    customerName: "",
    employeeName: "",
    productsList: "",
    invoiceNumber: "",
    totalAmount: 0,
    paidAmount: 0,
  });

  const handleAddCheck = () => {
    if (!formData.customerName || !formData.employeeName) return;

    const newCheck: Check = {
      id: Date.now().toString(),
      customerName: formData.customerName,
      employeeName: formData.employeeName,
      productsList: formData.productsList,
      invoiceNumber: formData.invoiceNumber,
      totalAmount: formData.totalAmount,
      paidAmount: formData.paidAmount,
      remainingAmount: formData.totalAmount - formData.paidAmount,
      date: new Date().toLocaleDateString("ar-EG"),
      time: new Date().toLocaleTimeString("ar-EG"),
    };

    setChecks([newCheck, ...checks]);
    setFormData({
      customerName: "",
      employeeName: "",
      productsList: "",
      invoiceNumber: "",
      totalAmount: 0,
      paidAmount: 0,
    });
    setShowForm(false);
  };

  const handleDeleteCheck = (id: string) => {
    setChecks(checks.filter(check => check.id !== id));
  };

  const handleShareCheck = (check: Check) => {
    const message = `الشيك:\nالعميل: ${check.customerName}\nالموظف: ${check.employeeName}\nالمنتجات: ${check.productsList}\nرقم الفاتورة: ${check.invoiceNumber}\nالإجمالي: ${check.totalAmount} ج.م\nالمدفوع: ${check.paidAmount} ج.م\nالمتبقي: ${check.remainingAmount} ج.م`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">الشيكات (الآجل)</h1>
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

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Button
          onClick={() => setShowForm(!showForm)}
          className="mb-6 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="w-4 h-4 ml-2" />
          إضافة شيك جديد
        </Button>

        {showForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>إضافة شيك جديد</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="اسم العميل"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  className="border rounded px-3 py-2"
                />
                <input
                  type="text"
                  placeholder="اسم الموظف"
                  value={formData.employeeName}
                  onChange={(e) => setFormData({ ...formData, employeeName: e.target.value })}
                  className="border rounded px-3 py-2"
                />
                <input
                  type="text"
                  placeholder="المنتجات"
                  value={formData.productsList}
                  onChange={(e) => setFormData({ ...formData, productsList: e.target.value })}
                  className="border rounded px-3 py-2"
                />
                <input
                  type="text"
                  placeholder="رقم الفاتورة"
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                  className="border rounded px-3 py-2"
                />
                <input
                  type="number"
                  placeholder="الإجمالي"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({ ...formData, totalAmount: parseFloat(e.target.value) })}
                  className="border rounded px-3 py-2"
                />
                <input
                  type="number"
                  placeholder="المدفوع"
                  value={formData.paidAmount}
                  onChange={(e) => setFormData({ ...formData, paidAmount: parseFloat(e.target.value) })}
                  className="border rounded px-3 py-2"
                />
              </div>
              <Button
                onClick={handleAddCheck}
                className="mt-4 bg-green-600 hover:bg-green-700 text-white w-full"
              >
                حفظ الشيك
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4">
          {checks.map((check) => (
            <Card key={check.id}>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">العميل</p>
                    <p className="font-bold">{check.customerName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">الموظف</p>
                    <p className="font-bold">{check.employeeName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">التاريخ والوقت</p>
                    <p className="font-bold">{check.date} - {check.time}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">رقم الفاتورة</p>
                    <p className="font-bold">{check.invoiceNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">المنتجات</p>
                    <p className="font-bold">{check.productsList}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4 bg-gray-50 p-4 rounded">
                  <div>
                    <p className="text-sm text-gray-600">الإجمالي</p>
                    <p className="font-bold text-lg">{check.totalAmount} ج.م</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">المدفوع</p>
                    <p className="font-bold text-lg text-green-600">{check.paidAmount} ج.م</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">المتبقي</p>
                    <p className={`font-bold text-lg ${check.remainingAmount > 0 ? "text-red-600" : "text-green-600"}`}>
                      {check.remainingAmount} ج.م
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleShareCheck(check)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Share2 className="w-4 h-4 ml-2" />
                    مشاركة
                  </Button>
                  <Button
                    onClick={() => handleDeleteCheck(check.id)}
                    variant="destructive"
                    className="flex-1"
                  >
                    <Trash2 className="w-4 h-4 ml-2" />
                    حذف
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
