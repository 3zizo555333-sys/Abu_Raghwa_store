import { browserState } from "@/lib/browserState";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Banknote, CheckCircle2, Clock, Edit2, KeyRound, Loader2, LockKeyhole, LogOut, Plus, ShieldCheck, Trash2, UnlockKeyhole, WalletCards, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { normalizeAttendance, normalizeEmployees, type AttendanceRecord, type EmployeeRecord } from "@/lib/employeeData";
import { trpc } from "@/lib/trpc";
import { deleteStaffEmployee, listStaffAttendance, listStaffEmployees, saveStaffAttendance, saveStaffEmployee } from "@/lib/supabase/operations";
import { listStaffFinanceData, type StaffWithdrawal } from "@/lib/supabase/staffWithdrawals";
import { getSupabaseClient } from "@/lib/supabase/client";
import { listStaffPasswordResetRequests, managerSetStaffPassword, type PasswordResetRequest } from "@/lib/supabase/passwordResets";
import { adminSetStaffEmployeePin, listStaffEmployeePinStatuses, setStaffEmployeePinAccess, type StaffPinStatus } from "@/lib/supabase/staffEmployeePins";
import { useStaffAccess } from "@/hooks/useStaffAccess";

type FinanceSummary = { workedDays: number; dailyRate: number; earnedAmount: number; approvedWithdrawals: number; pendingWithdrawals: number; remainingAmount: number };
type FinanceWithdrawal = { id: string; amount: number; description: string; requestedAt: string; status: "pending" | "approved" | "rejected" };
type FinanceRecord = { employee: EmployeeRecord; pinConfigured: boolean; cardActive: boolean; summary: FinanceSummary; withdrawals: FinanceWithdrawal[] };

const money = (value: number) => `${Number(value || 0).toFixed(2)} ج.م`;
const todayIso = () => new Date().toISOString().slice(0, 10);
function calculateAutomaticEmployeeSummary(employee: EmployeeRecord, withdrawals: StaffWithdrawal[], now = new Date()): FinanceSummary {
  const hireDate = String(employee.joinDate || "").slice(0, 10);
  const joined = /^\d{4}-\d{2}-\d{2}$/.test(hireDate) ? new Date(`${hireDate}T00:00:00`) : null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const joinedDay = joined ? new Date(joined.getFullYear(), joined.getMonth(), joined.getDate()) : null;
  const workedDays = joinedDay && joinedDay <= today ? Math.floor((today.getTime() - joinedDay.getTime()) / 86_400_000) : 0;
  const dailyRate = Math.max(0, Number(employee.salary) || 0) / 30;
  const employeeWithdrawals = withdrawals.filter(item => item.employee_id === employee.id);
  const approvedWithdrawals = employeeWithdrawals.filter(item => item.status === "approved").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pendingWithdrawals = employeeWithdrawals.filter(item => item.status === "pending").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return { workedDays, dailyRate, earnedAmount: workedDays * dailyRate, approvedWithdrawals, pendingWithdrawals, remainingAmount: workedDays * dailyRate - approvedWithdrawals };
}

function FinanceCounter({ summary }: { summary: FinanceSummary }) {
  const cards = [["اشتغل", `${summary.workedDays} يوم`, "bg-blue-50 text-blue-900"], ["المستحق", money(summary.earnedAmount), "bg-emerald-50 text-emerald-900"], ["السحوبات", money(summary.approvedWithdrawals + summary.pendingWithdrawals), "bg-orange-50 text-orange-900"], ["الباقي", money(summary.remainingAmount), "bg-violet-50 text-violet-900"]];
  return <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{cards.map(([label, value, tone]) => <div key={label} className={`rounded-xl p-3 ${tone}`}><p className="text-xs font-bold opacity-70">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>)}</div>;
}

