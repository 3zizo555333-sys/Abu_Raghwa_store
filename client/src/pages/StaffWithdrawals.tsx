import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, LoaderCircle, Pencil, Plus, Printer, Share2, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { normalizeEmployeePin, verifyStaffPinAccess, type StaffPinEmployee } from "@/lib/supabase/staffEmployeePins";
import { bindCurrentStaffEmployee, createStaffWithdrawal, deleteStaffWithdrawal, listOwnStaffAttendance, listOwnStaffWithdrawals, listStaffFinanceData, reviewStaffWithdrawal, updateStaffWithdrawal, type StaffAttendance, type StaffEmployee, type StaffWithdrawal } from "@/lib/supabase/staffWithdrawals";
import { getSupabaseClient } from "@/lib/supabase/client";

type Summary = { daily: number; monthly: number; pending: number; approved: number };
type PersonalSummary = { workedDays: number; earnedAmount: number; withdrawalsTotal: number; remainingSalary: number };
const PIN_SESSION_MS = 8 * 60 * 60 * 1000;
const money = (value: number) => `${Number(value || 0).toFixed(2)} ج.م`;
const dateOnly = (value: string) => value.slice(0, 10);
const monthKey = (value: string) => value.slice(0, 7);
const todayLocal = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};

function calculateSummary(items: StaffWithdrawal[], todayKey = todayLocal()): Summary {
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

function calculatePersonalSummary(employee: StaffEmployee | StaffPinEmployee, attendance: StaffAttendance[], withdrawals: StaffWithdrawal[], now = new Date()): PersonalSummary {
  const todayKey = todayLocal();
  const currentMonth = todayKey.slice(0, 7);
  const attendanceDays = new Set(attendance
    .filter(row => row.employee_id === employee.id && monthKey(row.attendance_date) === currentMonth && (row.status === "present" || row.status === "late"))
    .map(row => dateOnly(row.attendance_date))).size;
  const joinDate = String(employee.hire_date || employee.join_date || "").slice(0, 10);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const joined = joinDate ? new Date(`${joinDate}T00:00:00`) : null;
  const workedDays = joined
    ? Math.max(0, joined <= today ? Math.floor((today.getTime() - joined.getTime()) / 86_400_000) : 0)
    : attendanceDays;
  const approvedWithdrawals = withdrawals
    .filter(row => row.employee_id === employee.id && row.status === "approved")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const earnedAmount = Math.max(0, Number(employee.salary || 0)) / 30 * workedDays;
  return {
    workedDays,
    earnedAmount,
    withdrawalsTotal: approvedWithdrawals,
    remainingSalary: earnedAmount - approvedWithdrawals,
  };
}

function statementText(employee: StaffEmployee | StaffPinEmployee, attendance: StaffAttendance[], withdrawals: StaffWithdrawal[]): string {
  const summary = calculatePersonalSummary(employee, attendance, withdrawals);
  const lines = withdrawals.map(item => `- ${new Date(item.requested_at).toLocaleDateString("ar-EG")} | ${money(item.amount)} | ${item.status === "approved" ? "معتمدة" : item.status === "pending" ? "معلقة" : "مرفوضة"} | ${item.description}`);
  return [`كشف حساب الموظف: ${employee.name}`, `أيام العمل: ${summary.workedDays} يوم`, `الراتب المستحق: ${money(summary.earnedAmount)}`, `إجمالي السحوبات المعتمدة: ${money(summary.withdrawalsTotal)}`, `الرصيد المتبقي: ${money(summary.remainingSalary)}`, "", "تفاصيل السحوبات:", ...(lines.length ? lines : ["لا توجد سحوبات"])].join("\n");
}

function StatementActions({ employee, attendance, withdrawals }: { employee: StaffEmployee | StaffPinEmployee; attendance: StaffAttendance[]; withdrawals: StaffWithdrawal[] }) {
  const share = () => { const text = statementText(employee, attendance, withdrawals); window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer"); };
  return <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={share}><Share2 className="ml-1 h-4 w-4" />مشاركة عبر WhatsApp</Button><Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="ml-1 h-4 w-4" />طباعة / PDF</Button></div>;
}

function SummaryCards({ items }: { items: StaffWithdrawal[] }) {
  const summary = calculateSummary(items);
  const cards: Array<[string, number, string]> = [
    ["اليوم", summary.daily, "bg-blue-50 text-blue-900"],
    ["هذا الشهر", summary.monthly, "bg-violet-50 text-violet-900"],
    ["معلّق", summary.pending, "bg-amber-50 text-amber-900"],
    ["معتمد", summary.approved, "bg-emerald-50 text-emerald-900"],
  ];
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, value, tone]) => <div key={label} className={`rounded-2xl border bg-white p-4 shadow-sm ${tone}`}><p className="text-xs font-bold opacity-70">إجمالي {label}</p><p className="mt-1 text-lg font-black">{money(value)}</p></div>)}</div>;
}

