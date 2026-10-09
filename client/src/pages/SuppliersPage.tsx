import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Share2 } from "lucide-react";

interface Supplier {
  id: string;
  name: string;
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  date: string;
  products: string;
}

export default function SuppliersPage() {
  const [, navigate] = useLocation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    invoiceNumber: "",
    totalAmount: 0,
    paidAmount: 0,
    products: "",
  });

  const handleAddSupplier = () => {
    if (!formData.name) return;
    const newSupplier: Supplier = {
      id: Date.now().toString(),
      name: formData.name,
      invoiceNumber: formData.invoiceNumber,
      totalAmount: formData.totalAmount,
      paidAmount: formData.paidAmount,
      remainingAmount: formData.totalAmount - formData.paidAmount,
      date: new Date().toLocaleDateString("ar-EG"),
      products: formData.products,
    };
    setSuppliers([newSupplier, ...suppliers]);
    setFormData({ name: "", invoiceNumber: "", totalAmount: 0, paidAmount: 0, products: "" });
    setShowForm(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">الموردين</h1>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 ml-2" /> العودة
          </Button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Button onClick={() => setShowForm(!showForm)} className="mb-6 bg-blue-600">
          <Plus className="w-4 h-4 ml-2" /> إضافة مورد جديد
        </Button>
        {showForm && (
          <Card className="mb-6">
            <CardHeader><CardTitle>إضافة مورد جديد</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="اسم المورد" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="border rounded px-3 py-2" />
                <input type="text" placeholder="رقم الفاتورة" value={formData.invoiceNumber} onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })} className="border rounded px-3 py-2" />
                <input type="text" placeholder="المنتجات" value={formData.products} onChange={(e) => setFormData({ ...formData, products: e.target.value })} className="border rounded px-3 py-2" />
                <input type="number" placeholder="الإجمالي" value={formData.totalAmount} onChange={(e) => setFormData({ ...formData, totalAmount: parseFloat(e.target.value) })} className="border rounded px-3 py-2" />
                <input type="number" placeholder="المدفوع" value={formData.paidAmount} onChange={(e) => setFormData({ ...formData, paidAmount: parseFloat(e.target.value) })} className="border rounded px-3 py-2 md:col-span-2" />
              </div>
              <Button onClick={handleAddSupplier} className="mt-4 bg-green-600 w-full">حفظ المورد</Button>
            </CardContent>
          </Card>
        )}
        <div className="grid grid-cols-1 gap-4">
          {suppliers.map((supplier) => (
            <Card key={supplier.id}>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div><p className="text-sm text-gray-600">اسم المورد</p><p className="font-bold">{supplier.name}</p></div>
                  <div><p className="text-sm text-gray-600">رقم الفاتورة</p><p className="font-bold">{supplier.invoiceNumber}</p></div>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-4 bg-gray-50 p-4 rounded">
                  <div><p className="text-sm text-gray-600">الإجمالي</p><p className="font-bold text-lg">{supplier.totalAmount} ج.م</p></div>
                  <div><p className="text-sm text-gray-600">المدفوع</p><p className="font-bold text-lg text-green-600">{supplier.paidAmount} ج.م</p></div>
                  <div><p className="text-sm text-gray-600">المتبقي</p><p className={`font-bold text-lg ${supplier.remainingAmount > 0 ? "text-red-600" : "text-green-600"}`}>{supplier.remainingAmount} ج.م</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
