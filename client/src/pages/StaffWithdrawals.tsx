import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, LoaderCircle, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { createStaffWithdrawal, deleteStaffWithdrawal, getCurrentStaffEmployee, listOwnStaffWithdrawals, listStaffFinanceData, reviewStaffWithdrawal, updateStaffWithdrawal, type StaffEmployee, type StaffWithdrawal } from "@/lib/supabase/staffWithdrawals";
import { getSupabaseClient } from "@/lib/supabase/client";

type Summary = { daily: number; monthly: number; pending: number; approved: number };
const money = (value: number) => `${Number(value || 0).toFixed(2)} ج.م`;
const dateOnly = (value: string) => value.slice(0, 10);
const monthKey = (value: string) => value.slice(0, 7);

function calculateSummary(items: StaffWithdrawal[], today = new Date()): Summary {
  const todayKey = today.toISOString().slice(0, 10);
  const currentMonth = todayKey.slice(0, 7);
  const dailyItems = items.filter(item => dateOnly(item.requested_at) === todayKey);
  const monthlyItems = items.filter(item => monthKey(item.requested_at) === currentMonth);
  return {
    daily: dailyItems.reduce((sum, item) => sum + Number(item.amount), 0),
    monthly: monthlyItems.reduce((sum, item) => sum + Number(item.amount), 0),
    pending: items.filter(item => item.status === "pending").reduce((sum, item) => sum + Number(item.amount), 0),
    approved: items.filter(item => item.status === "approved").reduce((sum, item) => sum + Number(item.amount), 0),
  };
}

function SummaryCards({ items }: { items: StaffWithdrawal[] }) {
  const summary = calculateSummary(items);
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {["اليوم", "هذا الشهر", "معلّق", "معتمد"].map((label, index) => {
      const values = [summary.daily, summary.monthly, summary.pending, summary.approved];
      return <div key={label} className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">إجمالي {label}</p><p className="mt-1 text-lg font-black text-violet-800">{money(values[index])}</p></div>;
    })}
  </div>;
}

