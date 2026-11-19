import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, LoaderCircle, Plus, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { clearEmployeePinLockStorage, normalizeEmployeePin, verifyStaffPinAccess, type StaffPinEmployee } from "@/lib/supabase/staffEmployeePins";
import { createStaffWithdrawal, listOwnStaffAttendance, listOwnStaffWithdrawals, type StaffAttendance, type StaffWithdrawal, type StaffWithdrawalStatus } from "@/lib/supabase/staffWithdrawals";
import { calculateStaffWithdrawalBalance, requestedAtForDate, transactionTypeLabel, type WithdrawalTransactionType } from "@/lib/supabase/staffWithdrawalFinance";
import { getSupabaseClient } from "@/lib/supabase/client";

const PIN_SESSION_MS = 8 * 60 * 60 * 1000;
const money = (value: number) => `${Number(value || 0).toFixed(2)} ج.م`;
const dateOnly = (value: string) => value.slice(0, 10);
const monthKey = (value: string) => value.slice(0, 7);
const todayLocal = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};
const roleLabel = (role: StaffPinEmployee["role"]) => role === "manager" ? "مدير" : role === "supervisor" ? "مشرف" : role === "cashier" ? "كاشير" : "بائع";

function calculatePersonalSummary(employee: StaffPinEmployee, attendance: StaffAttendance[], withdrawals: StaffWithdrawal[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentMonth = todayLocal().slice(0, 7);
  const attendanceDays = new Set(attendance
    .filter(row => row.employee_id === employee.id && monthKey(row.attendance_date) === currentMonth && (row.status === "present" || row.status === "late"))
    .map(row => dateOnly(row.attendance_date))).size;
  const hireDate = String(employee.hire_date || employee.join_date || "").slice(0, 10);
  const joined = hireDate ? new Date(`${hireDate}T00:00:00`) : null;
  const workedDays = joined
    ? Math.max(0, joined <= today ? Math.floor((today.getTime() - joined.getTime()) / 86_400_000) : 0)
    : attendanceDays;
  const monthlySalary = Math.max(0, Number(employee.salary || 0));
  const earnedAmount = monthlySalary / 30 * workedDays;
  const balance = calculateStaffWithdrawalBalance(employee.id, earnedAmount, withdrawals);
  return { workedDays, monthlySalary, earnedAmount, ...balance };
}

function statementText(employee: StaffPinEmployee, attendance: StaffAttendance[], withdrawals: StaffWithdrawal[]): string {
  const summary = calculatePersonalSummary(employee, attendance, withdrawals);
  const lines = withdrawals.map(item => {
    const status = item.status === "approved" ? "معتمد" : item.status === "pending" ? "معلق" : "مرفوض";
    return `- ${new Date(item.requested_at).toLocaleDateString("ar-EG")} | ${transactionTypeLabel(item.transaction_type)} | ${money(item.amount)} | ${status} | ${item.description}`;
  });
  return [
    `كشف حساب الموظف: ${employee.name}`,
    `الصفة: ${employee.position || roleLabel(employee.role)}`,
    `الراتب الشهري: ${money(summary.monthlySalary)}`,
    `المستحق حتى الآن: ${money(summary.earnedAmount)}`,
    `إجمالي السحوبات والمصاريف: ${money(summary.withdrawalsTotal)}`,
    `الرصيد المتبقي: ${money(summary.remainingAmount)}`,
    "",
    "تفاصيل الحركات:",
    ...(lines.length ? lines : ["لا توجد حركات"]),
  ].join("\n");
}

function PersonalSummaryCards({ employee, attendance, withdrawals }: { employee: StaffPinEmployee; attendance: StaffAttendance[]; withdrawals: StaffWithdrawal[] }) {
  const summary = calculatePersonalSummary(employee, attendance, withdrawals);
  const cards: Array<[string, string, string]> = [
    ["أيام العمل", `${summary.workedDays} يوم`, "bg-blue-50 text-blue-900"],
    ["الراتب الشهري", money(summary.monthlySalary), "bg-cyan-50 text-cyan-900"],
    ["المستحق حتى الآن", money(summary.earnedAmount), "bg-emerald-50 text-emerald-900"],
    ["السحوبات والمصاريف", money(summary.withdrawalsTotal), "bg-orange-50 text-orange-900"],
    ["باقي لك", money(summary.remainingAmount), "bg-violet-50 text-violet-900"],
  ];
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{cards.map(([label, value, tone]) => <div key={label} className={`rounded-2xl p-4 ${tone}`}><p className="text-xs font-bold opacity-70">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>)}</div>;
}

function StatementActions({ employee, attendance, withdrawals }: { employee: StaffPinEmployee; attendance: StaffAttendance[]; withdrawals: StaffWithdrawal[] }) {
  const share = () => {
    const text = statementText(employee, attendance, withdrawals);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };
  return <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={share}><Share2 className="ml-1 h-4 w-4" />مشاركة عبر WhatsApp</Button><Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="ml-1 h-4 w-4" />طباعة / PDF</Button></div>;
}

function NewMovementForm({ onSubmit, busy, employeeName }: {
  onSubmit: (amount: number, description: string, date: string, type: WithdrawalTransactionType) => Promise<void>;
  busy: boolean;
  employeeName: string;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [type, setType] = useState<WithdrawalTransactionType>("withdrawal");
  const submit = async () => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || description.trim().length < 2 || !date) return;
    try {
      await onSubmit(numericAmount, description.trim(), date, type);
      setAmount("");
      setDescription("");
      setDate(todayLocal());
      setType("withdrawal");
    } catch {
      // The page reports the server error; keep the form values so the user can retry.
    }
  };
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />تسجيل سحب أو مصروف</CardTitle><CardDescription>الحركة تخص حساب {employeeName} وتُحفظ في Supabase فوراً وتُخصم من الرصيد مباشرة.</CardDescription></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[130px_130px_1fr_170px_auto]">
    <Input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="المبلغ" aria-label="المبلغ" />
    <select value={type} onChange={event => setType(event.target.value as WithdrawalTransactionType)} className="h-10 rounded-md border border-input bg-background px-3 text-sm" aria-label="نوع الحركة"><option value="withdrawal">سحب</option><option value="expense">مصروف</option></select>
    <Input value={description} onChange={event => setDescription(event.target.value)} placeholder="البيان أو السبب" aria-label="البيان أو السبب" />
    <Input type="date" value={date} onChange={event => setDate(event.target.value)} aria-label="تاريخ الحركة" />
    <Button disabled={busy || !amount || description.trim().length < 2 || !date} onClick={() => void submit()}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "تسجيل الحركة"}</Button>
  </CardContent></Card>;
}

