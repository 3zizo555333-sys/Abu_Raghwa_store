import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, KeyRound, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { browserState } from "@/lib/browserState";
import { trpc } from "@/lib/trpc";
import { useStaffAccess } from "@/hooks/useStaffAccess";

type FinanceWithdrawal = { id: string; amount: number; description: string; requestedAt: string; status: "pending" | "approved" | "rejected" };
type FinanceSummary = { workedDays: number; dailyRate: number; earnedAmount: number; approvedWithdrawals: number; pendingWithdrawals: number; remainingAmount: number };
type FinanceRecord = { employee: { id: string; name: string; position?: string; salary: number }; summary: FinanceSummary; withdrawals: FinanceWithdrawal[] };
const money = (value: number) => `${Number(value || 0).toFixed(2)} ج.م`;

function Summary({ summary }: { summary: FinanceSummary }) {
  return <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[["المستحق", summary.earnedAmount], ["السحوبات", summary.approvedWithdrawals + summary.pendingWithdrawals], ["الباقي", summary.remainingAmount], ["أيام العمل", summary.workedDays]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 font-black">{label === "أيام العمل" ? `${value} يوم` : money(Number(value))}</p></div>)}</div>;
}
function Withdrawals({ items, review }: { items: FinanceWithdrawal[]; review?: (id: string, decision: "approved" | "rejected") => void }) {
  if (!items.length) return <p className="rounded-xl bg-slate-50 p-3 text-center text-sm text-slate-500">لا توجد سحوبات مسجلة.</p>;
  return <div className="space-y-2">{items.map(item => <article key={item.id} className="rounded-xl border bg-white p-3"><div className="flex justify-between gap-2"><div><b>{money(item.amount)}</b><p className="text-sm">{item.description}</p><p className="text-xs text-slate-500">{new Date(item.requestedAt).toLocaleString("ar-EG")}</p></div><span className="text-xs font-bold">{item.status === "approved" ? "معتمد" : item.status === "rejected" ? "مرفوض" : "بانتظار المراجعة"}</span></div>{review && item.status === "pending" && <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => review(item.id, "approved")}><CheckCircle2 className="ml-1 h-4 w-4" />اعتماد</Button><Button size="sm" variant="outline" onClick={() => review(item.id, "rejected")}><XCircle className="ml-1 h-4 w-4" />رفض</Button></div>}</article>)}</div>;
}

