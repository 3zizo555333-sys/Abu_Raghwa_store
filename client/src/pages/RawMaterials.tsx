import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Edit2, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { withPasswordProtection } from "@/components/withPasswordProtection";

interface RawMaterial {
  id: string;
  name: string;
  supplier: string;
  unit: string;
  totalWeight: number;
  quantity: number;
  totalPrice: number;
  wholesalePrice: number;
  pricePerKilo: number;
  createdDate: string;
  description?: string;
  usage?: string;
  ratio?: string;
}

function RawMaterialsContent() {
  const [, navigate] = useLocation();
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingDetailsId, setEditingDetailsId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    supplier: "",
    unit: "كيلو",
    totalWeight: "",
    quantity: "",
    totalPrice: "",
    wholesalePrice: ""
  });
  const [detailsForm, setDetailsForm] = useState({
    description: "",
    usage: "",
    ratio: ""
  });

  useEffect(() => {
    loadMaterials();
  }, []);

  const loadMaterials = () => {
    const saved = localStorage.getItem("abu_raghwa_raw_materials");
    if (saved) {
      setMaterials(JSON.parse(saved));
    }
  };

  const saveMaterials = (updated: RawMaterial[]) => {
    localStorage.setItem("abu_raghwa_raw_materials", JSON.stringify(updated));
    setMaterials(updated);
  };

  const calculatePricePerKilo = (totalWeight: number, totalPrice: number) => {
    if (totalWeight === 0) return 0;
    return totalPrice / totalWeight;
  };

  const handleAddMaterial = () => {
    // جميع الحقول اختيارية

    const totalWeight = parseFloat(formData.totalWeight);
    const quantity = parseInt(formData.quantity) || 1;
    const totalPrice = parseFloat(formData.totalPrice);
    const wholesalePrice = formData.wholesalePrice ? parseFloat(formData.wholesalePrice) : totalPrice;
    const pricePerKilo = calculatePricePerKilo(totalWeight, totalPrice);

    if (editingId) {
      const updated = materials.map(m =>
        m.id === editingId
          ? {
              ...m,
              name: formData.name,
              supplier: formData.supplier,
              unit: formData.unit,
              totalWeight,
              quantity,
              totalPrice,
              wholesalePrice,
              pricePerKilo
            }
          : m
      );
      saveMaterials(updated);
      setEditingId(null);
    } else {
      const newMaterial: RawMaterial = {
        id: Date.now().toString(),
        name: formData.name,
        supplier: formData.supplier,
        unit: formData.unit,
        totalWeight,
        quantity,
        totalPrice,
        wholesalePrice,
        pricePerKilo,
        createdDate: new Date().toISOString(),
        description: "",
        usage: "",
        ratio: ""
      };
      saveMaterials([...materials, newMaterial]);
    }

    setFormData({
      name: "",
      supplier: "",
      unit: "كيلو",
      totalWeight: "",
      quantity: "",
      totalPrice: "",
      wholesalePrice: ""
    });
    setShowForm(false);
  };

  const handleEdit = (material: RawMaterial) => {
    setFormData({
      name: material.name,
      supplier: material.supplier,
      unit: material.unit,
      totalWeight: material.totalWeight.toString(),
      quantity: material.quantity.toString(),
      totalPrice: material.totalPrice.toString(),
      wholesalePrice: material.wholesalePrice.toString()
    });
    setEditingId(material.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذه الخامة؟")) {
      saveMaterials(materials.filter(m => m.id !== id));
    }
  };

  const handleSaveDetails = (materialId: string) => {
    const updated = materials.map(m =>
      m.id === materialId
        ? {
            ...m,
            description: detailsForm.description,
            usage: detailsForm.usage,
            ratio: detailsForm.ratio
          }
        : m
    );
    saveMaterials(updated);
    setEditingDetailsId(null);
    setDetailsForm({ description: "", usage: "", ratio: "" });
  };

  const handleOpenDetails = (material: RawMaterial) => {
    setEditingDetailsId(material.id);
    setDetailsForm({
      description: material.description || "",
      usage: material.usage || "",
      ratio: material.ratio || ""
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">قائمة الخامات</h1>
            <p className="text-gray-600 mt-1">إدارة الخامات والمواد الخام</p>
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
        {/* Add Material Form */}
        {showForm && (
          <Card className="border-0 shadow-sm mb-8">
            <CardHeader>
              <CardTitle>{editingId ? "تعديل الخامة" : "إضافة خامة جديدة"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">اسم الخامة</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="اسم الخامة"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">اسم المورد</label>
                  <Input
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    placeholder="اسم المورد"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">نوع الوحدة</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="كيلو">كيلو</option>
                    <option value="جرام">جرام</option>
                    <option value="لتر">لتر</option>
                    <option value="ملل">ملل</option>
                    <option value="عبوة">عبوة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">الوزن الكلي للكمية</label>
                  <Input
                    type="number"
                    value={formData.totalWeight}
                    onChange={(e) => setFormData({ ...formData, totalWeight: e.target.value })}
                    placeholder="الوزن الكلي"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">الكمية</label>
                  <Input
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder="الكمية"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">سعر الجملة للكمية</label>
                  <Input
                    type="number"
                    value={formData.totalPrice}
                    onChange={(e) => setFormData({ ...formData, totalPrice: e.target.value })}
                    placeholder="السعر الكلي"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">سعر الجملة (اختياري)</label>
                  <Input
                    type="number"
                    value={formData.wholesalePrice}
                    onChange={(e) => setFormData({ ...formData, wholesalePrice: e.target.value })}
                    placeholder="سعر الجملة"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleAddMaterial}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  {editingId ? "تحديث الخامة" : "إضافة الخامة"}
                </Button>
                <Button
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setFormData({
                      name: "",
                      supplier: "",
                      unit: "كيلو",
                      totalWeight: "",
                      quantity: "",
                      totalPrice: "",
                      wholesalePrice: ""
                    });
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

        {/* Add Material Button */}
        {!showForm && (
          <Button
            onClick={() => setShowForm(true)}
            className="mb-8 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            إضافة خامة جديدة
          </Button>
        )}

        {/* Materials List */}
        <div className="grid grid-cols-1 gap-6">
          {materials.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <p className="text-center text-gray-600">لا توجد خامات بعد</p>
              </CardContent>
            </Card>
          ) : (
            materials.map((material) => (
              <div key={material.id}>
                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle>{material.name}</CardTitle>
                        <CardDescription>المورد: {material.supplier}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => setExpandedId(expandedId === material.id ? null : material.id)}
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          {expandedId === material.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleEdit(material)}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(material.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-600">الوزن الكلي</p>
                        <p className="text-lg font-bold text-blue-600">{material.totalWeight} {material.unit}</p>
                      </div>

                      <div className="bg-green-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-600">السعر الكلي</p>
                        <p className="text-lg font-bold text-green-600">{material.totalPrice.toFixed(2)} ج.م</p>
                      </div>

                      <div className="bg-purple-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-600">سعر الكيلو الواحد</p>
                        <p className="text-lg font-bold text-purple-600">{material.pricePerKilo.toFixed(2)} ج.م</p>
                      </div>

                      <div className="bg-gray-100 p-3 rounded-lg">
                        <p className="text-sm text-gray-600">الكمية</p>
                        <p className="text-lg font-bold text-gray-900">{material.quantity}</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-xs text-gray-600">
                        تاريخ الإضافة: {new Date(material.createdDate).toLocaleDateString("ar-EG")}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Expanded Details Section */}
                {expandedId === material.id && (
                  <Card className="border-0 shadow-sm mt-4 bg-blue-50">
                    <CardHeader>
                      <CardTitle className="text-lg">تفاصيل الخامة</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {editingDetailsId === material.id ? (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">النبذة</label>
                            <textarea
                              value={detailsForm.description}
                              onChange={(e) => setDetailsForm({ ...detailsForm, description: e.target.value })}
                              className="w-full border rounded px-3 py-2"
                              rows={3}
                              placeholder="اكتب نبذة عن الخامة"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">الاستخدامات</label>
                            <textarea
                              value={detailsForm.usage}
                              onChange={(e) => setDetailsForm({ ...detailsForm, usage: e.target.value })}
                              className="w-full border rounded px-3 py-2"
                              rows={3}
                              placeholder="اكتب استخدامات الخامة"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">النسبة</label>
                            <Input
                              value={detailsForm.ratio}
                              onChange={(e) => setDetailsForm({ ...detailsForm, ratio: e.target.value })}
                              placeholder="اكتب نسبة الاستخدام"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleSaveDetails(material.id)}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                            >
                              حفظ التفاصيل
                            </Button>
                            <Button
                              onClick={() => setEditingDetailsId(null)}
                              variant="outline"
                              className="flex-1"
                            >
                              إلغاء
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <p className="text-sm font-medium text-gray-600">النبذة</p>
                            <p className="text-gray-900">{material.description || "لم يتم إضافة نبذة بعد"}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-600">الاستخدامات</p>
                            <p className="text-gray-900">{material.usage || "لم يتم إضافة استخدامات بعد"}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-600">النسبة</p>
                            <p className="text-gray-900">{material.ratio || "لم يتم إضافة نسبة بعد"}</p>
                          </div>
                          <Button
                            onClick={() => handleOpenDetails(material)}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            تعديل التفاصيل
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

export default withPasswordProtection(RawMaterialsContent, 'materials', 'الخامات');