function MovementCard({ item }: { item: StaffWithdrawal }) {
  const status: Record<StaffWithdrawalStatus, string> = { approved: "معتمد", pending: "بانتظار الاعتماد", rejected: "مرفوض" };
  const statusTone = item.status === "approved" ? "bg-emerald-100 text-emerald-800" : item.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
  return <article className="rounded-xl border bg-white p-3 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><b className="text-lg">{money(item.amount)}</b><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{transactionTypeLabel(item.transaction_type)}</span></div><p className="mt-1 text-sm text-slate-700">{item.description}</p><p className="text-xs text-slate-500">{new Date(item.requested_at).toLocaleString("ar-EG")}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${statusTone}`}>{status[item.status]}</span></div></article>;
}

export default function StaffWithdrawals() {
  const [, navigate] = useLocation();
  const access = useStaffAccess({ monitorMembership: true });
  const [pin, setPin] = useState("");
  const [pinEmployee, setPinEmployee] = useState<StaffPinEmployee | null>(null);
  const [pinExpiresAt, setPinExpiresAt] = useState<number | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [withdrawals, setWithdrawals] = useState<StaffWithdrawal[]>([]);
  const [attendance, setAttendance] = useState<StaffAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (access.isLoading) return;
    if (!access.shopId || !access.user || !pinEmployee) {
      setWithdrawals([]);
      setAttendance([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [ownWithdrawals, ownAttendance] = await Promise.all([
        listOwnStaffWithdrawals(access.shopId, pinEmployee.id),
        listOwnStaffAttendance(access.shopId, pinEmployee.id),
      ]);
      setWithdrawals(ownWithdrawals);
      setAttendance(ownAttendance);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل سجلك من Supabase.");
      setWithdrawals([]);
      setAttendance([]);
      setPinEmployee(null);
      setPinExpiresAt(null);
      setPin("");
    } finally {
      setLoading(false);
    }
  }, [access.isLoading, access.shopId, access.user, pinEmployee]);

  useEffect(() => { clearEmployeePinLockStorage(); }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!access.shopId || !access.user || !pinEmployee) return;
    const supabase = getSupabaseClient();
    const channel = supabase.channel(`staff-withdrawals-personal:${access.shopId}:${pinEmployee.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_withdrawals", filter: `shop_id=eq.${access.shopId}` }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [access.shopId, access.user, pinEmployee?.id, refresh]);
  useEffect(() => {
    if (!pinEmployee || pinExpiresAt === null) return;
    const timeout = window.setTimeout(() => {
      setPinEmployee(null);
      setPinExpiresAt(null);
      setPin("");
      setWithdrawals([]);
      setAttendance([]);
      toast.info("انتهت جلسة PIN؛ أعد التحقق لفتح حسابك الشخصي.");
    }, Math.max(0, pinExpiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [pinEmployee?.id, pinExpiresAt]);
  useEffect(() => {
    if (!access.user) {
      setPinEmployee(null);
      setPinExpiresAt(null);
      setPin("");
      setWithdrawals([]);
      setAttendance([]);
    }
  }, [access.user?.id]);

  const unlockWithPin = async () => {
    if (!access.shopId || pin.length !== 4 || pinBusy) return;
    setPinBusy(true);
    try {
      const employee = await verifyStaffPinAccess(access.shopId, pin);
      clearEmployeePinLockStorage();
      setPinEmployee(employee);
      setPinExpiresAt(Date.now() + PIN_SESSION_MS);
      setPin("");
      toast.success("تم التحقق؛ ستظهر بيانات صاحب PIN فقط.");
    } catch (error) {
      setPin("");
      toast.error(error instanceof Error ? error.message : "تعذر التحقق من PIN.");
    } finally {
      setPinBusy(false);
    }
  };

  const saveNew = async (amount: number, description: string, date: string, type: WithdrawalTransactionType) => {
    if (!access.shopId || !pinEmployee) return;
    setBusy(true);
    try {
      const created = await createStaffWithdrawal({
        shopId: access.shopId,
        employeeId: pinEmployee.id,
        amount,
        description,
        transactionType: type,
        requestedAt: requestedAtForDate(date),
      });
      setWithdrawals(items => [created, ...items.filter(item => item.id !== created.id)]);
      toast.success(`تم تسجيل ${transactionTypeLabel(type)} في Supabase وخصمه من الرصيد.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الحركة.");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const orderedWithdrawals = useMemo(() => [...withdrawals].sort((a, b) => b.requested_at.localeCompare(a.requested_at)), [withdrawals]);
  if (access.isLoading) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6" dir="rtl"><div className="flex items-center gap-2 font-bold text-slate-700"><LoaderCircle className="h-5 w-5 animate-spin" />جارٍ التحقق من صلاحيات المتجر…</div></main>;
  if (!access.user || !access.shopId) return <main className="grid min-h-screen place-items-center p-6" dir="rtl"><Card><CardContent className="p-6 text-center">انتهت جلسة الدخول. سجّل الدخول ثم أعد فتح الشاشة.</CardContent></Card></main>;

  if (!pinEmployee) return <main className="grid min-h-screen place-items-center bg-slate-50 p-4" dir="rtl"><Card className="w-full max-w-md text-center shadow-lg"><CardHeader><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-violet-100 text-2xl font-black text-violet-800">PIN</div><CardTitle>سحوباتي — حساب شخصي</CardTitle><CardDescription>أدخل PIN الموظف المكوّن من 4 أرقام. سيُفتح سجل صاحب الرمز وحده، سواء كان مديراً أو مشرفاً أو بائعاً.</CardDescription></CardHeader><CardContent className="space-y-3"><Input autoFocus type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={pin} onChange={event => setPin(normalizeEmployeePin(event.target.value))} onKeyDown={event => { if (event.key === "Enter") void unlockWithPin(); }} placeholder="••••" aria-label="رمز PIN المكوّن من أربعة أرقام" /><Button className="w-full bg-violet-700" disabled={pin.length !== 4 || pinBusy} onClick={() => void unlockWithPin()}>{pinBusy ? <><LoaderCircle className="ml-2 h-4 w-4 animate-spin" />جارٍ التحقق…</> : "فتح حسابي"}</Button><Button className="w-full" variant="ghost" onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-1 h-4 w-4" />عودة</Button></CardContent></Card></main>;
  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6" dir="rtl"><div className="flex items-center gap-2 font-bold text-slate-700"><LoaderCircle className="h-5 w-5 animate-spin" />جارٍ تحميل سجلك الشخصي من Supabase…</div></main>;

  return <main className="min-h-screen bg-slate-50 p-4" dir="rtl"><div className="mx-auto max-w-4xl space-y-4"><header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5"><div><p className="font-bold text-violet-700">سحوباتي — حسابي فقط</p><h1 className="text-2xl font-black">{pinEmployee.name}</h1><p className="text-sm text-slate-600">{pinEmployee.position ? `${pinEmployee.position} · ` : ""}{roleLabel(pinEmployee.role)} · بيانات هذا الحساب فقط</p></div><Button variant="outline" onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-1 h-4 w-4" />عودة</Button></header><PersonalSummaryCards employee={pinEmployee} attendance={attendance} withdrawals={withdrawals} /><StatementActions employee={pinEmployee} attendance={attendance} withdrawals={withdrawals} /><NewMovementForm employeeName={pinEmployee.name} busy={busy} onSubmit={saveNew} /><Card><CardHeader><CardTitle>سجل السحوبات والمصاريف</CardTitle><CardDescription>كل حركة مرتبطة بحسابك في Supabase؛ السحب/المصروف المعلق يُخصم فوراً من الرصيد، والمرفوض لا يُخصم.</CardDescription></CardHeader><CardContent className="space-y-2">{orderedWithdrawals.length ? orderedWithdrawals.map(item => <MovementCard key={item.id} item={item} />) : <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">لا توجد حركات مسجلة.</p>}</CardContent></Card></div></main>;
}