function PersonalSummaryCards({ employee, attendance, withdrawals }: { employee: StaffEmployee | StaffPinEmployee; attendance: StaffAttendance[]; withdrawals: StaffWithdrawal[] }) {
  const summary = calculatePersonalSummary(employee, attendance, withdrawals);
  const cards: Array<[string, string, string]> = [
    ["أيام العمل الفعلية", `${summary.workedDays} يوم`, "bg-blue-50 text-blue-900"],
    ["الراتب المستحق", money(summary.earnedAmount), "bg-emerald-50 text-emerald-900"],
    ["إجمالي السحوبات المعتمدة", money(summary.withdrawalsTotal), "bg-orange-50 text-orange-900"],
    ["الرصيد المتبقي", money(summary.remainingSalary), "bg-violet-50 text-violet-900"],
  ];
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, tone]) => <div key={label} className={`rounded-2xl p-4 ${tone}`}><p className="text-xs font-bold opacity-70">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>)}</div>;
}

function WithdrawalCard({
  item,
  canEdit,
  canDelete,
  canReview,
  onReview,
  onEdit,
  onDelete,
}: {
  item: StaffWithdrawal;
  canEdit: boolean;
  canDelete: boolean;
  canReview: boolean;
  onReview: (id: string, status: "approved" | "rejected") => void;
  onEdit: (item: StaffWithdrawal) => void;
  onDelete: (id: string) => void;
}) {
  return <article className="rounded-xl border bg-white p-3 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><b className="text-lg">{money(item.amount)}</b><p className="text-sm text-slate-700">{item.description}</p><p className="text-xs text-slate-500">{new Date(item.requested_at).toLocaleString("ar-EG")}</p></div>
      <span className={`rounded-full px-2 py-1 text-xs font-bold ${item.status === "approved" ? "bg-emerald-100 text-emerald-800" : item.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{item.status === "approved" ? "معتمد" : item.status === "rejected" ? "مرفوض" : "بانتظار الاعتماد"}</span>
    </div>
    {(canEdit || canDelete || (canReview && item.status === "pending")) && <div className="mt-3 flex flex-wrap gap-2 border-t pt-2">
      {canReview && item.status === "pending" && <><Button size="sm" onClick={() => onReview(item.id, "approved")}><CheckCircle2 className="ml-1 h-4 w-4" />اعتماد</Button><Button size="sm" variant="outline" onClick={() => onReview(item.id, "rejected")}><XCircle className="ml-1 h-4 w-4" />رفض</Button></>}
      {canEdit && <Button size="sm" variant="outline" onClick={() => onEdit(item)}><Pencil className="ml-1 h-4 w-4" />تعديل</Button>}
      {canDelete && <Button size="sm" variant="destructive" onClick={() => onDelete(item.id)}><Trash2 className="ml-1 h-4 w-4" />حذف</Button>}
    </div>}
  </article>;
}

function NewWithdrawalForm({ onSubmit, busy, employeeName }: { onSubmit: (amount: number, description: string) => void; busy: boolean; employeeName?: string }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const submit = () => {
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0 || description.trim().length < 2) return;
    onSubmit(numericAmount, description.trim());
    setAmount("");
    setDescription("");
  };
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />تسجيل سحبة جديدة</CardTitle><CardDescription>{employeeName ? `للموظف: ${employeeName}` : "أدخل المبلغ والسبب ثم سجّل السحبة."}</CardDescription></CardHeader><CardContent className="grid gap-2 md:grid-cols-[150px_1fr_auto]"><Input type="number" min="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="المبلغ" /><Input value={description} onChange={event => setDescription(event.target.value)} placeholder="السبب أو البيان" /><Button disabled={busy || !amount || description.trim().length < 2} onClick={submit}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "تسجيل سحبة جديدة"}</Button></CardContent></Card>;
}

export default function StaffWithdrawals() {
  const [, navigate] = useLocation();
  const access = useStaffAccess({ monitorMembership: true });
  const role = access.user?.role;
  const isFullAdmin = role === "manager" || role === "admin";
  const canManageTeam = access.canViewSensitiveFinancials;
  const canEdit = canManageTeam;
  const canDelete = canManageTeam;
  const canReview = canManageTeam;
  const requiresPin = true;
  const [pin, setPin] = useState("");
  const [pinEmployee, setPinEmployee] = useState<StaffPinEmployee | null>(null);
  const [pinExpiresAt, setPinExpiresAt] = useState<number | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [employees, setEmployees] = useState<StaffEmployee[]>([]);
  const [withdrawals, setWithdrawals] = useState<StaffWithdrawal[]>([]);
  const [attendance, setAttendance] = useState<StaffAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [editing, setEditing] = useState<StaffWithdrawal | null>(null);

  const refresh = useCallback(async () => {
    if (access.isLoading) return;
    if (!access.shopId || !access.user) {
      setLoading(false);
      return;
    }
    if (requiresPin && !pinEmployee) {
      setEmployees([]);
      setWithdrawals([]);
      setAttendance([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (canManageTeam) {
        const data = await listStaffFinanceData(access.shopId);
        setEmployees(data.employees);
        setWithdrawals(data.withdrawals);
        setAttendance(data.attendance);
      } else if (pinEmployee) {
        const [ownWithdrawals, ownAttendance] = await Promise.all([
          listOwnStaffWithdrawals(access.shopId, pinEmployee.id),
          listOwnStaffAttendance(access.shopId, pinEmployee.id),
        ]);
        setEmployees([]);
        setWithdrawals(ownWithdrawals);
        setAttendance(ownAttendance);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل السحوبات من Supabase.");
      setEmployees([]);
      setWithdrawals([]);
      setAttendance([]);
      if (requiresPin) {
        setPinEmployee(null);
        setPinExpiresAt(null);
        setPin("");
      }
    } finally {
      setLoading(false);
    }
  }, [access.isLoading, access.shopId, access.user, canManageTeam, requiresPin, pinEmployee]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!access.shopId || !access.user) return;
    void bindCurrentStaffEmployee(access.shopId).catch(() => undefined);
  }, [access.shopId, access.user?.id]);
  useEffect(() => {
    if (!access.shopId || !pinEmployee) return;
    const supabase = getSupabaseClient();
    const channel = supabase.channel(`staff-withdrawals:${access.shopId}`).on("postgres_changes", { event: "*", schema: "public", table: "staff_withdrawals", filter: `shop_id=eq.${access.shopId}` }, () => { void refresh(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [access.shopId, pinEmployee?.id, refresh]);
  useEffect(() => {
    if (!requiresPin || !pinEmployee) return;
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    return () => window.clearInterval(interval);
  }, [pinEmployee?.id, refresh, requiresPin]);
  useEffect(() => {
    if (!requiresPin || !pinEmployee || pinExpiresAt === null) return;
    const timeout = window.setTimeout(() => {
      setPinEmployee(null);
      setPinExpiresAt(null);
      setPin("");
      setEmployees([]);
      setWithdrawals([]);
      setAttendance([]);
      toast.info("انتهت جلسة PIN؛ أعد التحقق لفتح سجلك.");
    }, Math.max(0, pinExpiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [pinEmployee?.id, pinExpiresAt, requiresPin]);
  useEffect(() => {
    if (!access.user) {
      setPinEmployee(null);
      setPinExpiresAt(null);
      setPin("");
      setEmployees([]);
      setWithdrawals([]);
      setAttendance([]);
    }
  }, [access.user?.id]);

  const visibleWithdrawals = useMemo(() => withdrawals.filter(item => {
    const employee = employees.find(candidate => candidate.id === item.employee_id);
    const matchesName = !search || employee?.name.toLocaleLowerCase("ar").includes(search.toLocaleLowerCase("ar"));
    return matchesName && (!dateFilter || dateOnly(item.requested_at) === dateFilter);
  }), [dateFilter, employees, search, withdrawals]);

  const unlockWithPin = async () => {
    if (!access.shopId || pin.length !== 4 || pinBusy) return;
    setPinBusy(true);
    try {
      const employee = await verifyStaffPinAccess(access.shopId, pin);
      setPinEmployee(employee);
      setPinExpiresAt(Date.now() + PIN_SESSION_MS);
      setPin("");
      toast.success("تم التحقق؛ عُرض حسابك فقط.");
    } catch (error) {
      setPin("");
      toast.error(error instanceof Error ? error.message : "تعذر التحقق من PIN.");
    } finally {
      setPinBusy(false);
    }
  };

  const saveNew = async (employeeId: string, amount: number, description: string) => {
    if (!access.shopId) return;
    setBusy(true);
    try {
      const created = await createStaffWithdrawal({ shopId: access.shopId, employeeId, amount, description });
      setWithdrawals(items => [created, ...items]);
      toast.success("تم تسجيل السحبة في Supabase");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ السحبة");
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string, status: "approved" | "rejected") => {
    if (!canReview) return;
    setBusy(true);
    try {
      const { data: { user } } = await (await import("@/lib/supabase/client")).getSupabaseClient().auth.getUser();
      if (!user) throw new Error("انتهت الجلسة السحابية.");
      const updated = await reviewStaffWithdrawal(id, status, user.id);
      setWithdrawals(items => items.map(item => item.id === id ? updated : item));
      toast.success(status === "approved" ? "تم اعتماد السحبة" : "تم رفض السحبة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحديث السحبة");
    } finally {
      setBusy(false);
    }
  };

  const edit = async () => {
    if (!editing || !canEdit) return;
    setBusy(true);
    try {
      const updated = await updateStaffWithdrawal({ id: editing.id, amount: Number(editing.amount), description: editing.description });
      setWithdrawals(items => items.map(item => item.id === updated.id ? updated : item));
      setEditing(null);
      toast.success("تم تعديل السحبة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تعديل السحبة");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!canDelete || !window.confirm("هل أنت متأكد من حذف السحبة نهائياً؟")) return;
    setBusy(true);
    try {
      await deleteStaffWithdrawal(id);
      setWithdrawals(items => items.filter(item => item.id !== id));
      toast.success("تم حذف السحبة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حذف السحبة");
    } finally {
      setBusy(false);
    }
  };

  if (access.isLoading) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6" dir="rtl"><div className="flex items-center gap-2 font-bold text-slate-700"><LoaderCircle className="h-5 w-5 animate-spin" />جارٍ التحقق من صلاحيات المتجر…</div></main>;
  if (!access.user || !access.shopId) return <main className="grid min-h-screen place-items-center p-6" dir="rtl"><Card><CardContent className="p-6 text-center">انتهت جلسة الدخول. سجّل الدخول ثم أعد فتح الشاشة.</CardContent></Card></main>;

  if (requiresPin && !pinEmployee) return <main className="grid min-h-screen place-items-center bg-slate-50 p-4" dir="rtl"><Card className="w-full max-w-md text-center shadow-lg"><CardHeader><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-violet-100 text-2xl font-black text-violet-800">PIN</div><CardTitle>سحوباتي — الصفحة مقفلة</CardTitle><CardDescription>أدخل PIN الموظف المكوّن من 4 أرقام للتحقق وفتح سجلك الشخصي فقط.</CardDescription></CardHeader><CardContent className="space-y-3"><Input autoFocus type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={event => setPin(normalizeEmployeePin(event.target.value))} onKeyDown={event => { if (event.key === "Enter") void unlockWithPin(); }} placeholder="••••" aria-label="رمز PIN المكوّن من أربعة أرقام" /><Button className="w-full bg-violet-700" disabled={pin.length !== 4 || pinBusy} onClick={() => void unlockWithPin()}>{pinBusy ? <><LoaderCircle className="ml-2 h-4 w-4 animate-spin" />جارٍ التحقق…</> : "فتح سجلي"}</Button><Button className="w-full" variant="ghost" onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-1 h-4 w-4" />عودة</Button></CardContent></Card></main>;
  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6" dir="rtl"><div className="flex items-center gap-2 font-bold text-slate-700"><LoaderCircle className="h-5 w-5 animate-spin" />جارٍ تحميل السحوبات من Supabase…</div></main>;

  if (!canManageTeam && pinEmployee) return <main className="min-h-screen bg-slate-50 p-4" dir="rtl"><div className="mx-auto max-w-3xl space-y-4"><header className="flex items-center justify-between rounded-2xl bg-white p-5"><div><p className="font-bold text-violet-700">سحوباتي — حسابي فقط</p><h1 className="text-2xl font-black">{pinEmployee.name}</h1><p className="text-sm text-slate-500">بياناتك وحدك ظاهرة هنا. لا يمكن تعديل السحوبات أو حذفها.</p></div><Button variant="outline" onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-1 h-4 w-4" />عودة</Button></header><PersonalSummaryCards employee={pinEmployee} attendance={attendance} withdrawals={withdrawals} /><StatementActions employee={pinEmployee} attendance={attendance} withdrawals={withdrawals} /><NewWithdrawalForm employeeName={pinEmployee.name} busy={busy} onSubmit={(amount, description) => void saveNew(pinEmployee.id, amount, description)} /><Card><CardHeader><CardTitle>سجل سحوباتي</CardTitle><CardDescription>سجلاتك الشخصية فقط؛ أزرار التعديل والحذف غير متاحة لحساب العامل.</CardDescription></CardHeader><CardContent className="space-y-2">{withdrawals.length ? withdrawals.map(item => <WithdrawalCard key={item.id} item={item} canEdit={false} canDelete={false} canReview={false} onReview={() => undefined} onEdit={() => undefined} onDelete={() => undefined} />) : <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">لا توجد سحوبات مسجلة.</p>}</CardContent></Card></div></main>;

  return <main className="min-h-screen bg-slate-50 p-4" dir="rtl"><div className="mx-auto max-w-7xl space-y-5"><header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5"><div><p className="font-bold text-violet-700">السحوبات والعهد</p><h1 className="text-3xl font-black">{isFullAdmin ? "قائمة سحوبات الموظفين" : "إدارة سحوبات الفريق"}</h1><p className="text-sm text-slate-600">{isFullAdmin ? "المدير: إضافة وتصفية وتعديل وحذف واعتماد السحوبات." : "المشرف بعد تحقق PIN: إضافة وتعديل وتسوية وحذف سحوبات الفريق."}</p></div><Button variant="outline" onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-1 h-4 w-4" />عودة</Button></header><SummaryCards items={withdrawals} /><Card><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_180px]"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="تصفية باسم الموظف" /><Input type="date" value={dateFilter} onChange={event => setDateFilter(event.target.value)} /></CardContent></Card><div className="grid gap-4 lg:grid-cols-[300px_1fr]">{employees.map(employee => <Card key={employee.id} className="h-fit"><CardHeader><CardTitle>{employee.name}</CardTitle><CardDescription>{employee.position || "موظف"} · {employee.is_active ? "نشط" : "موقوف"}</CardDescription></CardHeader><CardContent className="space-y-2"><StatementActions employee={employee} attendance={attendance} withdrawals={withdrawals.filter(item => item.employee_id === employee.id)} /><NewWithdrawalForm employeeName={employee.name} busy={busy} onSubmit={(amount, description) => void saveNew(employee.id, amount, description)} /></CardContent></Card>)}<Card className="lg:col-start-2 lg:row-start-1"><CardHeader><CardTitle>السجل السحابي ({visibleWithdrawals.length})</CardTitle></CardHeader><CardContent className="space-y-2">{visibleWithdrawals.length ? visibleWithdrawals.map(item => <WithdrawalCard key={item.id} item={item} canEdit={canEdit} canDelete={canDelete} canReview={canReview} onReview={(id, status) => void review(id, status)} onEdit={setEditing} onDelete={id => void remove(id)} />) : <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">لا توجد نتائج مطابقة.</p>}</CardContent></Card></div></div>{editing && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>تعديل السحبة</CardTitle><CardDescription>يمكن للمشرف بعد PIN تعديل المبلغ والسبب وتسوية الحالة، كما يمكن للمدير ذلك.</CardDescription></CardHeader><CardContent className="space-y-3"><Input type="number" min="0.01" value={String(editing.amount)} onChange={event => setEditing({ ...editing, amount: Number(event.target.value) })} /><Input value={editing.description} onChange={event => setEditing({ ...editing, description: event.target.value })} /><div className="flex gap-2"><Button disabled={busy || !canEdit} onClick={() => void edit()}>حفظ التعديل</Button><Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button></div></CardContent></Card></div>}</main>;
}