function WithdrawalList({ withdrawals, onReview }: { withdrawals: FinanceWithdrawal[]; onReview?: (id: string, decision: "approved" | "rejected") => void }) {
  if (!withdrawals.length) return <p className="rounded-xl bg-slate-50 p-3 text-center text-sm text-slate-500">لا توجد سحوبات مسجلة.</p>;
  return <div className="space-y-2">{withdrawals.map(item => <article key={item.id} className="rounded-xl border border-slate-100 bg-white p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-black">{money(item.amount)}</p><p className="text-sm">{item.description}</p><p className="text-xs text-slate-500">{new Date(item.requestedAt).toLocaleString("ar-EG")}</p></div><span className={`rounded-full px-2 py-1 text-xs ${item.status === "approved" ? "bg-emerald-100 text-emerald-800" : item.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{item.status === "approved" ? "معتمد" : item.status === "rejected" ? "مرفوض" : "بانتظار المدير"}</span></div>{onReview && item.status === "pending" && <div className="mt-3 flex gap-2"><Button size="sm" className="bg-emerald-600" onClick={() => onReview(item.id, "approved")}><CheckCircle2 className="ml-1 h-4 w-4" />اعتماد</Button><Button size="sm" variant="outline" onClick={() => onReview(item.id, "rejected")}><XCircle className="ml-1 h-4 w-4" />رفض</Button></div>}</article>)}</div>;
}

export default function Employees() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const staffAccess = useStaffAccess({ monitorMembership: true });
  const managerLoginAttemptedForUser = useRef<string | null>(null);
  const [storedEmployees, setStoredEmployees] = useState<EmployeeRecord[]>([]);
  const [storedAttendance, setStoredAttendance] = useState<AttendanceRecord[]>([]);
  const [cloudWithdrawals, setCloudWithdrawals] = useState<StaffWithdrawal[]>([]);
  const employees = normalizeEmployees(storedEmployees);
  const attendance = normalizeAttendance(storedAttendance);
  const isManager = staffAccess.canViewSensitiveFinancials;
  const canSetEmployeePins = staffAccess.user?.role === "manager" || staffAccess.user?.role === "admin";
  const [financeAccess, setFinanceAccess] = useState<"manager" | "employee" | null>(null);
  const [cardPassword, setCardPassword] = useState("");
  const [forgotPinName, setForgotPinName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", phone: "", authEmail: "", position: "", role: "seller" as EmployeeRecord["role"], salary: "", joinDate: todayIso() });
  const [cardPasswords, setCardPasswords] = useState<Record<string, string>>({});
  const [withdrawalDrafts, setWithdrawalDrafts] = useState<Record<string, { amount: string; description: string }>>({});
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [passwordResetRequests, setPasswordResetRequests] = useState<PasswordResetRequest[]>([]);
  const [newPasswords, setNewPasswords] = useState<Record<string, string>>({});
  const [settingPasswordFor, setSettingPasswordFor] = useState<string | null>(null);
  const [deletedEmployeeIds, setDeletedEmployeeIds] = useState<Set<string>>(new Set());
  const [pinStatuses, setPinStatuses] = useState<Record<string, StaffPinStatus>>({});
  const [settingPinFor, setSettingPinFor] = useState<string | null>(null);

  useEffect(() => {
    if (!staffAccess.shopId) return;
    Promise.all([listStaffEmployees(), listStaffAttendance(), listStaffFinanceData(staffAccess.shopId)]).then(([employeeRows, attendanceRows, financeData]) => {
      setStoredEmployees(employeeRows.map(row => ({ id: row.id, name: row.name, phone: row.phone, authEmail: row.auth_email || "", position: row.position, role: row.role, salary: row.salary, joinDate: row.join_date })));
      setStoredAttendance(attendanceRows.map(row => ({ id: row.id, employeeId: row.employee_id, date: row.attendance_date, checkIn: row.check_in || "", checkOut: row.check_out || "", status: row.status === "leave" ? "absent" : row.status })));
      setCloudWithdrawals(financeData.withdrawals);
    }).catch(error => toast.error(error instanceof Error ? error.message : "تعذر تحميل بيانات الموظفين السحابية"));
  }, [staffAccess.shopId]);
  useEffect(() => {
    if (!staffAccess.shopId) return;
    const supabase = getSupabaseClient();
    const channel = supabase.channel(`employees-withdrawals:${staffAccess.shopId}`).on("postgres_changes", { event: "*", schema: "public", table: "staff_withdrawals", filter: `shop_id=eq.${staffAccess.shopId}` }, () => {
      void listStaffFinanceData(staffAccess.shopId as string).then(data => setCloudWithdrawals(data.withdrawals)).catch(() => undefined);
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [staffAccess.shopId]);

  useEffect(() => {
    if (!isManager) return;
    void listStaffPasswordResetRequests().then(setPasswordResetRequests).catch(error => toast.error(error instanceof Error ? error.message : "تعذر تحميل طلبات استعادة كلمات المرور"));
  }, [isManager]);

  useEffect(() => {
    if (!canSetEmployeePins) return;
    void listStaffEmployeePinStatuses().then(rows => setPinStatuses(Object.fromEntries(rows.map(row => [row.employee_id, row])))).catch(error => toast.error(error instanceof Error ? error.message : "تعذر تحميل حالة PIN الموظفين"));
  }, [canSetEmployeePins]);

  const login = trpc.employeeFinance.login.useMutation({ onSuccess: result => { browserState.set("abu_employee_finance_token", result.token); setFinanceAccess(result.access); }, onError: error => toast.error(error.message) });
  const managerLogin = trpc.employeeFinance.loginWithStaffSession.useMutation({ onSuccess: result => { browserState.set("abu_employee_finance_token", result.token); setFinanceAccess(result.access); }, onError: error => toast.error(error.message) });
  const managerOverview = trpc.employeeFinance.managerOverview.useQuery(undefined, { enabled: financeAccess === "manager", retry: false });
  const myAccount = trpc.employeeFinance.myAccount.useQuery(undefined, { enabled: financeAccess === "employee", retry: false });
  const forgotPin = trpc.employeeFinance.forgotPin.useMutation({ onSuccess: () => { toast.success("تم إرسال طلب إعادة تعيين PIN إلى المدير"); setForgotPinName(""); }, onError: error => toast.error(error.message) });
  const requestWithdrawal = trpc.employeeFinance.requestWithdrawal.useMutation({ onSuccess: () => { toast.success("تم تسجيل السحبة"); utils.employeeFinance.myAccount.invalidate(); }, onError: error => toast.error(error.message) });
  const recordWithdrawal = trpc.employeeFinance.recordWithdrawalByManager.useMutation({ onSuccess: () => { toast.success("تم تسجيل السحبة وتحديث العداد"); utils.employeeFinance.managerOverview.invalidate(); }, onError: error => toast.error(error.message) });
  const reviewWithdrawal = trpc.employeeFinance.reviewWithdrawal.useMutation({ onSuccess: () => utils.employeeFinance.managerOverview.invalidate(), onError: error => toast.error(error.message) });
  const deleteEmployee = async (employeeId: string) => {
    try {
      await deleteStaffEmployee(employeeId);
      setDeletedEmployeeIds(current => new Set(current).add(employeeId));
      setStoredEmployees(current => normalizeEmployees(current).filter(item => item.id !== employeeId));
      setStoredAttendance(current => normalizeAttendance(current).filter(item => item.employeeId !== employeeId));
      utils.employeeFinance.managerOverview.invalidate();
      toast.success("تم حذف الموظف نهائيًا");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حذف الموظف");
    }
  };

  const saveEmployeePin = async (employeeId: string) => {
    if (!canSetEmployeePins || settingPinFor) return;
    const pin = cardPasswords[employeeId] || "";
    if (!/^\d{4}$/.test(pin)) { toast.error("يجب أن يتكون PIN من 4 أرقام"); return; }
    setSettingPinFor(employeeId);
    try {
      await adminSetStaffEmployeePin(employeeId, pin);
      setPinStatuses(current => ({ ...current, [employeeId]: { employee_id: employeeId, pin_configured: true, pin_enabled: true } }));
      setCardPasswords(current => { const next = { ...current }; delete next[employeeId]; return next; });
      toast.success("تم حفظ PIN الموظف في Supabase وأصبح جاهزاً لفتح صفحة سحوباته");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ PIN الموظف في Supabase");
    } finally {
      setSettingPinFor(null);
    }
  };

  const toggleEmployeePinAccess = async (employeeId: string) => {
    if (!canSetEmployeePins || settingPinFor) return;
    const enabled = !pinStatuses[employeeId]?.pin_enabled;
    setSettingPinFor(employeeId);
    try {
      await setStaffEmployeePinAccess(employeeId, enabled);
      setPinStatuses(current => ({ ...current, [employeeId]: { employee_id: employeeId, pin_configured: true, pin_enabled: enabled } }));
      toast.success(enabled ? "تمت إعادة تفعيل PIN الموظف" : "تم إيقاف PIN الموظف وإلغاء جلسات التحقق النشطة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تغيير حالة PIN الموظف");
    } finally {
      setSettingPinFor(null);
    }
  };

  useEffect(() => {
    if (!isManager) { managerLoginAttemptedForUser.current = null; return; }
    const userId = staffAccess.user?.id;
    if (!userId || financeAccess === "manager" || managerLogin.isPending || managerLoginAttemptedForUser.current === userId) return;
    managerLoginAttemptedForUser.current = userId;
    managerLogin.mutate();
  }, [financeAccess, isManager, managerLogin.isPending, managerLogin.mutate, staffAccess.user?.id]);
  useEffect(() => { if (!isManager) { browserState.remove("abu_employee_finance_token"); setFinanceAccess(null); } }, [isManager]);

  const saveEmployee = async () => {
    if (isSavingEmployee) return;
    if (!formData.name.trim()) { toast.error("اكتب اسم الموظف"); return; }
    setIsSavingEmployee(true);
    try {
      const record = { name: formData.name.trim(), phone: formData.phone.trim(), authEmail: formData.authEmail.trim().toLowerCase(), position: formData.position.trim(), role: formData.role, salary: Math.max(0, Number(formData.salary) || 0), joinDate: formData.joinDate || todayIso() };
      const saved = await saveStaffEmployee({ ...(editingId ? { id: editingId } : {}), name: record.name, phone: record.phone, auth_email: record.authEmail || null, position: record.position, role: record.role, salary: record.salary, join_date: record.joinDate, hire_date: record.joinDate, is_active: true, metadata: { auth_email: record.authEmail || null } });
      const employee = { id: saved.id, name: saved.name, phone: saved.phone, authEmail: saved.auth_email || record.authEmail, position: saved.position, role: saved.role, salary: saved.salary, joinDate: saved.join_date };
      setStoredEmployees(current => editingId ? normalizeEmployees(current).map(item => item.id === editingId ? employee : item) : [...normalizeEmployees(current), employee]);
      setFormData({ name: "", phone: "", authEmail: "", position: "", role: "seller", salary: "", joinDate: todayIso() }); setEditingId(null); setShowForm(false); toast.success("تم حفظ الموظف بنجاح");
    } catch (error) {
      toast.error(error instanceof Error ? `تعذر حفظ الموظف: ${error.message}` : "تعذر حفظ الموظف بسبب خطأ غير معروف");
    } finally {
      setIsSavingEmployee(false);
    }
  };
  const legacyRecords = ((managerOverview.data || []) as FinanceRecord[]).filter(record => !deletedEmployeeIds.has(record.employee.id));
  const records = employees.filter(employee => !deletedEmployeeIds.has(employee.id)).map(employee => {
    const legacy = legacyRecords.find(record => record.employee.id === employee.id);
    return { employee, pinConfigured: legacy?.pinConfigured || false, cardActive: legacy?.cardActive || false, summary: calculateAutomaticEmployeeSummary(employee, cloudWithdrawals), withdrawals: cloudWithdrawals.filter(item => item.employee_id === employee.id).map(item => ({ id: item.id, amount: Number(item.amount), description: item.description, requestedAt: item.requested_at, status: item.status })) } satisfies FinanceRecord;
  });
  const forgotPinRequests = ((managerOverview.data?.[0] as any)?.forgotPinRequests || []) as Array<{ id: string; employeeName: string; createdAt: string }>;
  const recordsById = new Map(records.map(record => [record.employee.id, record]));
  const resetRequestByEmployeeId = new Map(passwordResetRequests.filter(request => request.employee_id).map(request => [request.employee_id as string, request]));
  const displayedEmployees = [...employees]; legacyRecords.forEach(record => { if (!displayedEmployees.some(item => item.id === record.employee.id)) displayedEmployees.push(record.employee); });
  const checkIn = async (employeeId: string) => { const today = new Date().toISOString().slice(0, 10); if (attendance.some(item => item.employeeId === employeeId && item.date === today)) return toast.error("تم تسجيل الحضور بالفعل"); const saved = await saveStaffAttendance({ id: crypto.randomUUID(), employee_id: employeeId, attendance_date: today, check_in: new Date().toISOString(), check_out: null, status: "present", notes: "" }); setStoredAttendance(current => [...current, { id: saved.id, employeeId: saved.employee_id, date: saved.attendance_date, checkIn: saved.check_in || "", checkOut: saved.check_out || "", status: saved.status === "leave" ? "absent" : saved.status }]); };

  if (staffAccess.isLoading) return <main className="grid min-h-screen place-items-center bg-slate-50 p-5" dir="rtl"><p className="rounded-xl bg-white p-5 shadow">جارٍ التحقق من صلاحيات المتجر...</p></main>;
  if (!isManager && financeAccess !== "employee") return <main className="grid min-h-screen place-items-center bg-slate-50 p-5" dir="rtl"><Card className="w-full max-w-md text-center shadow-lg"><CardHeader><KeyRound className="mx-auto h-8 w-8 text-violet-700" /><CardTitle>💳 سحوباتي</CardTitle><CardDescription>أدخل رمز PIN الرقمي المكوّن من 4 أرقام الذي منحه لك المدير. يمكنك إضافة سحب فقط، ولا يمكن تعديل السجلات السابقة أو حذفها.</CardDescription></CardHeader><CardContent className="space-y-3"><Input type="password" inputMode="numeric" maxLength={4} value={cardPassword} onChange={event => setCardPassword(event.target.value.replace(/\D/g, "").slice(0, 4))} onKeyDown={event => event.key === "Enter" && cardPassword.length === 4 && login.mutate({ cardPassword })} placeholder="PIN من 4 أرقام" /><Button className="w-full bg-violet-700" disabled={cardPassword.length !== 4 || login.isPending} onClick={() => login.mutate({ cardPassword })}>فتح سحوباتي</Button><Input value={forgotPinName} onChange={event => setForgotPinName(event.target.value)} placeholder="اسمك لإرسال طلب إعادة التعيين" /><Button type="button" className="w-full" variant="ghost" disabled={forgotPin.isPending || forgotPinName.trim().length < 2} onClick={() => forgotPin.mutate({ employeeName: forgotPinName.trim() })}>نسيت رمز الـPIN؟</Button><Button className="w-full" variant="ghost" onClick={() => navigate("/dashboard")}>عودة</Button></CardContent></Card></main>;
  if (!isManager && financeAccess === "employee") return <main className="min-h-screen bg-slate-50 p-4" dir="rtl"><div className="mx-auto max-w-3xl space-y-4">{myAccount.isLoading || !myAccount.data ? <p className="rounded-xl bg-white p-5 text-center">جاري فتح بطاقتك...</p> : <><header className="flex justify-between"><div><p className="font-bold text-violet-700">بطاقتي فقط</p><h1 className="text-2xl font-black">{myAccount.data.employee.name}</h1></div><Button variant="outline" onClick={() => navigate("/dashboard")}>عودة</Button></header><Card><CardContent className="pt-6"><FinanceCounter summary={myAccount.data.summary} /></CardContent></Card><Card><CardHeader><CardTitle>تسجيل سحبة</CardTitle></CardHeader><CardContent><div className="grid gap-2 md:grid-cols-[160px_1fr_auto]"><Input id="worker-withdrawal-amount" type="number" placeholder="المبلغ" /><Input id="worker-withdrawal-description" placeholder="سبب السحبة" /><Button onClick={() => { const amount = Number((document.getElementById("worker-withdrawal-amount") as HTMLInputElement)?.value); const description = (document.getElementById("worker-withdrawal-description") as HTMLInputElement)?.value.trim(); if (amount && description) requestWithdrawal.mutate({ amount, description }); }}>تسجيل</Button></div></CardContent></Card><Card><CardHeader><CardTitle>سحوباتي</CardTitle></CardHeader><CardContent><WithdrawalList withdrawals={myAccount.data.withdrawals} /></CardContent></Card></>}</div></main>;

  return <main className="min-h-screen bg-slate-50" dir="rtl"><header className="bg-white shadow-sm"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 p-5"><div><h1 className="text-3xl font-black">إدارة الموظفين</h1><p className="text-slate-600">أنت وحدك تمنح كلمة المرور، توقف البطاقة أو تعيد تفعيلها.</p></div><div className="flex gap-2"><Button onClick={() => setShowForm(value => !value)}><Plus className="ml-1 h-4 w-4" />موظف جديد</Button><Button variant="outline" onClick={() => navigate("/user-management")}><ShieldCheck className="ml-1 h-4 w-4" />إدارة الدخول</Button><Button variant="outline" onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-1 h-4 w-4" />عودة</Button></div></div></header><div className="mx-auto max-w-7xl space-y-5 p-4">{passwordResetRequests.length > 0 && <Card className="border-red-200 bg-red-50"><CardHeader><CardTitle>طلبات استعادة كلمات المرور ({passwordResetRequests.length})</CardTitle><CardDescription>يوجد طلب استعادة بانتظار معالجة المدير.</CardDescription></CardHeader><CardContent className="space-y-3">{passwordResetRequests.map(request => <div key={request.id} className="rounded-lg bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span><strong>{request.employee_name || "موظف"}</strong> طلب إعادة تعيين عبر {request.identifier}</span><span className="text-xs text-slate-500">{new Date(request.created_at).toLocaleString("ar-EG")}</span></div>{request.employee_id && <div className="mt-2 flex flex-wrap gap-2"><Input type="password" minLength={8} placeholder="كلمة مرور جديدة (8 أحرف على الأقل)" value={newPasswords[request.employee_id] || ""} onChange={event => setNewPasswords(current => ({ ...current, [request.employee_id as string]: event.target.value }))} /><Button disabled={settingPasswordFor === request.employee_id || (newPasswords[request.employee_id] || "").length < 8} onClick={async () => { const id = request.employee_id as string; setSettingPasswordFor(id); try { await managerSetStaffPassword(id, newPasswords[id]); setPasswordResetRequests(current => current.filter(item => item.id !== request.id)); setNewPasswords(current => { const next = { ...current }; delete next[id]; return next; }); toast.success("تم تعيين كلمة المرور الجديدة للموظف"); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تعيين كلمة المرور"); } finally { setSettingPasswordFor(null); } }}>تعيين كلمة مرور جديدة</Button></div>}</div>)}</CardContent></Card>}{forgotPinRequests.length > 0 && <Card className="border-amber-200 bg-amber-50"><CardHeader><CardTitle>طلبات إعادة تعيين PIN</CardTitle></CardHeader><CardContent className="space-y-2">{forgotPinRequests.map(request => <div key={request.id} className="flex items-center justify-between rounded-lg bg-white p-3"><span>طلب إعادة تعيين PIN للموظف <strong>{request.employeeName}</strong></span><span className="text-xs text-slate-500">{new Date(request.createdAt).toLocaleString("ar-EG")}</span></div>)}</CardContent></Card>}{showForm && <Card><CardHeader><CardTitle>{editingId ? "تعديل العامل" : "إضافة عامل"}</CardTitle></CardHeader><form onSubmit={event => { event.preventDefault(); void saveEmployee(); }}><CardContent className="space-y-3"><div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6"><Input value={formData.name} onChange={event => setFormData({ ...formData, name: event.target.value })} placeholder="اسم العامل" /><Input value={formData.phone} onChange={event => setFormData({ ...formData, phone: event.target.value })} placeholder="الهاتف" /><Input type="email" value={formData.authEmail} onChange={event => setFormData({ ...formData, authEmail: event.target.value })} placeholder="البريد الإلكتروني لتسجيل الدخول" /><Input value={formData.position} onChange={event => setFormData({ ...formData, position: event.target.value })} placeholder="المسمى الوظيفي (اختياري)" /><select value={formData.role} onChange={event => setFormData({ ...formData, role: event.target.value as EmployeeRecord["role"] })} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="supervisor">مشرف</option><option value="cashier">كاشير</option><option value="seller">بائع</option></select><Input type="number" value={formData.salary} onChange={event => setFormData({ ...formData, salary: event.target.value })} placeholder="الراتب" /><Input type="date" value={formData.joinDate} onChange={event => setFormData({ ...formData, joinDate: event.target.value })} /></div><Button type="submit" disabled={isSavingEmployee}>{isSavingEmployee ? <><Loader2 className="ml-1 h-4 w-4 animate-spin" />جارٍ الحفظ...</> : "حفظ العامل"}</Button></CardContent></form></Card>}<div className="grid gap-4 lg:grid-cols-2">{displayedEmployees.map(employee => { const record = recordsById.get(employee.id); const summary = record?.summary || { workedDays: 0, dailyRate: Number(employee.salary || 0) / 30, earnedAmount: 0, approvedWithdrawals: 0, pendingWithdrawals: 0, remainingAmount: 0 }; const draft = withdrawalDrafts[employee.id] || { amount: "", description: "" }; const pinStatus = pinStatuses[employee.id]; const pinConfigured = pinStatus?.pin_configured ?? false; const pinEnabled = pinStatus?.pin_enabled ?? false; return <Card key={employee.id}><CardHeader><div className="flex justify-between gap-2"><div><CardTitle className="flex flex-wrap items-center gap-2">{employee.name}{resetRequestByEmployeeId.has(employee.id) && <span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-800">طلب استعادة كلمة المرور</span>}</CardTitle><CardDescription>{employee.position || "موظف"} · {employee.role === "supervisor" ? "مشرف" : employee.role === "cashier" ? "كاشير" : "بائع"} · {money(employee.salary)}{employee.authEmail ? ` · ${employee.authEmail}` : ""}</CardDescription></div><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => { setFormData({ name: employee.name, phone: employee.phone || "", authEmail: employee.authEmail || "", position: employee.position || "", role: employee.role || "seller", salary: String(employee.salary || ""), joinDate: employee.joinDate || todayIso() }); setEditingId(employee.id); setShowForm(true); }}><Edit2 className="h-4 w-4" /></Button><Button size="sm" variant="destructive" onClick={() => { if (confirm("حذف العامل نهائيًا؟")) void deleteEmployee(employee.id); }}><Trash2 className="h-4 w-4" /></Button></div></div></CardHeader><CardContent className="space-y-4"><FinanceCounter summary={summary} /><section className="rounded-xl border bg-slate-50 p-3"><div className="flex items-center justify-between"><b>حالة PIN الموظف</b><span className={`rounded-full px-2 py-1 text-xs ${!pinConfigured ? "bg-slate-200 text-slate-700" : pinEnabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{!pinConfigured ? "لم يُضبط" : pinEnabled ? "مفعّل" : "موقوف"}</span></div><p className="mt-1 text-xs text-slate-600">يُحفظ PIN مشفراً في Supabase، ولا يحتاج الموظف إلى تسجيل دخول منفصل لتعيينه.</p>{canSetEmployeePins ? <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]"><Input type="text" inputMode="numeric" maxLength={4} autoComplete="off" value={cardPasswords[employee.id] || ""} onChange={event => setCardPasswords(current => ({ ...current, [employee.id]: event.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="PIN جديد (4 أرقام)" /><Button type="button" variant="outline" onClick={() => { const bytes = crypto.getRandomValues(new Uint32Array(1)); const pin = String(bytes[0] % 10000).padStart(4, "0"); setCardPasswords(current => ({ ...current, [employee.id]: pin })); }}>توليد PIN</Button><Button disabled={(cardPasswords[employee.id] || "").length !== 4 || settingPinFor === employee.id} onClick={() => void saveEmployeePin(employee.id)}>{settingPinFor === employee.id ? "جارٍ الحفظ…" : "حفظ/تغيير PIN"}</Button>{pinConfigured && <Button size="sm" type="button" variant={pinEnabled ? "destructive" : "outline"} disabled={settingPinFor === employee.id} onClick={() => void toggleEmployeePinAccess(employee.id)}>{pinEnabled ? <><LockKeyhole className="ml-1 h-4 w-4" />إيقاف PIN</> : <><UnlockKeyhole className="ml-1 h-4 w-4" />تفعيل PIN</>}</Button>}</div> : <p className="mt-3 text-sm text-slate-500">تعيين PIN الموظف متاح للمدير/Admin فقط.</p>}</section><section className="rounded-xl border p-3"><div className="flex justify-between"><b>حضور اليوم</b><Button size="sm" onClick={() => checkIn(employee.id)}><Clock className="ml-1 h-4 w-4" />تسجيل حضور</Button></div></section><section className="rounded-xl border border-orange-200 bg-orange-50 p-3"><b>تسجيل سحبة للعامل</b><div className="mt-2 grid gap-2 md:grid-cols-[120px_1fr_auto]"><Input type="number" value={draft.amount} onChange={event => setWithdrawalDrafts(current => ({ ...current, [employee.id]: { ...draft, amount: event.target.value } }))} placeholder="المبلغ" /><Input value={draft.description} onChange={event => setWithdrawalDrafts(current => ({ ...current, [employee.id]: { ...draft, description: event.target.value } }))} placeholder="سبب السحبة" /><Button disabled={!draft.amount || !draft.description.trim()} onClick={() => recordWithdrawal.mutate({ employeeId: employee.id, amount: Number(draft.amount), description: draft.description.trim() })}>تسجيل</Button></div></section><section><b>سحوبات العامل</b><div className="mt-2"><WithdrawalList withdrawals={record?.withdrawals || []} onReview={(withdrawalId, decision) => reviewWithdrawal.mutate({ withdrawalId, decision })} /></div></section></CardContent></Card>; })}</div></div></main>;
}