export default function StaffWithdrawals() {
  const [, navigate] = useLocation();
  const access = useStaffAccess({ monitorMembership: true });
  const isManager = access.canViewSensitiveFinancials;
  const [financeAccess, setFinanceAccess] = useState<"manager" | "employee" | null>(null);
  const [pin, setPin] = useState("");
  const attempted = useRef<string | null>(null);
  const login = trpc.employeeFinance.login.useMutation({ onSuccess: result => { browserState.set("abu_employee_finance_token", result.token); setFinanceAccess(result.access); }, onError: error => toast.error(error.message) });
  const managerLogin = trpc.employeeFinance.loginWithStaffSession.useMutation({ onSuccess: result => { browserState.set("abu_employee_finance_token", result.token); setFinanceAccess(result.access); }, onError: error => toast.error(error.message) });
  const overview = trpc.employeeFinance.managerOverview.useQuery(undefined, { enabled: financeAccess === "manager", retry: false });
  const account = trpc.employeeFinance.myAccount.useQuery(undefined, { enabled: financeAccess === "employee", retry: false });
  const request = trpc.employeeFinance.requestWithdrawal.useMutation({ onSuccess: () => { toast.success("تم تسجيل السحبة"); void account.refetch(); }, onError: error => toast.error(error.message) });
  const record = trpc.employeeFinance.recordWithdrawalByManager.useMutation({ onSuccess: () => { toast.success("تم تسجيل السحبة"); void overview.refetch(); }, onError: error => toast.error(error.message) });
  const review = trpc.employeeFinance.reviewWithdrawal.useMutation({ onSuccess: () => { toast.success("تم تحديث حالة السحبة"); void overview.refetch(); }, onError: error => toast.error(error.message) });
  const [drafts, setDrafts] = useState<Record<string, { amount: string; description: string }>>({});

  useEffect(() => {
    if (!isManager) { attempted.current = null; return; }
    const userId = access.user?.id;
    if (!userId || financeAccess === "manager" || managerLogin.isPending || attempted.current === userId) return;
    attempted.current = userId;
    managerLogin.mutate();
  }, [access.user?.id, financeAccess, isManager, managerLogin.isPending, managerLogin.mutate]);

  if (access.isLoading) return <main className="grid min-h-screen place-items-center" dir="rtl">جارٍ التحقق من الصلاحيات...</main>;
  if (!isManager && financeAccess !== "employee") return <main className="grid min-h-screen place-items-center bg-slate-50 p-5" dir="rtl"><Card className="w-full max-w-md"><CardHeader className="text-center"><KeyRound className="mx-auto h-8 w-8 text-violet-700" /><CardTitle>💳 سحوباتي</CardTitle><CardDescription>أدخل PIN الخاص بك لفتح كشف سحوباتك.</CardDescription></CardHeader><CardContent className="space-y-3"><Input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="PIN من 4 أرقام" /><Button className="w-full" disabled={pin.length !== 4 || login.isPending} onClick={() => login.mutate({ cardPassword: pin })}>فتح سحوباتي</Button><Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>عودة</Button></CardContent></Card></main>;
  if (!isManager && financeAccess === "employee") return <main className="min-h-screen bg-slate-50 p-4" dir="rtl"><div className="mx-auto max-w-3xl space-y-4"><header className="flex justify-between"><h1 className="text-2xl font-black">سحوباتي</h1><Button variant="outline" onClick={() => navigate("/dashboard")}>عودة</Button></header>{account.isLoading || !account.data ? <Card><CardContent className="p-6 text-center">جاري تحميل كشفك...</CardContent></Card> : <><Summary summary={account.data.summary} /><Card><CardHeader><CardTitle>إضافة سحبة جديدة</CardTitle></CardHeader><CardContent><WorkerForm onSubmit={(amount, description) => request.mutate({ amount, description })} /></CardContent></Card><Withdrawals items={account.data.withdrawals} /></>}</div></main>;
  const records = (overview.data || []) as FinanceRecord[];
  return <main className="min-h-screen bg-slate-50 p-4" dir="rtl"><div className="mx-auto max-w-6xl space-y-5"><header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5"><div><p className="font-bold text-violet-700">السحوبات والعهد</p><h1 className="text-3xl font-black">قائمة سحوبات الموظفين</h1><p className="text-sm text-slate-600">للمدير والمشرف: الإضافة والمراجعة والمتابعة.</p></div><Button variant="outline" onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-1 h-4 w-4" />عودة</Button></header><div className="grid gap-4 lg:grid-cols-2">{records.map(item => { const draft = drafts[item.employee.id] || { amount: "", description: "" }; return <Card key={item.employee.id}><CardHeader><CardTitle>{item.employee.name}</CardTitle><CardDescription>{item.employee.position || "موظف"} · {money(item.employee.salary)}</CardDescription></CardHeader><CardContent className="space-y-4"><Summary summary={item.summary} /><WorkerForm onSubmit={(amount, description) => record.mutate({ employeeId: item.employee.id, amount, description })} value={draft} onChange={next => setDrafts(current => ({ ...current, [item.employee.id]: next }))} /><Withdrawals items={item.withdrawals} review={(id, decision) => review.mutate({ withdrawalId: id, decision })} /></CardContent></Card>; })}</div></div></main>;
}

function WorkerForm({ onSubmit, value = { amount: "", description: "" }, onChange }: { onSubmit: (amount: number, description: string) => void; value?: { amount: string; description: string }; onChange?: (value: { amount: string; description: string }) => void }) {
  return <div className="grid gap-2 md:grid-cols-[140px_1fr_auto]"><Input type="number" value={value.amount} onChange={event => onChange?.({ ...value, amount: event.target.value })} placeholder="المبلغ" /><Input value={value.description} onChange={event => onChange?.({ ...value, description: event.target.value })} placeholder="سبب السحبة" /><Button disabled={!value.amount || !value.description.trim()} onClick={() => onSubmit(Number(value.amount), value.description.trim())}>تسجيل</Button></div>;
}