function WithdrawalCard({ item, canManage, onReview, onEdit, onDelete }: { item: StaffWithdrawal; canManage: boolean; onReview: (id: string, status: "approved" | "rejected") => void; onEdit: (item: StaffWithdrawal) => void; onDelete: (id: string) => void }) {
  return <article className="rounded-xl border bg-white p-3 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><b className="text-lg">{money(item.amount)}</b><p className="text-sm text-slate-700">{item.description}</p><p className="text-xs text-slate-500">{new Date(item.requested_at).toLocaleString("ar-EG")}</p></div>
      <span className={`rounded-full px-2 py-1 text-xs font-bold ${item.status === "approved" ? "bg-emerald-100 text-emerald-800" : item.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{item.status === "approved" ? "معتمد" : item.status === "rejected" ? "مرفوض" : "بانتظار الاعتماد"}</span>
    </div>
    {canManage && <div className="mt-3 flex flex-wrap gap-2 border-t pt-2">
      {item.status === "pending" && <><Button size="sm" onClick={() => onReview(item.id, "approved")}><CheckCircle2 className="ml-1 h-4 w-4" />اعتماد</Button><Button size="sm" variant="outline" onClick={() => onReview(item.id, "rejected")}><XCircle className="ml-1 h-4 w-4" />رفض</Button></>}
      <Button size="sm" variant="outline" onClick={() => onEdit(item)}><Pencil className="ml-1 h-4 w-4" />تعديل</Button><Button size="sm" variant="destructive" onClick={() => onDelete(item.id)}><Trash2 className="ml-1 h-4 w-4" />حذف</Button>
    </div>}
  </article>;
}

function NewWithdrawalForm({ onSubmit, busy, employeeName }: { onSubmit: (amount: number, description: string) => void; busy: boolean; employeeName?: string }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const submit = () => { const numericAmount = Number(amount); if (!numericAmount || numericAmount <= 0 || description.trim().length < 2) return; onSubmit(numericAmount, description.trim()); setAmount(""); setDescription(""); };
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />إضافة سحبة جديدة</CardTitle><CardDescription>{employeeName ? `للموظف: ${employeeName}` : "أدخل المبلغ والبيان ثم احفظ السحبة في Supabase."}</CardDescription></CardHeader><CardContent className="grid gap-2 md:grid-cols-[150px_1fr_auto]"><Input type="number" min="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="المبلغ" /><Input value={description} onChange={event => setDescription(event.target.value)} placeholder="السبب أو البيان" /><Button disabled={busy || !amount || description.trim().length < 2} onClick={submit}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "تسجيل"}</Button></CardContent></Card>;
}

export default function StaffWithdrawals() {
  const [, navigate] = useLocation();
  const access = useStaffAccess({ monitorMembership: true });
  const canManage = access.canViewSensitiveFinancials;
  const [employees, setEmployees] = useState<StaffEmployee[]>([]);
  const [withdrawals, setWithdrawals] = useState<StaffWithdrawal[]>([]);
  const [currentEmployee, setCurrentEmployee] = useState<StaffEmployee | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [editing, setEditing] = useState<StaffWithdrawal | null>(null);

  const refresh = useCallback(async () => {
    if (!access.shopId || !access.user) return;
    setLoading(true);
    try {
      if (canManage) {
        const data = await listStaffFinanceData(access.shopId);
        setEmployees(data.employees); setWithdrawals(data.withdrawals);
      } else {
        const employee = await getCurrentStaffEmployee(access.shopId);
        const ownWithdrawals = await listOwnStaffWithdrawals(access.shopId, employee.id);
        setCurrentEmployee(employee); setWithdrawals(ownWithdrawals);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحميل السحوبات من Supabase."); }
    finally { setLoading(false); }
  }, [access.shopId, access.user, canManage]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visibleWithdrawals = useMemo(() => withdrawals.filter(item => {
    const employee = employees.find(candidate => candidate.id === item.employee_id);
    const matchesName = !search || employee?.name.toLocaleLowerCase("ar").includes(search.toLocaleLowerCase("ar"));
    return matchesName && (!dateFilter || dateOnly(item.requested_at) === dateFilter);
  }), [dateFilter, employees, search, withdrawals]);

  const saveNew = async (employeeId: string, amount: number, description: string) => {
    if (!access.shopId) return;
    setBusy(true); try { const created = await createStaffWithdrawal({ shopId: access.shopId, employeeId, amount, description }); setWithdrawals(items => [created, ...items]); toast.success("تم تسجيل السحبة في Supabase"); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ السحبة"); } finally { setBusy(false); }
  };
  const review = async (id: string, status: "approved" | "rejected") => {
    setBusy(true); try { const user = (await getSupabaseClient().auth.getUser()).data.user; if (!user) throw new Error("انتهت الجلسة السحابية."); const updated = await reviewStaffWithdrawal(id, status, user.id); setWithdrawals(items => items.map(item => item.id === id ? updated : item)); toast.success(status === "approved" ? "تم اعتماد السحبة" : "تم رفض السحبة"); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحديث السحبة"); } finally { setBusy(false); }
  };
  const edit = async () => { if (!editing) return; setBusy(true); try { const updated = await updateStaffWithdrawal({ id: editing.id, amount: Number(editing.amount), description: editing.description }); setWithdrawals(items => items.map(item => item.id === updated.id ? updated : item)); setEditing(null); toast.success("تم تعديل السحبة"); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تعديل السحبة"); } finally { setBusy(false); } };
  const remove = async (id: string) => { if (!window.confirm("هل أنت متأكد من حذف السحبة نهائياً؟")) return; setBusy(true); try { await deleteStaffWithdrawal(id); setWithdrawals(items => items.filter(item => item.id !== id)); toast.success("تم حذف السحبة"); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف السحبة"); } finally { setBusy(false); } };

  if (access.isLoading || loading) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6" dir="rtl"><div className="flex items-center gap-2 font-bold text-slate-700"><LoaderCircle className="h-5 w-5 animate-spin" />جارٍ تحميل السحوبات من Supabase…</div></main>;
  if (!access.user || !access.shopId) return <main className="grid min-h-screen place-items-center p-6" dir="rtl"><Card><CardContent className="p-6 text-center">انتهت جلسة الدخول. سجّل الدخول ثم أعد فتح الشاشة.</CardContent></Card></main>;

  if (!canManage && currentEmployee) return <main className="min-h-screen bg-slate-50 p-4" dir="rtl"><div className="mx-auto max-w-3xl space-y-4"><header className="flex items-center justify-between rounded-2xl bg-white p-5"><div><p className="font-bold text-violet-700">سحوباتي</p><h1 className="text-2xl font-black">{currentEmployee.name}</h1><p className="text-sm text-slate-500">لا يمكنك رؤية أو تعديل سحوبات أي موظف آخر.</p></div><Button variant="outline" onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-1 h-4 w-4" />عودة</Button></header><SummaryCards items={withdrawals} /><NewWithdrawalForm employeeName={currentEmployee.name} busy={busy} onSubmit={(amount, description) => void saveNew(currentEmployee.id, amount, description)} /><Card><CardHeader><CardTitle>سجل سحوباتي</CardTitle></CardHeader><CardContent className="space-y-2">{withdrawals.length ? withdrawals.map(item => <WithdrawalCard key={item.id} item={item} canManage={false} onReview={() => undefined} onEdit={() => undefined} onDelete={() => undefined} />) : <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">لا توجد سحوبات مسجلة.</p>}</CardContent></Card></div></main>;

  return <main className="min-h-screen bg-slate-50 p-4" dir="rtl"><div className="mx-auto max-w-7xl space-y-5"><header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5"><div><p className="font-bold text-violet-700">السحوبات والعهد</p><h1 className="text-3xl font-black">قائمة سحوبات الموظفين</h1><p className="text-sm text-slate-600">الإضافة والتصفية والتعديل والحذف والاعتماد متاحة للإدارة فقط.</p></div><Button variant="outline" onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-1 h-4 w-4" />عودة</Button></header><SummaryCards items={withdrawals} /><Card><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_180px]"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="تصفية باسم الموظف" /><Input type="date" value={dateFilter} onChange={event => setDateFilter(event.target.value)} /></CardContent></Card><div className="grid gap-4 lg:grid-cols-[300px_1fr]">{employees.map(employee => <Card key={employee.id} className="h-fit"><CardHeader><CardTitle>{employee.name}</CardTitle><CardDescription>{employee.position || "موظف"} · {employee.is_active ? "نشط" : "موقوف"}</CardDescription></CardHeader><CardContent><NewWithdrawalForm employeeName={employee.name} busy={busy} onSubmit={(amount, description) => void saveNew(employee.id, amount, description)} /></CardContent></Card>)}<Card className="lg:col-start-2 lg:row-start-1"><CardHeader><CardTitle>السجل السحابي ({visibleWithdrawals.length})</CardTitle></CardHeader><CardContent className="space-y-2">{visibleWithdrawals.length ? visibleWithdrawals.map(item => <WithdrawalCard key={item.id} item={item} canManage onReview={(id, status) => void review(id, status)} onEdit={setEditing} onDelete={id => void remove(id)} />) : <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">لا توجد نتائج مطابقة.</p>}</CardContent></Card></div></div>{editing && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>تعديل السحبة</CardTitle></CardHeader><CardContent className="space-y-3"><Input type="number" value={String(editing.amount)} onChange={event => setEditing({ ...editing, amount: Number(event.target.value) })} /><Input value={editing.description} onChange={event => setEditing({ ...editing, description: event.target.value })} /><div className="flex gap-2"><Button disabled={busy} onClick={() => void edit()}>حفظ التعديل</Button><Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button></div></CardContent></Card></div>}</main>;
}
