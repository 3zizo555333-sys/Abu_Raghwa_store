import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Upload, Trash2, Save, Download, Eye, X } from "lucide-react";
import { toast } from "sonner";

interface Invoice {
  id: string;
  image: string;
  uploadedDate: string;
  uploadedTime: string;
  fileName: string;
}

interface InvoiceCategory {
  id: string;
  name: string;
  invoices: Invoice[];
  createdDate: string;
  updatedDate: string;
}

export default function InvoiceCamera() {
  const [, navigate] = useLocation();
  const [categories, setCategories] = useState<InvoiceCategory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // تحميل البيانات من localStorage عند فتح الصفحة
  useEffect(() => {
    loadCategories();
  }, []);

  // تحذير عند محاولة الخروج مع وجود تغييرات غير محفوظة
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const loadCategories = () => {
    try {
      const saved = localStorage.getItem('invoice_categories');
      if (saved) {
        const parsed = JSON.parse(saved);
        setCategories(parsed);
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error('خطأ في تحميل البيانات:', error);
      toast.error('خطأ في تحميل البيانات');
    }
  };

  // حفظ البيانات في localStorage
  const saveCategories = async (updated: InvoiceCategory[]) => {
    setIsSaving(true);
    try {
      localStorage.setItem('invoice_categories', JSON.stringify(updated));
      setCategories(updated);
      setHasUnsavedChanges(false);
      toast.success('✅ تم حفظ البيانات بنجاح');
      return true;
    } catch (error) {
      console.error('خطأ في حفظ البيانات:', error);
      toast.error('❌ خطأ في حفظ البيانات');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCategory = async () => {
    if (!categoryName.trim()) {
      toast.error('الرجاء إدخال اسم الفئة');
      return;
    }

    const newCategory: InvoiceCategory = {
      id: Date.now().toString(),
      name: categoryName,
      invoices: [],
      createdDate: new Date().toLocaleDateString('ar-EG'),
      updatedDate: new Date().toLocaleDateString('ar-EG')
    };

    const updated = [newCategory, ...categories];
    await saveCategories(updated);
    setCategoryName("");
    setShowForm(false);
  };

  const handleUploadInvoice = (categoryId: string, useCamera: boolean = false) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (useCamera) {
      input.capture = "environment";
    }
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (file) {
        // التحقق من حجم الملف (الحد الأقصى 5MB)
        if (file.size > 5 * 1024 * 1024) {
          toast.error('حجم الملف كبير جداً (الحد الأقصى 5MB)');
          return;
        }

        const reader = new FileReader();
        reader.onload = async (event: any) => {
          const now = new Date();
          const newInvoice: Invoice = {
            id: Date.now().toString(),
            image: event.target.result,
            uploadedDate: now.toLocaleDateString('ar-EG'),
            uploadedTime: now.toLocaleTimeString('ar-EG'),
            fileName: file.name
          };

          const updated = categories.map(cat =>
            cat.id === categoryId
              ? {
                  ...cat,
                  invoices: [...cat.invoices, newInvoice],
                  updatedDate: now.toLocaleDateString('ar-EG')
                }
              : cat
          );

          setCategories(updated);
          setHasUnsavedChanges(true);
          toast.success('✅ تم إضافة الفاتورة (اضغط حفظ لتأكيد)');
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const deleteCategory = (categoryId: string) => {
    if (confirm('هل تريد حذف هذه الفئة وجميع الفواتير فيها؟')) {
      const updated = categories.filter(cat => cat.id !== categoryId);
      setCategories(updated);
      setHasUnsavedChanges(true);
      toast.success('✅ تم حذف الفئة (اضغط حفظ لتأكيد)');
    }
  };

  const deleteInvoice = (categoryId: string, invoiceId: string) => {
    const updated = categories.map(cat =>
      cat.id === categoryId
        ? {
            ...cat,
            invoices: cat.invoices.filter(inv => inv.id !== invoiceId)
          }
        : cat
    );
    setCategories(updated);
    setHasUnsavedChanges(true);
    toast.success('✅ تم حذف الفاتورة (اضغط حفظ لتأكيد)');
  };

  const handleSaveAll = async () => {
    await saveCategories(categories);
  };

  const exportToJSON = () => {
    const dataStr = JSON.stringify(categories, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `فواتير_أبو_رغوة_${new Date().toLocaleDateString('ar-EG')}.json`;
    link.click();
    toast.success('✅ تم تنزيل النسخة الاحتياطية');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">📸 تصوير الفواتير</h1>
            <p className="text-blue-100 mt-1">إدارة فواتيرك بسهولة وأمان</p>
          </div>
          <div className="flex items-center gap-3">
            {hasUnsavedChanges && (
              <span className="bg-yellow-400 text-gray-900 px-3 py-1 rounded-full text-sm font-semibold animate-pulse">
                ⚠️ تغييرات غير محفوظة
              </span>
            )}
            <Button
              onClick={handleSaveAll}
              disabled={!hasUnsavedChanges || isSaving}
              className="bg-green-500 hover:bg-green-600 text-white flex items-center gap-2"
            >
              <Save size={18} />
              {isSaving ? 'جاري الحفظ...' : 'حفظ البيانات'}
            </Button>
            <Button
              onClick={exportToJSON}
              variant="outline"
              className="text-white border-white hover:bg-white/20 flex items-center gap-2"
            >
              <Download size={18} />
              تنزيل نسخة احتياطية
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="text-white border-white hover:bg-white/20"
            >
              <ArrowLeft className="w-4 h-4 ml-2" /> العودة
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Add Category Form */}
        <div className="mb-8">
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 mb-4"
          >
            <Plus size={20} /> إضافة فئة جديدة
          </Button>

          {showForm && (
            <Card className="border-2 border-blue-400 shadow-lg">
              <CardHeader>
                <CardTitle>إضافة فئة جديدة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="اسم الفئة (مثل: مشتريات، مصاريف، إلخ)"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
                    className="flex-1 border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-blue-500 focus:outline-none"
                    autoFocus
                  />
                  <Button
                    onClick={handleAddCategory}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    إضافة
                  </Button>
                  <Button
                    onClick={() => {
                      setShowForm(false);
                      setCategoryName("");
                    }}
                    className="bg-gray-400 hover:bg-gray-500 text-white"
                  >
                    إلغاء
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 gap-6">
          {categories.length === 0 ? (
            <Card className="border-2 border-dashed border-gray-300">
              <CardContent className="py-16 text-center">
                <div className="text-6xl mb-4">📁</div>
                <p className="text-gray-600 text-lg font-semibold">لا توجد فئات بعد</p>
                <p className="text-gray-500 mt-2">أضف فئة جديدة لبدء حفظ الفواتير</p>
              </CardContent>
            </Card>
          ) : (
            categories.map((category) => (
              <Card key={category.id} className="border-2 hover:border-blue-400 hover:shadow-lg transition">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 flex flex-row items-center justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-2xl">{category.name}</CardTitle>
                    <div className="flex gap-4 mt-2 text-sm text-gray-600">
                      <span>📅 تم الإنشاء: {category.createdDate}</span>
                      <span>🔄 آخر تحديث: {category.updatedDate}</span>
                      <span>📄 عدد الفواتير: {category.invoices.length}</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => deleteCategory(category.id)}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Trash2 className="w-4 h-4" /> حذف الفئة
                  </Button>
                </CardHeader>

                <CardContent className="pt-6">
                  {category.invoices.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                      <div className="text-5xl mb-3">🖼️</div>
                      <p className="text-gray-600 font-semibold">لا توجد فواتير في هذه الفئة</p>
                      <p className="text-gray-500 text-sm mt-1">اضغط على "رفع فاتورة" لإضافة صور</p>
                    </div>
                  ) : (
                    <div className="mb-6">
                      <h4 className="font-bold text-gray-700 mb-4">الفواتير المحفوظة:</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {category.invoices.map((invoice) => (
                          <div key={invoice.id} className="relative group">
                            <div className="relative overflow-hidden rounded-lg border-2 border-gray-200 hover:border-blue-400 transition">
                              <img
                                src={invoice.image}
                                alt={invoice.fileName}
                                className="w-full h-48 object-cover cursor-pointer hover:scale-110 transition"
                                onClick={() => setSelectedImage(invoice.image)}
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                <button
                                  onClick={() => setSelectedImage(invoice.image)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full"
                                  title="عرض الصورة"
                                >
                                  <Eye size={18} />
                                </button>
                                <button
                                  onClick={() => deleteInvoice(category.id, invoice.id)}
                                  className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full"
                                  title="حذف الفاتورة"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                            <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                              <p className="font-semibold truncate">{invoice.fileName}</p>
                              <p>📅 {invoice.uploadedDate} - {invoice.uploadedTime}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleUploadInvoice(category.id, false)}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 py-6"
                    >
                      <Upload size={20} /> رفع من المعرض
                    </Button>
                    <Button
                      onClick={() => handleUploadInvoice(category.id, true)}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2 py-6"
                    >
                      📷 كاميرا
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>

      {/* Image Viewer Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-96 overflow-auto relative">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white p-2 rounded-full z-10"
            >
              <X size={24} />
            </button>
            <img src={selectedImage} alt="معاينة الفاتورة" className="w-full h-auto" />
          </div>
        </div>
      )}
    </div>
  );
}
