import { useEffect, useState } from "react";
import { Pencil, Plus, Ticket, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { deleteCatalogCoupon, listCatalogCoupons, saveCatalogCoupon, type CatalogCoupon } from "@/lib/supabase/catalogCoupons";

type Draft = { id?: string; code: string; title: string; description: string; discount_type: "percentage" | "fixed"; discount_value: string; min_order_amount: string; max_discount_amount: string; valid_from: string; valid_until: string; is_active: boolean };
const emptyDraft: Draft = { code: "", title: "", description: "", discount_type: "percentage", discount_value: "", min_order_amount: "0", max_discount_amount: "", valid_from: "", valid_until: "", is_active: true };
const toLocal = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const couponAdminStatus = (coupon: CatalogCoupon) => {
  if (!coupon.is_active) return { label: "متوقف", className: "bg-slate-100 text-slate-500" };
  const now = Date.now();
  if (coupon.valid_from && Date.parse(coupon.valid_from) > now) return { label: "لم يبدأ بعد", className: "bg-amber-100 text-amber-800" };
  if (coupon.valid_until && Date.parse(coupon.valid_until) <= now) return { label: "منتهي الصلاحية", className: "bg-red-100 text-red-700" };
  return { label: "فعّال", className: "bg-emerald-100 text-emerald-800" };
};
function CouponStatusBadge({ coupon }: { coupon: CatalogCoupon }) {
  const status = couponAdminStatus(coupon);
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${status.className}`}>{status.label}</span>;
}
const fromDraft = (draft: Draft) => ({ ...draft, discount_value: Number(draft.discount_value), min_order_amount: Number(draft.min_order_amount || 0), max_discount_amount: draft.max_discount_amount ? Number(draft.max_discount_amount) : null, valid_from: draft.valid_from ? new Date(draft.valid_from).toISOString() : null, valid_until: draft.valid_until ? new Date(draft.valid_until).toISOString() : null });

export function CatalogCouponsManager() {
  const [coupons, setCoupons] = useState<CatalogCoupon[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const refresh = async () => { setLoading(true); try { setCoupons(await listCatalogCoupons()); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحميل الكوبونات"); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, []);
  const edit = (coupon: CatalogCoupon) => setDraft({ id: coupon.id, code: coupon.code, title: coupon.title, description: coupon.description, discount_type: coupon.discount_type === "fixed" ? "fixed" : "percentage", discount_value: String(coupon.discount_value), min_order_amount: String(coupon.min_order_amount), max_discount_amount: coupon.max_discount_amount == null ? "" : String(coupon.max_discount_amount), valid_from: toLocal(coupon.valid_from), valid_until: toLocal(coupon.valid_until), is_active: coupon.is_active });
  const save = async () => { setSaving(true); try { const saved = await saveCatalogCoupon(fromDraft(draft)); setCoupons(current => draft.id ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current]); setDraft(emptyDraft); toast.success("تم حفظ الكوبون"); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الكوبون"); } finally { setSaving(false); } };
  const remove = async (id: string) => { if (!window.confirm("حذف هذا الكوبون؟")) return; try { await deleteCatalogCoupon(id); setCoupons(current => current.filter(item => item.id !== id)); toast.success("تم حذف الكوبون"); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف الكوبون"); } };
  const field = (key: keyof Draft, value: string | boolean) => setDraft(current => ({ ...current, [key]: value }));
  return <section dir="rtl" className="mt-6 rounded-3xl border border-violet-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><Ticket className="h-5 w-5 text-violet-600" />إدارة كوبونات الكتالوج</h2><p className="mt-1 text-sm text-slate-500">الكوبون يمر بتحقق خادمي قبل تسجيل الطلب.</p></div><Button variant="outline" onClick={() => setDraft(emptyDraft)}><Plus className="ml-1 h-4 w-4" />كوبون جديد</Button></div><div className="mt-4 grid gap-2 md:grid-cols-4"><Input value={draft.code} onChange={e => field("code", e.target.value.toUpperCase())} placeholder="الرمز مثل SAVE10" dir="ltr" /><Input value={draft.title} onChange={e => field("title", e.target.value)} placeholder="عنوان الكوبون" /><select value={draft.discount_type} onChange={e => field("discount_type", e.target.value)} className="rounded-md border px-3 text-sm"><option value="percentage">نسبة مئوية</option><option value="fixed">مبلغ ثابت</option></select><Input type="number" min="0" value={draft.discount_value} onChange={e => field("discount_value", e.target.value)} placeholder="قيمة الخصم" /></div><div className="mt-2 grid gap-2 md:grid-cols-4"><Input type="number" min="0" value={draft.min_order_amount} onChange={e => field("min_order_amount", e.target.value)} placeholder="الحد الأدنى للطلب" /><Input type="number" min="0" value={draft.max_discount_amount} onChange={e => field("max_discount_amount", e.target.value)} placeholder="أقصى خصم اختياري" /><Input type="datetime-local" value={draft.valid_from} onChange={e => field("valid_from", e.target.value)} /><Input type="datetime-local" value={draft.valid_until} onChange={e => field("valid_until", e.target.value)} /></div><Textarea className="mt-2" value={draft.description} onChange={e => field("description", e.target.value)} placeholder="وصف يظهر للعميل" /><div className="mt-3 flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.is_active} onChange={e => field("is_active", e.target.checked)} />كوبون فعال</label><Button disabled={saving} onClick={() => void save()}>{saving ? "جارٍ الحفظ..." : draft.id ? "تحديث الكوبون" : "حفظ الكوبون"}</Button></div><div className="mt-6 space-y-2">{loading ? <p className="text-sm text-slate-500">جارٍ تحميل الكوبونات...</p> : coupons.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">لا توجد كوبونات بعد.</p> : coupons.map(coupon => <div key={coupon.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3"><div><div className="flex items-center gap-2"><strong dir="ltr" className="rounded bg-violet-100 px-2 py-1 text-violet-800">{coupon.code}</strong><span className="font-black">{coupon.title}</span><CouponStatusBadge coupon={coupon} /></div><p className="mt-1 text-xs text-slate-500">خصم {coupon.discount_type === "percentage" ? `${coupon.discount_value}%` : `${coupon.discount_value} ج.م`} · حد أدنى {coupon.min_order_amount} ج.م</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => edit(coupon)}><Pencil className="ml-1 h-3.5 w-3.5" />تعديل</Button><Button size="sm" variant="outline" className="text-red-600" onClick={() => void remove(coupon.id)}><Trash2 className="ml-1 h-3.5 w-3.5" />حذف</Button></div></div>)}</div></section>;
}
