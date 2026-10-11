import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getProductCategoryPermissions, type ProductCategoryRole } from "@/lib/productCategoryPermissions";
import { createProductCategory, deleteProductCategory, getActiveShopContext, updateProductCategory, type ProductCategory } from "@/lib/supabase/products";
import { toast } from "sonner";

export type PosCategoryChange =
  | { type: "created"; category: ProductCategory }
  | { type: "renamed"; previousName: string; category: ProductCategory }
  | { type: "deleted"; category: ProductCategory };

type UnbarcodedCategoryManagerProps = {
  categories: ProductCategory[];
  disabled?: boolean;
  onCategoryChange: (change: PosCategoryChange) => void;
};

export function UnbarcodedCategoryManager({ categories, disabled = false, onCategoryChange }: UnbarcodedCategoryManagerProps) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<ProductCategoryRole>(null);
  const [open, setOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getActiveShopContext().then(context => {
      if (active) setRole(context.role);
    }).catch(() => {
      if (active) setRole(null);
    });
    return () => { active = false; };
  }, []);

  const permissions = getProductCategoryPermissions(role);
  const closeDialog = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setCategoryName("");
      setEditingCategoryId(null);
      setDeletingCategoryId(null);
    }
  };

  const saveCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) return toast.error("اكتب اسم الفئة أولًا.");
    setSaving(true);
    try {
      if (editingCategoryId) {
        const previousName = categories.find(category => category.id === editingCategoryId)?.name ?? "";
        const saved = await updateProductCategory(editingCategoryId, name);
        await queryClient.invalidateQueries({ queryKey: ["supabase-products"] });
        onCategoryChange({ type: "renamed", previousName, category: saved });
        toast.success(`تم تعديل الفئة إلى «${saved.name}».`);
      } else {
        const saved = await createProductCategory(name);
        await queryClient.invalidateQueries({ queryKey: ["supabase-products"] });
        onCategoryChange({ type: "created", category: saved });
        toast.success(`تم حفظ فئة «${saved.name}» على المتجر.`);
      }
      setCategoryName("");
      setEditingCategoryId(null);
    } catch (error) {
      toast.error(`تعذر حفظ الفئة. ${error instanceof Error ? error.message : "تحقق من اتصال Supabase وصلاحية عضويتك."}`);
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (category: ProductCategory) => {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setDeletingCategoryId(null);
  };

  const confirmDelete = async (category: ProductCategory) => {
    setSaving(true);
    try {
      const result = await deleteProductCategory(category.id);
      await queryClient.invalidateQueries({ queryKey: ["supabase-products"] });
      onCategoryChange({ type: "deleted", category });
      setDeletingCategoryId(null);
      if (editingCategoryId === category.id) {
        setEditingCategoryId(null);
        setCategoryName("");
      }
      toast.success(`حُذفت الفئة وفُصل ${result.unassignedProducts} من المنتجات عنها دون تغيير المخزون.`);
    } catch (error) {
      toast.error(`تعذر حذف الفئة. ${error instanceof Error ? error.message : "تحقق من الصلاحيات واتصال Supabase."}`);
    } finally {
      setSaving(false);
    }
  };

  if (!permissions.canManage) return null;

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} aria-label="إدارة فئات أصناف الصب" className="shrink-0 border-orange-300 bg-orange-50 font-black text-orange-900 hover:bg-orange-100">
          <Plus className="ml-1 h-4 w-4" />إضافة فئة
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="text-right">
          <DialogTitle>إدارة فئات أصناف الصب</DialogTitle>
          <DialogDescription>تُحفظ الفئات ضمن المتجر الحالي وتُطبق عليها صلاحيات عضويتك. الفئات الجديدة تظهر فورًا في تبويبات أصناف الصب.</DialogDescription>
        </DialogHeader>

        <form onSubmit={saveCategory} className="space-y-3">
          <label htmlFor="unbarcoded-category-name" className="block text-sm font-bold text-slate-800">
            {editingCategoryId ? "تعديل اسم الفئة" : "اسم الفئة الجديدة"}
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="unbarcoded-category-name"
              aria-label="اسم فئة أصناف الصب"
              value={categoryName}
              onChange={event => setCategoryName(event.target.value)}
              maxLength={120}
              placeholder="مثال: مساحيق الصب"
              disabled={saving || disabled}
              autoFocus
            />
            <Button type="submit" disabled={saving || disabled || !categoryName.trim()} className="bg-orange-600 text-white hover:bg-orange-700">
              {saving ? "جارٍ الحفظ..." : editingCategoryId ? "حفظ التعديل" : "حفظ الفئة"}
            </Button>
            {editingCategoryId && <Button type="button" variant="outline" disabled={saving} onClick={() => { setEditingCategoryId(null); setCategoryName(""); }}>إلغاء</Button>}
          </div>
        </form>

        <section aria-label="الفئات القابلة للإدارة" className="space-y-2">
          <h3 className="text-sm font-black text-slate-900">الفئات الحالية ({categories.length})</h3>
          {categories.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">لا توجد فئات محفوظة لأصناف الصب بعد. أضف فئة جديدة لتظهر هنا وفي التبويبات.</p>
          ) : categories.map(category => (
            <div key={category.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 flex-1 break-words font-bold text-slate-800">{category.name}</span>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="outline" disabled={saving || disabled} aria-label={`تعديل فئة ${category.name}`} onClick={() => startEditing(category)}>
                    <Pencil className="ml-1 h-4 w-4" />تعديل
                  </Button>
                  {permissions.canDelete && <Button type="button" variant="outline" disabled={saving || disabled} aria-label={`حذف فئة ${category.name}`} onClick={() => { setDeletingCategoryId(category.id); setEditingCategoryId(null); setCategoryName(""); }} className="border-red-200 text-red-700 hover:bg-red-50">
                    <Trash2 className="ml-1 h-4 w-4" />حذف
                  </Button>}
                </div>
              </div>
              {deletingCategoryId === category.id && (
                <div role="alertdialog" aria-label={`تأكيد حذف الفئة ${category.name}`} className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-900">تأكيد حذف «{category.name}»؟ ستُنقل المنتجات التابعة إلى «بدون فئة» عبر مسار المتجر الآمن، ولن يتغير المخزون.</p>
                  <div className="mt-3 flex gap-2">
                    <Button type="button" disabled={saving || disabled} onClick={() => void confirmDelete(category)} className="bg-red-700 text-white hover:bg-red-800">{saving ? "جارٍ الحذف..." : "تأكيد الحذف"}</Button>
                    <Button type="button" variant="outline" disabled={saving} onClick={() => setDeletingCategoryId(null)}>إلغاء</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}
