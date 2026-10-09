import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLocation } from 'wouter';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertCircle, Search, TrendingUp, BarChart3, Eye, X, ClipboardPaste, ArrowRightLeft, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';

interface InventoryItem {
  id: string;
  name: string;
  supplier: string;
  location: string;
  unit: string;
  piecesPerUnit: number;
  quantity: number;
  extraPieces: number;
  wholesalePrice: number;
  retailPrice: number;
  wholesaleRetailPrice: number;
  category: string;
  createdAt: string;
}

interface InventoryLog {
  id: string;
  itemId: string;
  itemName: string;
  type: 'in' | 'out';
  quantity: number;
  date: string;
  time: string;
}

const UNITS = ['كرتونة', 'بالة', 'شكارة', 'علبة', 'دسته', 'شرينك', 'قطعة', 'كيلو'];
const STORAGE_KEY = 'abu_raghwa_apartment_items';
const CATEGORIES_KEY = 'abu_raghwa_apartment_categories';

export default function ApartmentManagement() {
  const [, navigate] = useLocation();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showProductsList, setShowProductsList] = useState(false);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [moveCategory, setMoveCategory] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    supplier: '',
    location: '',
    unit: '',
    piecesPerUnit: 0,
    quantity: 0,
    extraPieces: 0,
    wholesalePrice: 0,
    retailPrice: 0,
    wholesaleRetailPrice: 0,
    category: '',
  });

  // تحميل البيانات من localStorage عند بدء التطبيق
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch (error) {
        console.error('خطأ في تحميل البيانات:', error);
      }
    }
  }, []);

  useEffect(() => {
    const savedCategories = localStorage.getItem(CATEGORIES_KEY);
    if (savedCategories) {
      try { setCategoryNames(JSON.parse(savedCategories)); } catch { setCategoryNames([]); }
    }
  }, []);

  // حفظ البيانات في localStorage كلما تغيرت
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categoryNames));
  }, [categoryNames]);

  // حساب إجمالي القطع
  const calculateTotalPieces = (quantity: number, piecesPerUnit: number, extraPieces: number) => {
    return quantity * piecesPerUnit + extraPieces;
  };

  // حساب إجمالي القيمة المالية للمنتج (كراتين + قطع إضافية)
  const calculateProductValue = (quantity: number, wholesalePrice: number, extraPieces: number, piecesPerUnit: number) => {
    const cartonValue = quantity * wholesalePrice;
    const piecePrice = piecesPerUnit > 0 ? wholesalePrice / piecesPerUnit : 0;
    const extraPiecesValue = extraPieces * piecePrice;
    return cartonValue + extraPiecesValue;
  };

  // حساب سعر جملة القطعة
  const calculatePiecePrice = (wholesalePrice: number, piecesPerUnit: number) => {
    if (piecesPerUnit === 0) return 0;
    return parseFloat((wholesalePrice / piecesPerUnit).toFixed(2));
  };

  // حساب نسبة الربح
  const calculateProfitMargin = (piecePrice: number, wholesaleRetailPrice: number) => {
    if (piecePrice === 0) return 0;
    return parseFloat((((wholesaleRetailPrice - piecePrice) / piecePrice) * 100).toFixed(2));
  };

  // إضافة منتج جديد
  const handleAddProduct = () => {
    if (!formData.name || !formData.category) {
      toast.error('الرجاء ملء الحقول المطلوبة (الاسم والفئة)');
      return;
    }

    const newItem: InventoryItem = {
      id: Date.now().toString(),
      ...formData,
      createdAt: new Date().toISOString(),
    };

    setItems([...items, newItem]);
    setFormData({
      name: '',
      supplier: '',
      location: '',
      unit: '',
      piecesPerUnit: 0,
      quantity: 0,
      extraPieces: 0,
      wholesalePrice: 0,
      retailPrice: 0,
      wholesaleRetailPrice: 0,
      category: '',
    });
    toast.success('✅ تم إضافة المنتج بنجاح');
  };

  // حذف منتج
  const handleDeleteProduct = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
      setItems(items.filter(item => item.id !== id));
      toast.success('✅ تم حذف المنتج');
    }
  };

  // تحديث كمية المنتج
  const handleQuantityChange = (id: string, newQuantity: number) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, quantity: Math.max(0, newQuantity) } : item
    ));
  };

  // تحديث القطع الإضافية
  const handleExtraPiecesChange = (id: string, newExtraPieces: number) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, extraPieces: Math.max(0, newExtraPieces) } : item
    ));
  };

  // البحث المتقدم
  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;
    const lowerSearch = searchTerm.toLowerCase();
    return items.filter(item =>
      item.name.toLowerCase().includes(lowerSearch) ||
      item.category.toLowerCase().includes(lowerSearch) ||
      item.supplier.toLowerCase().includes(lowerSearch)
    );
  }, [items, searchTerm]);

  const availableCategories = useMemo(() => Array.from(new Set([...categoryNames, ...items.map(item => item.category).filter(Boolean)])), [categoryNames, items]);

  const addCategory = () => {
    const category = newCategoryName.trim();
    if (!category) return;
    if (!availableCategories.includes(category)) setCategoryNames(prev => [...prev, category]);
    setFormData(prev => ({ ...prev, category }));
    setBulkCategory(category);
    setNewCategoryName('');
    toast.success(`تمت إضافة الفئة: ${category}`);
  };

  const toggleItemSelection = (id: string) => setSelectedItemIds(prev => prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]);
  const toggleCategorySelection = (categoryItems: InventoryItem[]) => {
    const ids = categoryItems.map(item => item.id);
    const allSelected = ids.every(id => selectedItemIds.includes(id));
    setSelectedItemIds(prev => allSelected ? prev.filter(id => !ids.includes(id)) : Array.from(new Set([...prev, ...ids])));
  };
  const moveSelectedItems = () => {
    const category = moveCategory.trim();
    if (!category || selectedItemIds.length === 0) return;
    setItems(prev => prev.map(item => selectedItemIds.includes(item.id) ? { ...item, category } : item));
    if (!availableCategories.includes(category)) setCategoryNames(prev => [...prev, category]);
    setSelectedItemIds([]);
    setMoveCategory('');
    toast.success('تم نقل المنتجات المحددة إلى الفئة الجديدة');
  };
  const deleteSelectedItems = () => {
    if (!selectedItemIds.length || !confirm(`حذف ${selectedItemIds.length} منتجًا محددًا؟`)) return;
    setItems(prev => prev.filter(item => !selectedItemIds.includes(item.id)));
    setSelectedItemIds([]);
    toast.success('تم حذف المنتجات المحددة');
  };
  const importBulkItems = () => {
    const category = bulkCategory.trim();
    const names = bulkText.split(/\r?\n/).map(line => line.split(/[,\t،]/)[0]?.trim()).filter(Boolean);
    if (!category || !names.length) {
      toast.error('اختر فئة والصق اسم منتج واحدًا على الأقل');
      return;
    }
    const now = new Date().toISOString();
    const imported: InventoryItem[] = names.map((name, index) => ({
      id: `apartment_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
      name, supplier: '', location: '', unit: '', piecesPerUnit: 0, quantity: 0, extraPieces: 0,
      wholesalePrice: 0, retailPrice: 0, wholesaleRetailPrice: 0, category, createdAt: now,
    }));
    setItems(prev => [...prev, ...imported]);
    if (!availableCategories.includes(category)) setCategoryNames(prev => [...prev, category]);
    setBulkText('');
    setShowBulkImport(false);
    toast.success(`تمت إضافة ${imported.length} منتجًا في فئة ${category}`);
  };

  // تجميع حسب الفئات
  const categorizedItems = useMemo(() => {
    const grouped: { [key: string]: InventoryItem[] } = {};
    filteredItems.forEach(item => {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    });
    return grouped;
  }, [filteredItems]);

  // حساب إجمالي قيمة الفئة (تشمل القطع الإضافية)
  const calculateCategoryTotal = (categoryItems: InventoryItem[]) => {
    return categoryItems.reduce((sum, item) => {
      return sum + calculateProductValue(item.quantity, item.wholesalePrice, item.extraPieces, item.piecesPerUnit);
    }, 0);
  };

  // حساب إجمالي قيمة جميع المنتجات
  const calculateTotalInventoryValue = () => {
    return items.reduce((sum, item) => {
      return sum + calculateProductValue(item.quantity, item.wholesalePrice, item.extraPieces, item.piecesPerUnit);
    }, 0);
  };

  // ملخص يومي
  const dailySummary = useMemo(() => {
    const today = new Date().toLocaleDateString('ar-EG');
    const todayLogs = logs.filter(log => log.date === today);

    const inTotal = todayLogs
      .filter(log => log.type === 'in')
      .reduce((sum, log) => sum + log.quantity, 0);

    const outTotal = todayLogs
      .filter(log => log.type === 'out')
      .reduce((sum, log) => sum + log.quantity, 0);

    return { inTotal, outTotal };
  }, [logs]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 flex items-center gap-3">
              🏪 إدارة الشقة والمخزن
            </h1>
            <p className="text-slate-600 mt-2">إدارة شاملة للمنتجات والأسعار والكميات والتقارير</p>
          </div>
          <Button
            onClick={() => navigate('/')}
            variant="outline"
            className="gap-2"
          >
            ← العودة للرئيسية
          </Button>
        </div>



        {/* شريط البحث */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute right-3 top-3 text-slate-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="ابحث عن منتج أو فئة أو مورد..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10 py-2 text-right"
            />
          </div>
        </div>

        <Card className="mb-8 border-2 border-indigo-200">
          <CardHeader className="bg-indigo-50">
            <CardTitle className="flex items-center gap-2 text-right"><CheckSquare className="w-5 h-5" /> فئات الشقة والإضافة الجماعية</CardTitle>
            <CardDescription>أضف فئة، اخترها، ثم الصق أسماء المنتجات لإضافتها كلّها داخلها.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col gap-2 md:flex-row">
              <Input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="اكتب اسم فئة جديدة" className="text-right" />
              <Button type="button" onClick={addCategory} className="bg-indigo-600 hover:bg-indigo-700">إضافة الفئة</Button>
              <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-right">
                <option value="">اختر فئة للمنتج</option>
                {availableCategories.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
              <Button type="button" variant="outline" onClick={() => setShowBulkImport(value => !value)} className="gap-2"><ClipboardPaste className="h-4 w-4" /> نسخ ولصق جماعي</Button>
            </div>
            {showBulkImport && (
              <div className="rounded-xl border border-indigo-200 bg-white p-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-right">
                    <option value="">اختر الفئة التي ستوضع فيها المنتجات</option>
                    {availableCategories.map(category => <option key={category} value={category}>{category}</option>)}
                  </select>
                  <Input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="أو اكتب فئة جديدة ثم اضغط إضافة الفئة" className="text-right" />
                </div>
                <Textarea value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder="الصق هنا: كل منتج في سطر مستقل" className="min-h-32 text-right" />
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button type="button" onClick={addCategory} variant="outline">حفظ الفئة الجديدة</Button>
                  <Button type="button" onClick={importBulkItems} className="bg-green-600 hover:bg-green-700">إضافة المنتجات للفئة</Button>
                  <Button type="button" onClick={() => setBulkText('')} variant="ghost">مسح النص</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* نموذج إضافة منتج جديد */}
        <Card className="mb-8 border-2 border-blue-200">
          <CardHeader className="bg-blue-50">
            <CardTitle className="flex items-center gap-2 text-right">
              <Plus className="w-5 h-5" />
              إضافة منتج جديد للمخزن
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">اسم المنتج</label>
                <Input
                  placeholder="مثال: قهوة عربية"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="text-right"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">المورد</label>
                <Input
                  placeholder="مثال: شركة النيل"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  className="text-right"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">مكان التخزين</label>
                <Input
                  placeholder="مثال: الرف 1 - الزاوية اليمنى"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="text-right"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">الفئة</label>
                <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right">
                  <option value="">-- اختر فئة --</option>
                  {availableCategories.map(category => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">نوع الوحدة</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                >
                  <option value="">-- اختر وحدة --</option>
                  {UNITS.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">عدد القطع داخل الوحدة</label>
                <Input
                  type="number"
                  placeholder="مثال: 24"
                  value={formData.piecesPerUnit || ''}
                  onChange={(e) => setFormData({ ...formData, piecesPerUnit: parseFloat(e.target.value) || 0 })}
                  className="text-right"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">عدد الوحدات (الكراتين)</label>
                <Input
                  type="number"
                  placeholder="مثال: 10"
                  value={formData.quantity || ''}
                  onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                  className="text-right"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">القطع الإضافية</label>
                <Input
                  type="number"
                  placeholder="مثال: 5"
                  value={formData.extraPieces || ''}
                  onChange={(e) => setFormData({ ...formData, extraPieces: parseFloat(e.target.value) || 0 })}
                  className="text-right"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">سعر جملة الوحدة</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="مثال: 100.50"
                  value={formData.wholesalePrice || ''}
                  onChange={(e) => setFormData({ ...formData, wholesalePrice: parseFloat(e.target.value) || 0 })}
                  className="text-right"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">سعر بيع التجزئة</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="مثال: 150.75"
                  value={formData.retailPrice || ''}
                  onChange={(e) => setFormData({ ...formData, retailPrice: parseFloat(e.target.value) || 0 })}
                  className="text-right"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">سعر بيع القطاعي</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="مثال: 12.50"
                  value={formData.wholesaleRetailPrice || ''}
                  onChange={(e) => setFormData({ ...formData, wholesaleRetailPrice: parseFloat(e.target.value) || 0 })}
                  className="text-right"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <Button
                onClick={() => setFormData({
                  name: '',
                  supplier: '',
                  location: '',
                  unit: '',
                  piecesPerUnit: 0,
                  quantity: 0,
                  extraPieces: 0,
                  wholesalePrice: 0,
                  retailPrice: 0,
                  wholesaleRetailPrice: 0,
                  category: '',
                })}
                variant="outline"
              >
                🔄 إعادة تعيين
              </Button>
              <Button
                onClick={handleAddProduct}
                className="bg-green-600 hover:bg-green-700"
              >
                💾 حفظ المنتج
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* قسم عرض المنتجات المسجلة */}
        <Card className="mb-8 border-2 border-green-300">
          <CardHeader className="bg-green-50">
            <CardTitle className="flex items-center gap-2 text-right">
              <Eye className="w-5 h-5" />
              عرض المنتجات المسجلة
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {items.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-600 text-lg">لا توجد منتجات مسجلة حتى الآن</p>
                <p className="text-slate-500 text-sm mt-2">أضف منتجات جديدة من خلال النموذج أعلاه</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.length === 0 ? (
                  <p className="text-center text-slate-600">لا توجد نتائج تطابق البحث</p>
                ) : (
                  filteredItems.map(item => {
                    const totalPieces = calculateTotalPieces(item.quantity, item.piecesPerUnit, item.extraPieces);
                    const productValue = calculateProductValue(item.quantity, item.wholesalePrice, item.extraPieces, item.piecesPerUnit);
                    const piecePrice = calculatePiecePrice(item.wholesalePrice, item.piecesPerUnit);

                    return (
                      <div
                        key={item.id}
                        className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg hover:shadow-md transition-all"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-lg font-bold text-slate-900">{item.name}</h3>
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{item.category}</span>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">المورد</p>
                                <p className="font-semibold text-slate-900">{item.supplier || '-'}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">الموقع</p>
                                <p className="font-semibold text-slate-900">{item.location || '-'}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">الوحدة</p>
                                <p className="font-semibold text-slate-900">{item.unit}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">إجمالي القطع</p>
                                <p className="font-bold text-blue-600 text-lg">{totalPieces}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">الكراتين</p>
                                <p className="font-bold text-slate-900">{item.quantity}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">القطع الإضافية</p>
                                <p className="font-bold text-slate-900">{item.extraPieces}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">سعر الجملة</p>
                                <p className="font-semibold text-slate-900">{item.wholesalePrice.toFixed(2)} ج.م</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">سعر القطعة</p>
                                <p className="font-semibold text-slate-900">{piecePrice.toFixed(2)} ج.م</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">إجمالي القيمة</p>
                                <p className="font-bold text-green-600 text-lg">{productValue.toFixed(2)} ج.م</p>
                              </div>
                            </div>
                          </div>
                          
                          <Button
                            onClick={() => handleDeleteProduct(item.id)}
                            variant="destructive"
                            size="sm"
                            className="mt-2"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* إحصائيات سريعة */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="pt-6">
              <div className="text-center">
                <BarChart3 className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <p className="text-slate-600 text-sm">عدد المنتجات</p>
                <p className="text-3xl font-bold text-blue-600">{items.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100">
            <CardContent className="pt-6">
              <div className="text-center">
                <TrendingUp className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="text-slate-600 text-sm">إجمالي قيمة المخزون</p>
                <p className="text-2xl font-bold text-green-600">
                  {calculateTotalInventoryValue().toFixed(2)} ج.م
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100">
            <CardContent className="pt-6">
              <div className="text-center">
                <Search className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <p className="text-slate-600 text-sm">عدد الفئات</p>
                <p className="text-3xl font-bold text-purple-600">{Object.keys(categorizedItems).length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* قائمة المنتجات مجمعة حسب الفئات */}
        <div className="space-y-6">
          {Object.entries(categorizedItems).length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-slate-600">
                لا توجد منتجات مطابقة للبحث
              </CardContent>
            </Card>
          ) : (
            Object.entries(categorizedItems).map(([category, categoryItems]) => (
              <Card key={category} className="overflow-hidden border-2 border-slate-200">
                <CardHeader
                  className="bg-gradient-to-r from-slate-100 to-slate-50 cursor-pointer hover:from-slate-200 hover:to-slate-100 transition-all"
                  onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedCategory === category ? (
                        <ChevronUp className="w-5 h-5 text-slate-600" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-600" />
                      )}
                      <div className="text-right">
                        <CardTitle className="text-lg">{category}</CardTitle>
                        <CardDescription>
                          {categoryItems.length} منتج | إجمالي القيمة: {calculateCategoryTotal(categoryItems).toFixed(2)} ج.م
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={event => event.stopPropagation()}>
                      <Button type="button" size="sm" variant="outline" onClick={() => toggleCategorySelection(categoryItems)}>تحديد الكل</Button>
                    </div>
                  </div>
                </CardHeader>

                {expandedCategory === category && (
                  <CardContent className="pt-6">
                    {selectedItemIds.length > 0 && (
                      <div className="mb-4 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                        <span className="text-sm font-semibold text-indigo-800">تم تحديد {selectedItemIds.length}</span>
                        <select value={moveCategory} onChange={e => setMoveCategory(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-right">
                          <option value="">اختر فئة النقل</option>
                          {availableCategories.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                        <Button type="button" onClick={moveSelectedItems} className="gap-2 bg-indigo-600 hover:bg-indigo-700"><ArrowRightLeft className="h-4 w-4" /> نقل المحدد</Button>
                        <Button type="button" onClick={deleteSelectedItems} variant="destructive" className="gap-2"><Trash2 className="h-4 w-4" /> حذف المحدد</Button>
                        <Button type="button" onClick={() => setSelectedItemIds([])} variant="ghost">إلغاء التحديد</Button>
                      </div>
                    )}
                    <div className="space-y-4">
                      {categoryItems.map(item => {
                        const totalPieces = calculateTotalPieces(item.quantity, item.piecesPerUnit, item.extraPieces);
                        const productValue = calculateProductValue(item.quantity, item.wholesalePrice, item.extraPieces, item.piecesPerUnit);
                        const piecePrice = calculatePiecePrice(item.wholesalePrice, item.piecesPerUnit);
                        const profitMargin = calculateProfitMargin(piecePrice, item.wholesaleRetailPrice);
                        const isLowStock = item.quantity <= 1;

                        return (
                          <div
                            key={item.id}
                            className={`p-4 rounded-lg border-2 transition-all ${
                              isLowStock
                                ? 'border-red-300 bg-red-50'
                                : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <input type="checkbox" checked={selectedItemIds.includes(item.id)} onChange={() => toggleItemSelection(item.id)} className="mt-1 h-5 w-5 shrink-0 accent-indigo-600" aria-label={`تحديد ${item.name}`} />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h3 className="text-lg font-semibold text-slate-900">{item.name}</h3>
                                  {isLowStock && (
                                    <AlertCircle className="w-5 h-5 text-red-600" />
                                  )}
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                                  <div className="text-right">
                                    <p className="text-slate-600">المورد</p>
                                    <p className="font-medium text-slate-900">{item.supplier || '-'}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-slate-600">الموقع</p>
                                    <p className="font-medium text-slate-900">{item.location || '-'}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-slate-600">الوحدة</p>
                                    <p className="font-medium text-slate-900">{item.unit || '-'}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-slate-600">إجمالي القطع</p>
                                    <p className="font-bold text-blue-600">{totalPieces}</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm mb-3">
                                  <div className="text-right">
                                    <p className="text-slate-600">سعر الجملة</p>
                                    <p className="font-medium text-slate-900">{item.wholesalePrice.toFixed(2)} ج.م</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-slate-600">سعر القطعة</p>
                                    <p className="font-medium text-slate-900">{piecePrice.toFixed(2)} ج.م</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-slate-600">سعر القطاعي</p>
                                    <p className="font-medium text-slate-900">{item.wholesaleRetailPrice.toFixed(2)} ج.م</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-slate-600">نسبة الربح</p>
                                    <p className={`font-bold ${profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {profitMargin.toFixed(2)}%
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-slate-600">إجمالي القيمة</p>
                                    <p className="font-bold text-green-600">{productValue.toFixed(2)} ج.م</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                  <div className="text-right">
                                    <p className="text-slate-600">الكراتين</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Button
                                        onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700"
                                      >
                                        +
                                      </Button>
                                      <span className="font-bold text-lg">{item.quantity}</span>
                                      <Button
                                        onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                        size="sm"
                                        className="bg-red-600 hover:bg-red-700"
                                      >
                                        -
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-slate-600">القطع الإضافية</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Button
                                        onClick={() => handleExtraPiecesChange(item.id, item.extraPieces + 1)}
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700"
                                      >
                                        +
                                      </Button>
                                      <span className="font-bold text-lg">{item.extraPieces}</span>
                                      <Button
                                        onClick={() => handleExtraPiecesChange(item.id, item.extraPieces - 1)}
                                        size="sm"
                                        className="bg-red-600 hover:bg-red-700"
                                      >
                                        -
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <Button
                                onClick={() => handleDeleteProduct(item.id)}
                                variant="destructive"
                                size="sm"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
