import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus } from "lucide-react";

interface InventoryItem {
  id: string;
  name: string;
  unitPrice: number;
  bulkUnitPrice: number;
  bulkPiecePrice: number;
  quantity: number;
}

export default function InventoryPage() {
  const [, navigate] = useLocation();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    unitPrice: 0,
    bulkUnitPrice: 0,
    bulkPiecePrice: 0,
    quantity: 0,
  });

  const handleAddItem = () => {
    if (!formData.name) return;
    setInventory([{ id: Date.now().toString(), ...formData }, ...inventory]);
    setFormData({ name: "", unitPrice: 0, bulkUnitPrice: 0, bulkPiecePrice: 0, quantity: 0 });
    setShowForm(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">المخزن</h1>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 ml-2" /> العودة
          </Button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Button onClick={() => setShowForm(!showForm)} className="mb-6 bg-blue-600">
          <Plus className="w-4 h-4 ml-2" /> إضافة بضاعة جديدة
        </Button>
        {showForm && (
          <Card className="mb-6">
            <CardHeader><CardTitle>إضافة بضاعة جديدة</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="اسم البضاعة" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="border rounded px-3 py-2 md:col-span-2" />
                <input type="number" placeholder="سعر الوحدة" value={formData.unitPrice} onChange={(e) => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) })} className="border rounded px-3 py-2" />
                <input type="number" placeholder="سعر جملة الوحدة" value={formData.bulkUnitPrice} onChange={(e) => setFormData({ ...formData, bulkUnitPrice: parseFloat(e.target.value) })} className="border rounded px-3 py-2" />
                <input type="number" placeholder="سعر جملة القطعة" value={formData.bulkPiecePrice} onChange={(e) => setFormData({ ...formData, bulkPiecePrice: parseFloat(e.target.value) })} className="border rounded px-3 py-2" />
                <input type="number" placeholder="الكمية" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) })} className="border rounded px-3 py-2" />
              </div>
              <Button onClick={handleAddItem} className="mt-4 bg-green-600 w-full">حفظ البضاعة</Button>
            </CardContent>
          </Card>
        )}
        <div className="grid grid-cols-1 gap-4">
          {inventory.map((item) => (
            <Card key={item.id}>
              <CardContent className="pt-6">
                <p className="font-bold text-lg mb-4">{item.name}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><p className="text-sm text-gray-600">سعر الوحدة</p><p className="font-bold">{item.unitPrice} ج.م</p></div>
                  <div><p className="text-sm text-gray-600">جملة الوحدة</p><p className="font-bold">{item.bulkUnitPrice} ج.م</p></div>
                  <div><p className="text-sm text-gray-600">جملة القطعة</p><p className="font-bold">{item.bulkPiecePrice} ج.م</p></div>
                  <div><p className="text-sm text-gray-600">الكمية</p><p className="font-bold">{item.quantity}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
