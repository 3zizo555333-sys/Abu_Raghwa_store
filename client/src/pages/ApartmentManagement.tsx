import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLocation } from 'wouter';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertCircle, Search, TrendingUp, BarChart3, Eye, X, ClipboardPaste, ArrowRightLeft, CheckSquare, Pencil, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  createCloudApartmentCategory,
  createCloudApartmentItems,
  deleteCloudApartmentItems,
  listCloudApartmentInventory,
  updateCloudApartmentItem,
  updateCloudApartmentItemsCategory,
  type ApartmentInventoryInput,
  type ApartmentInventoryItem,
} from '@/lib/supabase/apartmentInventory';

type InventoryItem = ApartmentInventoryItem;

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

const createEmptyInventoryForm = (): ApartmentInventoryInput => ({
  name: '', supplier: '', location: '', unit: '', piecesPerUnit: 0,
  quantity: 0, extraPieces: 0, wholesalePrice: 0, retailPrice: 0,
  wholesaleRetailPrice: 0, category: '',
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'تعذر حفظ التغييرات في السحابة.';
}

export default function ApartmentManagement() {
  const [, navigate] = useLocation();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canDeleteItems, setCanDeleteItems] = useState(false);
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
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editFormData, setEditFormData] = useState<ApartmentInventoryInput | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingMutation, setSavingMutation] = useState(false);
  const [savingItemIds, setSavingItemIds] = useState<string[]>([]);
  const pendingItemIds = useRef(new Set<string>());

  // Form state
  const [formData, setFormData] = useState<ApartmentInventoryInput>(createEmptyInventoryForm);

  const refreshCloudData = useCallback(async (silent = false) => {
    setLoading(true);
    setLoadError(null);
    try {
      const snapshot = await listCloudApartmentInventory();
      setItems(snapshot.items);
      setCategoryNames(snapshot.categories);
      setCanDeleteItems(snapshot.role === 'manager' || snapshot.role === 'admin');
    } catch (error) {
      const message = errorMessage(error);
      setLoadError(message);
      if (!silent) toast.error(`تعذر تحميل مخزون الشقة من Supabase: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refreshCloudData(); }, [refreshCloudData]);

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

  // لا تتغير الواجهة إلا بعد تأكيد Supabase حفظ العملية.
  const persistItemPatch = async (id: string, patch: Parameters<typeof updateCloudApartmentItem>[1]) => {
    if (pendingItemIds.current.has(id)) return;
    const currentItem = items.find(item => item.id === id);
    if (!currentItem) return;
    pendingItemIds.current.add(id);
    setSavingItemIds(previous => [...previous, id]);
    try {
      const saved = await updateCloudApartmentItem(id, patch, currentItem.updatedAt);
      setItems(previous => previous.map(item => item.id === id ? saved : item));
    } catch (error) {
      await refreshCloudData(true);
      toast.error(`لم يتم حفظ تعديل الصنف: ${errorMessage(error)}`);
    } finally {
      pendingItemIds.current.delete(id);
      setSavingItemIds(previous => previous.filter(itemId => itemId !== id));
    }
  };

  // إضافة منتج جديد
  const handleAddProduct = async () => {
    if (!formData.name.trim() || !formData.category.trim()) {
      toast.error('الرجاء ملء الحقول المطلوبة (الاسم والفئة)');
      return;
    }
    setSavingMutation(true);
    try {
      const [saved] = await createCloudApartmentItems([formData]);
      setItems(previous => [...previous, saved]);
      setFormData(createEmptyInventoryForm());
      toast.success('تم حفظ المنتج سحابياً بنجاح');
    } catch (error) {
      await refreshCloudData(true);
      toast.error(`لم يتم حفظ المنتج؛ لم تُحفظ بيانات محلية مؤقتة: ${errorMessage(error)}`);
    } finally {
      setSavingMutation(false);
    }
  };

  const openEditDialog = (item: InventoryItem) => {
    setEditingItem(item);
    setEditFormData({
      name: item.name, supplier: item.supplier, location: item.location, unit: item.unit,
      piecesPerUnit: item.piecesPerUnit, quantity: item.quantity, extraPieces: item.extraPieces,
      wholesalePrice: item.wholesalePrice, retailPrice: item.retailPrice,
      wholesaleRetailPrice: item.wholesaleRetailPrice, category: item.category,
    });
  };

  const handleSaveEditedItem = async () => {
    if (!editingItem || !editFormData) return;
    if (pendingItemIds.current.has(editingItem.id)) {
      toast.error('يوجد تعديل جارٍ لهذا الصنف. انتظر اكتماله ثم أعد المحاولة.');
      return;
    }
    pendingItemIds.current.add(editingItem.id);
    setSavingItemIds(previous => [...previous, editingItem.id]);
    setSavingEdit(true);
    try {
      const saved = await updateCloudApartmentItem(editingItem.id, editFormData, editingItem.updatedAt);
      setItems(previous => previous.map(item => item.id === saved.id ? saved : item));
      setEditingItem(null);
      setEditFormData(null);
      toast.success('تم حفظ تعديل الصنف في Supabase');
    } catch (error) {
      await refreshCloudData(true);
      if (errorMessage(error).includes('تغيّر هذا الصنف')) {
        setEditingItem(null);
        setEditFormData(null);
      }
      toast.error(`لم يتم حفظ تعديل الصنف: ${errorMessage(error)}`);
    } finally {
      pendingItemIds.current.delete(editingItem.id);
      setSavingItemIds(previous => previous.filter(itemId => itemId !== editingItem.id));
      setSavingEdit(false);
    }
  };

  // حذف منتج
  const handleDeleteProduct = async (id: string) => {
    if (!canDeleteItems) {
      toast.error('حذف أصناف المخزن متاح للمدير أو المسؤول فقط.');
      return;
    }
    if (!confirm('هل أنت متأكد من حذف هذا المنتج من المخزن السحابي؟')) return;
    try {
      const deletedIds = await deleteCloudApartmentItems([id]);
      if (!deletedIds.includes(id)) throw new Error('لم يؤكد الخادم حذف الصنف.');
      setItems(previous => previous.filter(item => item.id !== id));
      setSelectedItemIds(previous => previous.filter(itemId => itemId !== id));
      toast.success('تم حذف المنتج من Supabase');
    } catch (error) {
      await refreshCloudData(true);
      toast.error(`لم يتم حذف المنتج: ${errorMessage(error)}`);
    }
  };

  // تحديث كمية المنتج والقطع الإضافية في السحابة.
  const handleQuantityChange = (id: string, newQuantity: number) => {
    void persistItemPatch(id, { quantity: Math.max(0, newQuantity) });
  };

  const handleExtraPiecesChange = (id: string, newExtraPieces: number) => {
    void persistItemPatch(id, { extraPieces: Math.max(0, newExtraPieces) });
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

  const addCategory = async () => {
    const category = newCategoryName.trim();
    if (!category) return;
    setSavingMutation(true);
    try {
      const saved = availableCategories.includes(category) ? category : await createCloudApartmentCategory(category);
      setCategoryNames(previous => previous.includes(saved) ? previous : [...previous, saved]);
      setFormData(previous => ({ ...previous, category: saved }));
      setBulkCategory(saved);
      setNewCategoryName('');
      toast.success(`تم حفظ الفئة سحابياً: ${saved}`);
    } catch (error) {
      await refreshCloudData(true);
      toast.error(`لم يتم حفظ الفئة: ${errorMessage(error)}`);
    } finally {
      setSavingMutation(false);
    }
  };

  const toggleItemSelection = (id: string) => setSelectedItemIds(prev => prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]);
  const toggleCategorySelection = (categoryItems: InventoryItem[]) => {
    const ids = categoryItems.map(item => item.id);
    const allSelected = ids.every(id => selectedItemIds.includes(id));
    setSelectedItemIds(prev => allSelected ? prev.filter(id => !ids.includes(id)) : Array.from(new Set([...prev, ...ids])));
  };
  const moveSelectedItems = async () => {
    const category = moveCategory.trim();
    if (!category || selectedItemIds.length === 0) return;
    setSavingMutation(true);
    try {
      const savedCategory = availableCategories.includes(category) ? category : await createCloudApartmentCategory(category);
      if (!availableCategories.includes(category)) setCategoryNames(previous => [...previous, savedCategory]);
      const updated = await updateCloudApartmentItemsCategory(selectedItemIds, savedCategory);
      if (updated.length !== selectedItemIds.length) throw new Error('لم يؤكد الخادم نقل جميع الأصناف المحددة.');
      const updatedById = new Map(updated.map(item => [item.id, item]));
      setItems(previous => previous.map(item => updatedById.get(item.id) ?? item));
      setSelectedItemIds([]);
      setMoveCategory('');
      toast.success('تم نقل المنتجات المحددة وحفظها سحابياً');
    } catch (error) {
      await refreshCloudData(true);
      toast.error(`لم يتم نقل الأصناف: ${errorMessage(error)}`);
    } finally {
      setSavingMutation(false);
    }
  };
  const deleteSelectedItems = async () => {
    if (!canDeleteItems) {
      toast.error('حذف أصناف المخزن متاح للمدير أو المسؤول فقط.');
      return;
    }
    if (!selectedItemIds.length || !confirm(`حذف ${selectedItemIds.length} منتجًا محددًا؟`)) return;
    setSavingMutation(true);
    try {
      const deletedIds = await deleteCloudApartmentItems(selectedItemIds);
      if (deletedIds.length !== selectedItemIds.length) throw new Error('لم يؤكد الخادم حذف جميع الأصناف المحددة.');
      const deleted = new Set(deletedIds);
      setItems(previous => previous.filter(item => !deleted.has(item.id)));
      setSelectedItemIds([]);
      toast.success('تم حذف المنتجات المحددة من Supabase');
    } catch (error) {
      await refreshCloudData(true);
      toast.error(`لم يتم حذف المنتجات المحددة: ${errorMessage(error)}`);
    } finally {
      setSavingMutation(false);
    }
  };
  const importBulkItems = async () => {
    const category = bulkCategory.trim();
    const names = bulkText.split(/\r?\n/).map(line => line.split(/[,\t،]/)[0]?.trim()).filter(Boolean);
    if (!category || !names.length) {
      toast.error('اختر فئة والصق اسم منتج واحدًا على الأقل');
      return;
    }
    setSavingMutation(true);
    try {
      const savedCategory = availableCategories.includes(category) ? category : await createCloudApartmentCategory(category);
      if (!availableCategories.includes(category)) setCategoryNames(previous => [...previous, savedCategory]);
      const imported = await createCloudApartmentItems(names.map(name => ({ ...createEmptyInventoryForm(), name, category: savedCategory })));
      setItems(previous => [...previous, ...imported]);
      setBulkText('');
      setShowBulkImport(false);
      toast.success(`تم حفظ ${imported.length} منتجاً سحابياً في فئة ${savedCategory}`);
    } catch (error) {
      await refreshCloudData(true);
      toast.error(`لم يتم حفظ الإضافة الجماعية: ${errorMessage(error)}`);
    } finally {
      setSavingMutation(false);
    }
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
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void refreshCloudData()} variant="outline" className="gap-2" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'جار التحميل...' : 'تحديث من السحابة'}
            </Button>
            <Button onClick={() => navigate('/')} variant="outline" className="gap-2">
              ← العودة للرئيسية
            </Button>
          </div>
        </div>

        {loadError && (
          <Card className="mb-6 border-red-300 bg-red-50">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-right">
              <p className="text-sm font-medium text-red-800">لم يتم تحميل المخزون السحابي: {loadError}</p>
              <Button type="button" variant="outline" onClick={() => void refreshCloudData()} disabled={loading}>إعادة المحاولة</Button>
            </CardContent>
          </Card>
        )}

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
              <Button type="button" onClick={addCategory} className="bg-indigo-600 hover:bg-indigo-700" disabled={savingMutation || loading}>إضافة الفئة</Button>
              <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-right">
                <option value="">اختر فئة للمنتج</option>
                {availableCategories.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
              <Button type="button" variant="outline" onClick={() => setShowBulkImport(value => !value)} className="gap-2" disabled={savingMutation || loading}><ClipboardPaste className="h-4 w-4" /> نسخ ولصق جماعي</Button>
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
                  <Button type="button" onClick={addCategory} variant="outline" disabled={savingMutation || loading}>حفظ الفئة الجديدة</Button>
                  <Button type="button" onClick={importBulkItems} className="bg-green-600 hover:bg-green-700" disabled={savingMutation || loading}>{savingMutation ? 'جار الحفظ...' : 'إضافة المنتجات للفئة'}</Button>
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
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">تكلفة الشراء / الوحدة</label>
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
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">سعر البيع (قطاعي / تجزئة)</label>
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
                <label className="block text-sm font-medium text-slate-700 mb-2 text-right">سعر البيع (جملة)</label>
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
              <Button type="button" onClick={() => setFormData(createEmptyInventoryForm())} variant="outline" disabled={savingMutation || loading}>
                🔄 إعادة تعيين
              </Button>
              <Button
                onClick={handleAddProduct}
                className="bg-green-600 hover:bg-green-700"
                disabled={savingMutation || loading}
              >
                {savingMutation ? 'جار الحفظ في Supabase...' : '💾 حفظ المنتج'}
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
            {loading && items.length === 0 ? (
              <div className="py-8 text-center text-slate-600">جار تحميل مخزون الشقة من Supabase...</div>
            ) : loadError && items.length === 0 ? (
              <div className="py-8 text-center text-red-700">تعذر تحميل الأصناف. استخدم زر «إعادة المحاولة» بالأعلى.</div>
            ) : items.length === 0 ? (
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

                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4 text-sm">
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">الكراتين</p>
                                <p className="font-bold text-slate-900">{item.quantity}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">القطع الإضافية</p>
                                <p className="font-bold text-slate-900">{item.extraPieces}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">تكلفة الشراء</p>
                                <p className="font-semibold text-slate-900">{item.wholesalePrice.toFixed(2)} ج.م</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">سعر القطعة</p>
                                <p className="font-semibold text-slate-900">{piecePrice.toFixed(2)} ج.م</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">بيع قطاعي</p>
                                <p className="font-semibold text-slate-900">{item.retailPrice.toFixed(2)} ج.م</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">بيع جملة</p>
                                <p className="font-semibold text-slate-900">{item.wholesaleRetailPrice.toFixed(2)} ج.م</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-600 text-xs">إجمالي القيمة</p>
                                <p className="font-bold text-green-600 text-lg">{productValue.toFixed(2)} ج.م</p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-2 flex shrink-0 flex-col gap-2">
                                <Button type="button" onClick={() => openEditDialog(item)} variant="outline" size="sm" className="gap-1" disabled={savingItemIds.includes(item.id) || savingMutation}>
                              <Pencil className="h-4 w-4" /> تعديل
                            </Button>
                            {canDeleteItems && (
                              <Button type="button" onClick={() => void handleDeleteProduct(item.id)} variant="destructive" size="sm" disabled={savingItemIds.includes(item.id)} aria-label={`حذف ${item.name}`}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
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
          {loading && items.length === 0 ? (
            <Card><CardContent className="pt-6 text-center text-slate-600">جار تحميل مخزون الشقة من Supabase...</CardContent></Card>
          ) : loadError && items.length === 0 ? (
            <Card><CardContent className="pt-6 text-center text-red-700">تعذر تحميل الأصناف؛ أعد المحاولة قبل متابعة العمل.</CardContent></Card>
          ) : Object.entries(categorizedItems).length === 0 ? (
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
                        <Button type="button" size="sm" variant="outline" onClick={() => toggleCategorySelection(categoryItems)} disabled={savingMutation || loading}>تحديد الكل</Button>
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
                        <Button type="button" onClick={moveSelectedItems} className="gap-2 bg-indigo-600 hover:bg-indigo-700" disabled={savingMutation || loading}><ArrowRightLeft className="h-4 w-4" /> نقل المحدد</Button>
                        {canDeleteItems && <Button type="button" onClick={deleteSelectedItems} variant="destructive" className="gap-2" disabled={savingMutation || loading}><Trash2 className="h-4 w-4" /> حذف المحدد</Button>}
                        <Button type="button" onClick={() => setSelectedItemIds([])} variant="ghost" disabled={savingMutation}>إلغاء التحديد</Button>
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
                              <input type="checkbox" checked={selectedItemIds.includes(item.id)} onChange={() => toggleItemSelection(item.id)} disabled={savingMutation || loading} className="mt-1 h-5 w-5 shrink-0 accent-indigo-600" aria-label={`تحديد ${item.name}`} />
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

                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 text-sm mb-3">
                                  <div className="text-right">
                                    <p className="text-slate-600">تكلفة الشراء / الوحدة</p>
                                    <p className="font-medium text-slate-900">{item.wholesalePrice.toFixed(2)} ج.م</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-slate-600">سعر القطعة</p>
                                    <p className="font-medium text-slate-900">{piecePrice.toFixed(2)} ج.م</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-slate-600">سعر البيع بالجملة</p>
                                    <p className="font-medium text-slate-900">{item.wholesaleRetailPrice.toFixed(2)} ج.م</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-slate-600">سعر البيع القطاعي</p>
                                    <p className="font-medium text-slate-900">{item.retailPrice.toFixed(2)} ج.م</p>
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
                                        disabled={savingItemIds.includes(item.id) || savingMutation}
                                      >
                                        +
                                      </Button>
                                      <span className="font-bold text-lg">{item.quantity}</span>
                                      <Button
                                        onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                        size="sm"
                                        className="bg-red-600 hover:bg-red-700"
                                        disabled={savingItemIds.includes(item.id) || savingMutation}
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
                                        disabled={savingItemIds.includes(item.id) || savingMutation}
                                      >
                                        +
                                      </Button>
                                      <span className="font-bold text-lg">{item.extraPieces}</span>
                                      <Button
                                        onClick={() => handleExtraPiecesChange(item.id, item.extraPieces - 1)}
                                        size="sm"
                                        className="bg-red-600 hover:bg-red-700"
                                        disabled={savingItemIds.includes(item.id) || savingMutation}
                                      >
                                        -
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex shrink-0 flex-col gap-2">
                                <Button type="button" onClick={() => openEditDialog(item)} variant="outline" size="sm" className="gap-1" disabled={savingItemIds.includes(item.id) || savingMutation}>
                                  <Pencil className="h-4 w-4" /> تعديل
                                </Button>
                                {canDeleteItems && (
                                  <Button type="button" onClick={() => void handleDeleteProduct(item.id)} variant="destructive" size="sm" disabled={savingItemIds.includes(item.id)} aria-label={`حذف ${item.name}`}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
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
      <Dialog
        open={Boolean(editingItem)}
        onOpenChange={open => {
          if (!open && !savingEdit) {
            setEditingItem(null);
            setEditFormData(null);
          }
        }}
      >
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تعديل بيانات صنف المخزن</DialogTitle>
            <DialogDescription>
              تُحفظ القيم مباشرة في مخزن Supabase الخاص بمتجرك، ولا تُعرض رسالة نجاح قبل تأكيد الخادم.
            </DialogDescription>
          </DialogHeader>
          {editFormData && (
            <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">اسم المنتج</label>
                <Input value={editFormData.name} onChange={e => setEditFormData(previous => previous ? { ...previous, name: e.target.value } : previous)} disabled={savingEdit} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">الكمية المخزنة (الوحدات)</label>
                <Input type="number" min="0" step="0.001" value={editFormData.quantity} onChange={e => setEditFormData(previous => previous ? { ...previous, quantity: Number(e.target.value) || 0 } : previous)} disabled={savingEdit} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">القطع الإضافية</label>
                <Input type="number" min="0" step="0.001" value={editFormData.extraPieces} onChange={e => setEditFormData(previous => previous ? { ...previous, extraPieces: Number(e.target.value) || 0 } : previous)} disabled={savingEdit} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">تكلفة الشراء / الوحدة</label>
                <Input type="number" min="0" step="0.01" value={editFormData.wholesalePrice} onChange={e => setEditFormData(previous => previous ? { ...previous, wholesalePrice: Number(e.target.value) || 0 } : previous)} disabled={savingEdit} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">سعر البيع (قطاعي)</label>
                <Input type="number" min="0" step="0.01" value={editFormData.retailPrice} onChange={e => setEditFormData(previous => previous ? { ...previous, retailPrice: Number(e.target.value) || 0 } : previous)} disabled={savingEdit} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">سعر البيع (جملة)</label>
                <Input type="number" min="0" step="0.01" value={editFormData.wholesaleRetailPrice} onChange={e => setEditFormData(previous => previous ? { ...previous, wholesaleRetailPrice: Number(e.target.value) || 0 } : previous)} disabled={savingEdit} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setEditingItem(null); setEditFormData(null); }} disabled={savingEdit}>إلغاء</Button>
            <Button type="button" onClick={() => void handleSaveEditedItem()} disabled={savingEdit || !editFormData?.name.trim()}>
              {savingEdit ? 'جار الحفظ...' : 'حفظ التعديلات'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
