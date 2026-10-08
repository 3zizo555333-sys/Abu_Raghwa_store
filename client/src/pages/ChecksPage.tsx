import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { createCloudDeferredCheck, deleteCloudDeferredCheck, listCloudDeferredChecks, subscribeToCheckChanges, type CloudDeferredCheck } from "@/lib/supabase/checks";

type Check = CloudDeferredCheck;

function formatCreatedAt(value: string): string {
  const timestamp = new Date(value);
  return `${timestamp.toLocaleDateString("ar-EG")} - ${timestamp.toLocaleTimeString("ar-EG")}`;
}

export default function ChecksPage() {
  const [, navigate] = useLocation();
  const [checks, setChecks] = useState<Check[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    customerName: "",
    employeeName: "",
    productsList: "",
    invoiceNumber: "",
    totalAmount: 0,
    paidAmount: 0,
  });

  const loadChecks = useCallback(async () => {
    setLoadError("");
    try {
      setChecks(await listCloudDeferredChecks());
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تحميل القيود الآجلة من Supabase.";
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
      .catch(error => { if (active) toast.error(error instanceof Error ? error.message : "تعذر تفعيل تحديثات القيود الآجلة."); });
    return () => { active = false; if (unsubscribe) void unsubscribe(); };
  }, [loadChecks]);

  const handleAddCheck = async () => {
    const totalAmount = Number(formData.totalAmount);
    const paidAmount = Number(formData.paidAmount);
    if (isSaving) return;
    if (!formData.customerName.trim() || !formData.employeeName.trim() || !Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > totalAmount) {
      toast.error("أدخل اسم العميل والموظف وإجماليًا موجبًا ومدفوعًا لا يتجاوز الإجمالي.");
      return;
    }
    setIsSaving(true);
    try {
      await createCloudDeferredCheck({
        customerName: formData.customerName.trim(),
        employeeName: formData.employeeName.trim(),
        productsList: formData.productsList.trim(),
        invoiceNumber: formData.invoiceNumber.trim(),
        totalAmount,
        paidAmount,
      });
      toast.success("تم حفظ القيد الآجل في Supabase.");
      setFormData({ customerName: "", employeeName: "", productsList: "", invoiceNumber: "", totalAmount: 0, paidAmount: 0 });
      setShowForm(false);
      await loadChecks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ القيد سحابيًا؛ لم يُحفظ محليًا.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCheck = async (id: string) => {
    if (isSaving || !confirm("هل تريد حذف هذا القيد الآجل من السجل السحابي؟")) return;
    setIsSaving(true);
    try {
      await deleteCloudDeferredCheck(id);
      toast.success("تم حذف القيد الآجل من Supabase.");
      await loadChecks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حذف القيد سحابيًا؛ لم يُحذف السجل.");
    } finally {
      setIsSaving(false);
    }
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
          disabled={isSaving}
          onClick={() => setShowForm(!showForm)}
          className="mb-6 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="w-4 h-4 ml-2" />
          إضافة شيك جديد
        </Button>

        {loadError && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}<Button variant="outline" disabled={isSaving} className="mr-3" onClick={() => void loadChecks()}>إعادة المحاولة</Button></div>}
        {isLoading && <p className="mb-4 text-sm text-slate-600">جاري تحميل القيود الآجلة من Supabase...</p>}

        {showForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>إضافة شيك جديد</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  disabled={isSaving}
                  type="text"
                  placeholder="اسم العميل"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  className="border rounded px-3 py-2"
                />
                <input
                  disabled={isSaving}
                  type="text"
                  placeholder="اسم الموظف"
                  value={formData.employeeName}
                  onChange={(e) => setFormData({ ...formData, employeeName: e.target.value })}
                  className="border rounded px-3 py-2"
                />
                <input
                  disabled={isSaving}
                  type="text"
                  placeholder="المنتجات"
                  value={formData.productsList}
                  onChange={(e) => setFormData({ ...formData, productsList: e.target.value })}
                  className="border rounded px-3 py-2"
                />
                <input
                  disabled={isSaving}
                  type="text"
                  placeholder="رقم الفاتورة"
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                  className="border rounded px-3 py-2"
                />
                <input
                  disabled={isSaving}
                  type="number"
                  placeholder="الإجمالي"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({ ...formData, totalAmount: parseFloat(e.target.value) })}
                  className="border rounded px-3 py-2"
                />
                <input
                  disabled={isSaving}
                  type="number"
                  placeholder="المدفوع"
                  value={formData.paidAmount}
                  onChange={(e) => setFormData({ ...formData, paidAmount: parseFloat(e.target.value) })}
                  className="border rounded px-3 py-2"
                />
              </div>
              <Button
                disabled={isSaving}
                onClick={handleAddCheck}
                className="mt-4 bg-green-600 hover:bg-green-700 text-white w-full"
              >
                حفظ الشيك
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4">
          {!isLoading && !loadError && checks.length === 0 && <Card><CardContent className="py-10 text-center text-gray-600">لا توجد قيود آجلة مسجلة.</CardContent></Card>}
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
                    <p className="font-bold">{formatCreatedAt(check.createdAt)}</p>
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
                    disabled={isSaving}
                    onClick={() => handleShareCheck(check)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Share2 className="w-4 h-4 ml-2" />
                    مشاركة
                  </Button>
                  <Button
                    disabled={isSaving}
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
