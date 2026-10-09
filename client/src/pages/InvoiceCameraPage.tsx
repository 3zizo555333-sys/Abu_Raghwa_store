import { browserState } from "@/lib/browserState";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Camera, Plus, Trash2, Image as ImageIcon, Folder, Save, Download, Eye, X, ChevronRight, ChevronLeft, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { withPasswordProtection } from "@/components/withPasswordProtection";
import { trpc } from "@/lib/trpc";
import { useCloudState } from "@/lib/cloudSync";

interface InvoiceImage {
  id: string;
  url: string;
  uploadedDate: string;
  uploadedTime: string;
  fileName: string;
}

interface InvoiceCategory {
  id: string;
  name: string;
  invoices: InvoiceImage[];
  createdDate: string;
  updatedDate: string;
}

function InvoiceCameraPageContent() {
  const [, navigate] = useLocation();
  const [categories, setCategories] = useCloudState<InvoiceCategory[]>("abu_raghwa_invoice_categories_v2", [], { skipInitialSeed: true });
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // معرض الصور الاحترافي
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(100);
  const [isViewerImageLoading, setIsViewerImageLoading] = useState(false);
  const [viewerImageError, setViewerImageError] = useState(false);
  
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const legacyMigrationStarted = useRef(false);
  const uploadImageMutation = trpc.invoices.uploadImage.useMutation();
  const invoiceCloudQuery = trpc.sync.get.useQuery({ key: "abu_raghwa_invoice_categories_v2" });

  useEffect(() => {
    if (legacyMigrationStarted.current || categories.length > 0 || invoiceCloudQuery.data === undefined) return;
    // عند وجود معرض محفوظ بالفعل على السحابة، يقرأه useCloudState ولا ننقل نسخة محلية فوقه.
    if (invoiceCloudQuery.data !== null) return;
    legacyMigrationStarted.current = true;

    const migrateLegacyInvoices = async () => {
      try {
        const rawLegacy = browserState.get("abu_raghwa_invoice_categories") || browserState.get("invoice_categories");
        const legacyCategories = rawLegacy ? JSON.parse(rawLegacy) as InvoiceCategory[] : [];
        if (!Array.isArray(legacyCategories) || legacyCategories.length === 0) return;

        setIsSaving(true);
        const migrated = await Promise.all(legacyCategories.map(async category => ({
          ...category,
          invoices: await Promise.all((category.invoices || []).map(async invoice => {
            if (!invoice.url?.startsWith("data:image/")) return invoice;
            const uploaded = await uploadImageMutation.mutateAsync({ dataUrl: invoice.url, fileName: invoice.fileName || `invoice-${invoice.id}.jpg` });
            return { ...invoice, url: uploaded.url };
          })),
        })));
        setCategories(migrated);
        browserState.set("abu_raghwa_invoice_categories", JSON.stringify(migrated));
        setHasUnsavedChanges(false);
        toast.success("✅ تم نقل معرض الفواتير والصور إلى السحابة بنجاح");
      } catch (error) {
        console.error("خطأ في نقل صور الفواتير إلى السحابة:", error);
        toast.error("تعذر نقل بعض صور الفواتير تلقائياً؛ ستظل ظاهرة على هذا الجهاز ويمكن إعادة حفظها.");
      } finally {
        setIsSaving(false);
      }
    };

    void migrateLegacyInvoices();
  }, [categories.length, invoiceCloudQuery.data, setCategories, uploadImageMutation]);

  const saveCategories = async (updated: InvoiceCategory[]) => {
    setIsSaving(true);
    try {
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
    if (!newCategoryName.trim()) {
      toast.error('❌ الرجاء إدخال اسم الفئة');
      return;
    }

    const now = new Date();
    const newCategory: InvoiceCategory = {
      id: Date.now().toString(),
      name: newCategoryName,
      invoices: [],
      createdDate: now.toLocaleDateString('ar-EG'),
      updatedDate: now.toLocaleDateString('ar-EG')
    };

    const updated = [...categories, newCategory];
    const success = await saveCategories(updated);
    if (success) {
      setNewCategoryName("");
      setShowNewCategory(false);
      setSelectedCategory(newCategory.id);
      toast.success('📁 تم إنشاء الفئة بنجاح');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الفئة وجميع فواتيرها؟")) return;
    const updated = categories.filter(c => c.id !== categoryId);
    await saveCategories(updated);
    if (selectedCategory === categoryId) {
      setSelectedCategory(null);
    }
    toast.success('🗑️ تم حذف الفئة بنجاح');
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedCategory) return;

    const file = files[0];
    const reader = new FileReader();

    reader.onload = async (event) => {
      const result = event.target?.result as string;
      if (!result) return;

      try {
        setIsSaving(true);
        const uploaded = await uploadImageMutation.mutateAsync({ dataUrl: result, fileName: file.name || `فاتورة_${Date.now()}` });
        const now = new Date();
        const newInvoice: InvoiceImage = {
          id: Date.now().toString(),
          url: uploaded.url,
          uploadedDate: now.toLocaleDateString('ar-EG'),
          uploadedTime: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          fileName: file.name || `فاتورة_${Date.now()}`
        };

        const updated = categories.map(cat => {
          if (cat.id === selectedCategory) {
            return {
              ...cat,
              invoices: [newInvoice, ...cat.invoices],
              updatedDate: now.toLocaleDateString('ar-EG')
            };
          }
          return cat;
        });

        await saveCategories(updated);
        toast.success('📸 تمت إضافة الفاتورة بنجاح للمعرض والسحابة');
      } catch (error) {
        console.error("خطأ في رفع صورة الفاتورة:", error);
        toast.error("تعذر رفع صورة الفاتورة إلى السحابة. تحقق من الاتصال وحاول مرة أخرى.");
      } finally {
        setIsSaving(false);
      }
    };

    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteInvoice = async (catId: string, invoiceId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الفاتورة نهائياً؟")) return;

    const updated = categories.map(cat => {
      if (cat.id === catId) {
        return {
          ...cat,
          invoices: cat.invoices.filter(inv => inv.id !== invoiceId),
          updatedDate: new Date().toLocaleDateString('ar-EG')
        };
      }
      return cat;
    });

    await saveCategories(updated);
    // إغلاق المعرض أو تعديل المؤشر إن تم الحذف أثناء العرض
    if (currentIndex !== null) {
      setCurrentIndex(null);
    }
    toast.success('🗑️ تم حذف الفاتورة بنجاح');
  };

  const selectedCategoryData = categories.find(c => c.id === selectedCategory);
  const currentInvoices = selectedCategoryData?.invoices || [];
  const activeInvoice = currentIndex !== null && currentInvoices[currentIndex] ? currentInvoices[currentIndex] : null;

  useEffect(() => {
    currentInvoices.forEach(invoice => {
      const image = new Image();
      image.src = invoice.url;
    });
  }, [selectedCategory, categories]);

  const openInvoiceViewer = (index: number) => {
    const invoice = currentInvoices[index];
    if (!invoice) return;
    setCurrentIndex(index);
    setZoom(100);
    setViewerImageError(false);
    setIsViewerImageLoading(true);
  };

  const moveInvoiceViewer = (direction: -1 | 1) => {
    if (currentIndex === null) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= currentInvoices.length) return;
    openInvoiceViewer(nextIndex);
  };

  useEffect(() => {
    if (currentIndex === null) return;
    const handleViewerKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCurrentIndex(null);
      if (event.key === "ArrowRight") moveInvoiceViewer(-1);
      if (event.key === "ArrowLeft") moveInvoiceViewer(1);
    };
    window.addEventListener("keydown", handleViewerKeyboard);
    return () => window.removeEventListener("keydown", handleViewerKeyboard);
  }, [currentIndex, currentInvoices.length]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm mb-6">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" /> رجوع للوحة التحكم
            </Button>
            <h1 className="text-xl font-bold text-gray-800">📸 معرض تصوير وإدارة الفواتير</h1>
          </div>
          <Button
            onClick={() => setShowNewCategory(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 font-bold"
          >
            <Plus className="w-4 h-4" /> إضافة فئة فواتير جديدة
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Categories Sidebar */}
          <div className="lg:col-span-1">
            <Card className="border-2 border-blue-200 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardTitle className="text-lg">فئات الفواتير</CardTitle>
                <CardDescription>اختر فئة لعرض فواتيرها أو إضافتها</CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-3">
                  {categories.length === 0 ? (
                    <p className="text-gray-500 text-center py-6 text-sm">لا توجد فئات مسجلة. اضغط على إضافة فئة جديدة.</p>
                  ) : (
                    categories.map((category) => (
                      <div
                        key={category.id}
                        className={`p-3 rounded-xl cursor-pointer transition border-2 ${
                          selectedCategory === category.id
                            ? "bg-blue-100 border-blue-600 shadow-md"
                            : "bg-gray-50 hover:bg-gray-100 border-gray-200"
                        }`}
                        onClick={() => setSelectedCategory(category.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-sm text-gray-800">{category.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">📄 {category.invoices.length} فاتورة مسجلة</p>
                          </div>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCategory(category.id);
                            }}
                            className="bg-red-500 hover:bg-red-600 h-8 w-8 p-0 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Invoices Display */}
          <div className="lg:col-span-2">
            {selectedCategory && selectedCategoryData ? (
              <div className="space-y-6">
                {/* Category Header */}
                <Card className="border-2 border-indigo-200 shadow-lg">
                  <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50">
                    <CardTitle className="text-2xl">{selectedCategoryData.name}</CardTitle>
                    <CardDescription>
                      📅 تم الإنشاء: {selectedCategoryData.createdDate} | 🔄 آخر تحديث: {selectedCategoryData.updatedDate}
                    </CardDescription>
                    <CardDescription className="mt-1 font-bold text-indigo-700">
                      📄 إجمالي الفواتير المتاحة: {selectedCategoryData.invoices.length}
                    </CardDescription>
                  </CardHeader>
                </Card>

                {/* Upload Options */}
                <Card className="border-2 border-green-200 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">إضافة فاتورة جديدة</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Button
                        onClick={() => cameraRef.current?.click()}
                        className="bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center gap-2 py-6 font-bold text-base shadow"
                      >
                        <Camera className="w-6 h-6" />
                        📷 تصوير مباشر بالكاميرا
                      </Button>
                      <Button
                        onClick={() => fileRef.current?.click()}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white flex items-center justify-center gap-2 py-6 font-bold text-base shadow"
                      >
                        <ImageIcon className="w-6 h-6" />
                        🖼️ رفع من معرض الصور
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Invoices Grid */}
                {selectedCategoryData.invoices.length === 0 ? (
                  <Card className="border-2 border-dashed border-gray-300">
                    <CardContent className="py-12 text-center">
                      <ImageIcon size={48} className="mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-600 font-semibold">لا توجد فواتير في هذه الفئة</p>
                      <p className="text-gray-500 text-sm mt-2">اضغط على "تصوير مباشر بالكاميرا" أو "رفع من معرض الصور"</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-2 border-blue-200 shadow-lg">
                    <CardHeader>
                      <CardTitle>معرض الفواتير المحفوظة</CardTitle>
                      <CardDescription>اضغط على أي فاتورة لفتح المعرض الاحترافي والتكبير والتصغير والتنقل</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {selectedCategoryData.invoices.map((invoice, idx) => (
                          <div key={invoice.id} className="relative group">
                            <div className="relative overflow-hidden rounded-xl border-2 border-gray-200 hover:border-blue-500 shadow-sm transition bg-white">
                              <img
                                src={invoice.url}
                                alt={invoice.fileName}
                                className="w-full h-48 object-cover cursor-pointer hover:scale-105 transition duration-300"
                                loading="eager"
                                decoding="async"
                                onClick={() => openInvoiceViewer(idx)}
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                <Button
                                  size="sm"
                                  onClick={() => openInvoiceViewer(idx)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full h-10 w-10 p-0 shadow-lg"
                                  title="فتح المعرض"
                                >
                                  <Eye size={18} />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleDeleteInvoice(selectedCategory, invoice.id)}
                                  className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-full h-10 w-10 p-0 shadow-lg"
                                  title="حذف الفاتورة"
                                >
                                  <Trash2 size={18} />
                                </Button>
                              </div>
                            </div>
                            <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                              <p className="font-bold truncate text-gray-800">{invoice.fileName}</p>
                              <p className="text-gray-500 mt-0.5">📅 {invoice.uploadedDate} - {invoice.uploadedTime}</p>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => openInvoiceViewer(idx)}
                                className="mt-2 w-full bg-blue-600 font-bold text-white hover:bg-blue-700"
                              >
                                <Eye className="ml-1 h-4 w-4" /> فتح الفاتورة
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card className="border-2 border-dashed border-gray-300">
                <CardContent className="py-20 text-center">
                  <Folder size={64} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-700 font-bold text-lg">اختر فئة من القائمة الجانبية</p>
                  <p className="text-gray-500 mt-2">أو أنشئ فئة جديدة لبدء عرض وتصوير الفواتير</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Hidden File Inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraCapture}
        className="hidden"
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleCameraCapture}
        className="hidden"
      />

      {/* New Category Modal */}
      {showNewCategory && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-blue-200 animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-gray-800 mb-3">📁 إضافة فئة فواتير جديدة</h3>
            <p className="text-sm text-gray-600 mb-4">أدخل اسم الفئة (مثلاً: فواتير الموردين شهر يوليو، فواتير الكهرباء، إلخ)</p>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="اسم الفئة..."
              className="mb-4 text-base"
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowNewCategory(false)}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleAddCategory}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                إنشاء الفئة
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Professional Gallery Modal */}
      {currentIndex !== null && activeInvoice && (
        <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-between z-50 p-4 text-white">
          {/* Top Bar */}
          <div className="w-full max-w-6xl flex items-center justify-between bg-gray-900/80 backdrop-blur p-4 rounded-2xl border border-gray-700">
            <div>
              <h3 className="font-bold text-base md:text-lg text-white truncate max-w-md">{activeInvoice.fileName}</h3>
              <p className="text-xs text-gray-400">الفاتورة رقم {(currentIndex ?? 0) + 1} من {currentInvoices.length} | 📅 {activeInvoice.uploadedDate}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = activeInvoice.url;
                  link.download = `${activeInvoice.fileName}.jpg`;
                  link.click();
                  toast.success("📥 تم تنزيل الفاتورة بنجاح");
                }}
                className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs md:text-sm"
              >
                <Download className="w-4 h-4 mr-1" /> تحميل
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  handleDeleteInvoice(selectedCategory!, activeInvoice.id);
                }}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs md:text-sm"
              >
                <Trash2 className="w-4 h-4 mr-1" /> حذف
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setCurrentIndex(null); setViewerImageError(false); setIsViewerImageLoading(false); }}
                className="text-gray-300 hover:text-white hover:bg-gray-800"
              >
                <X className="w-6 h-6" />
              </Button>
            </div>
          </div>

          {/* Main Viewer Area with Previous / Next Buttons */}
          <div className="relative flex-1 w-full max-w-6xl flex items-center justify-center overflow-hidden my-4">
            {/* Previous Button */}
            {currentIndex > 0 && (
              <button
                onClick={() => moveInvoiceViewer(-1)}
                className="absolute right-2 md:right-6 z-20 bg-black/60 hover:bg-black/90 text-white p-3 rounded-full backdrop-blur border border-white/20 transition shadow-2xl"
                title="الفاتورة السابقة"
              >
                <ChevronRight size={28} />
              </button>
            )}

            {/* Image with Zoom */}
            <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
              {isViewerImageLoading && (
                <div className="absolute z-10 flex flex-col items-center gap-3 rounded-2xl bg-black/75 px-6 py-5 text-center">
                  <ImageIcon className="h-8 w-8 animate-pulse text-blue-300" />
                  <p className="text-sm font-bold">يتم فتح الفاتورة الآن...</p>
                </div>
              )}
              {viewerImageError && (
                <div className="absolute z-10 max-w-sm rounded-2xl bg-red-950/95 p-5 text-center shadow-2xl">
                  <p className="text-sm font-bold">تعذر تحميل الصورة الآن.</p>
                  <Button type="button" size="sm" onClick={() => window.open(activeInvoice.url, "_blank", "noopener,noreferrer")} className="mt-3 bg-white text-red-800 hover:bg-red-100">
                    فتح الصورة في نافذة مستقلة
                  </Button>
                </div>
              )}
              <img
                src={activeInvoice.url}
                alt={activeInvoice.fileName}
                className={`max-h-[70vh] object-contain rounded-xl shadow-2xl transition-transform duration-200 cursor-zoom-in ${isViewerImageLoading || viewerImageError ? "opacity-0" : "opacity-100"}`}
                style={{ transform: `scale(${zoom / 100})` }}
                onClick={() => setZoom(zoom === 100 ? 150 : zoom === 150 ? 200 : 100)}
                onLoad={() => { setIsViewerImageLoading(false); setViewerImageError(false); }}
                onError={() => { setIsViewerImageLoading(false); setViewerImageError(true); }}
              />
            </div>

            {/* Next Button */}
            {currentIndex < currentInvoices.length - 1 && (
              <button
                onClick={() => moveInvoiceViewer(1)}
                className="absolute left-2 md:left-6 z-20 bg-black/60 hover:bg-black/90 text-white p-3 rounded-full backdrop-blur border border-white/20 transition shadow-2xl"
                title="الفاتورة التالية"
              >
                <ChevronLeft size={28} />
              </button>
            )}
          </div>

          {/* Bottom Controls Bar */}
          <div className="w-full max-w-xl bg-gray-900/80 backdrop-blur p-3 rounded-2xl border border-gray-700 flex items-center justify-center gap-4">
            <Button
              size="sm"
              onClick={() => setZoom(Math.max(50, zoom - 25))}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              <ZoomOut className="w-4 h-4 mr-1" /> تصغير
            </Button>
            <span className="text-sm font-bold min-w-[60px] text-center text-yellow-400">
              {zoom}%
            </span>
            <Button
              size="sm"
              onClick={() => setZoom(Math.min(300, zoom + 25))}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              <ZoomIn className="w-4 h-4 mr-1" /> تكبير
            </Button>
            <Button
              size="sm"
              onClick={() => setZoom(100)}
              className="bg-gray-700 hover:bg-gray-600 text-white font-bold"
            >
              <RotateCcw className="w-4 h-4 mr-1" /> إعادة ضبط
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export const InvoiceCameraPage = withPasswordProtection(InvoiceCameraPageContent, "invoices", "معرض الفواتير");
export default InvoiceCameraPage;
