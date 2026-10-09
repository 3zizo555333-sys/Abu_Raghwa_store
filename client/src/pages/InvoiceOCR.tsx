import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Camera, Upload, Check, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ParsedItem {
  name: string;
  quantity: number;
  unit: string;
  price: number;
  confidence: number;
}

export default function InvoiceOCR() {
  const [, navigate] = useLocation();
  const [invoiceImage, setInvoiceImage] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [supplier, setSupplier] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setInvoiceImage(imageData);
      processInvoice(imageData);
    };
    reader.readAsDataURL(file);
  };

  const processInvoice = async (imageData: string) => {
    setIsProcessing(true);
    
    // محاكاة معالجة OCR
    // في تطبيق حقيقي، ستستخدم Google ML Kit أو Tesseract
    setTimeout(() => {
      const mockItems: ParsedItem[] = [
        { name: "دقيق", quantity: 25, unit: "كيلو", price: 150, confidence: 0.95 },
        { name: "سكر", quantity: 10, unit: "كيلو", price: 80, confidence: 0.92 },
        { name: "زيت", quantity: 5, unit: "لتر", price: 200, confidence: 0.88 },
        { name: "بيض", quantity: 100, unit: "حبة", price: 0.5, confidence: 0.85 }
      ];
      
      setParsedItems(mockItems);
      setIsProcessing(false);
    }, 2000);
  };

  const handleConfirmItems = () => {
    if (!supplier || parsedItems.length === 0) {
      alert("يرجى ملء اسم المورد والتأكد من العناصر");
      return;
    }

    const materials = JSON.parse(localStorage.getItem("abu_raghwa_raw_materials") || "[]");
    
    parsedItems.forEach((item) => {
      const existingMaterial = materials.find((m: any) => m.name === item.name);
      
      if (existingMaterial) {
        existingMaterial.quantity += item.quantity;
        existingMaterial.price = item.price;
        existingMaterial.pricePerKilo = item.price / item.quantity;
      } else {
        materials.push({
          id: Date.now().toString() + Math.random(),
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          price: item.price * item.quantity,
          wholesalePrice: item.price * item.quantity,
          pricePerKilo: item.price,
          createdDate: new Date().toLocaleDateString("ar-EG"),
          supplier: supplier,
          invoiceDate: invoiceDate
        });
      }
    });

    localStorage.setItem("abu_raghwa_raw_materials", JSON.stringify(materials));
    alert("تم استيراد الفاتورة بنجاح!");
    
    setInvoiceImage(null);
    setParsedItems([]);
    setSupplier("");
  };

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...parsedItems];
    updated[index] = { ...updated[index], [field]: value };
    setParsedItems(updated);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">استيراد فواتير المورد</h1>
            <p className="text-gray-600 mt-1">قراءة الفواتير بالكاميرا أو الرفع</p>
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
        {!invoiceImage ? (
          <Card className="border-0 shadow-sm mb-8">
            <CardHeader>
              <CardTitle>اختر طريقة الاستيراد</CardTitle>
              <CardDescription>استخدم الكاميرا أو رفع صورة الفاتورة</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center">
                  <Camera className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">التقط صورة</h3>
                  <p className="text-gray-600 mb-4">استخدم كاميرا جهازك</p>
                  <Button
                    onClick={() => cameraInputRef.current?.click()}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    فتح الكاميرا
                  </Button>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => e.target.files && handleImageUpload(e.target.files[0])}
                    className="hidden"
                  />
                </div>

                <div className="border-2 border-dashed border-green-300 rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 text-green-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">رفع صورة</h3>
                  <p className="text-gray-600 mb-4">اختر صورة من جهازك</p>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    اختر ملف
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files && handleImageUpload(e.target.files[0])}
                    className="hidden"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Invoice Preview */}
            <Card className="mb-8 border-0 shadow-sm">
              <CardHeader>
                <CardTitle>معاينة الفاتورة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <img
                      src={invoiceImage}
                      alt="Invoice"
                      className="w-full rounded-lg border border-gray-300"
                    />
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">اسم المورد *</label>
                      <Input
                        placeholder="مثال: مورد الدقيق الأول"
                        value={supplier}
                        onChange={(e) => setSupplier(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">تاريخ الفاتورة</label>
                      <input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>

                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <AlertCircle className="w-4 h-4 inline mr-2" />
                        جاري معالجة الفاتورة بواسطة OCR...
                      </p>
                    </div>

                    <Button
                      onClick={() => {
                        setInvoiceImage(null);
                        setParsedItems([]);
                      }}
                      variant="outline"
                      className="w-full"
                    >
                      إلغاء
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Parsed Items */}
            {parsedItems.length > 0 && (
              <Card className="border-0 shadow-sm mb-8">
                <CardHeader>
                  <CardTitle>العناصر المستخرجة من الفاتورة</CardTitle>
                  <CardDescription>تحقق من البيانات وعدّلها إذا لزم الأمر</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-3 text-right text-sm font-medium">اسم الخامة</th>
                          <th className="px-4 py-3 text-right text-sm font-medium">الكمية</th>
                          <th className="px-4 py-3 text-right text-sm font-medium">الوحدة</th>
                          <th className="px-4 py-3 text-right text-sm font-medium">السعر</th>
                          <th className="px-4 py-3 text-right text-sm font-medium">الثقة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedItems.map((item, idx) => (
                          <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <Input
                                value={item.name}
                                onChange={(e) => updateItem(idx, "name", e.target.value)}
                                className="text-sm"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value))}
                                className="text-sm"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={item.unit}
                                onChange={(e) => updateItem(idx, "unit", e.target.value)}
                                className="text-sm px-2 py-1 border border-gray-300 rounded"
                              >
                                <option value="كيلو">كيلو</option>
                                <option value="جرام">جرام</option>
                                <option value="لتر">لتر</option>
                                <option value="حبة">حبة</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                type="number"
                                value={item.price}
                                onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value))}
                                className="text-sm"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {item.confidence > 0.9 ? (
                                  <Check className="w-4 h-4 text-green-600" />
                                ) : (
                                  <AlertCircle className="w-4 h-4 text-orange-600" />
                                )}
                                <span className="text-sm">{(item.confidence * 100).toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-4 mt-6">
                    <Button
                      onClick={handleConfirmItems}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      تأكيد واستيراد
                    </Button>
                    <Button
                      onClick={() => {
                        setInvoiceImage(null);
                        setParsedItems([]);
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
          </>
        )}
      </main>
    </div>
  );
}
