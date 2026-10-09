import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  CheckCircle,
  Clock3,
  LockKeyhole,
  RefreshCw,
  Shield,
  UnlockKeyhole,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import {
  listShopMembers,
  updateShopMember,
  type CloudStaffMember,
} from "@/lib/supabase/staff";

type EditableRole = "admin" | "seller";

const roleLabels: Record<CloudStaffMember["role"], string> = {
  manager: "مدير",
  admin: "مشرف",
  supervisor: "مشرف",
  seller: "بائع",
};

const statusLabels: Record<CloudStaffMember["status"], string> = {
  pending: "بانتظار الموافقة",
  active: "نشط",
  suspended: "موقوف",
};

const statusStyles: Record<CloudStaffMember["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  suspended: "bg-slate-200 text-slate-700",
};

function formatDate(value: string | null): string {
  if (!value) return "لم يسجل الدخول بعد";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "غير متوفر"
    : date.toLocaleDateString("ar-EG");
}

function isEditableRole(role: CloudStaffMember["role"]): role is EditableRole {
  return role === "admin" || role === "seller";
}

export default function UserManagement() {
  const [, navigate] = useLocation();
  const { isManager, isLoading: accessLoading } = useStaffAccess();
  const [members, setMembers] = useState<CloudStaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, EditableRole>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (accessLoading) return;
    if (!isManager) {
      setLoading(false);
      navigate("/dashboard");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void listShopMembers()
      .then((result) => {
        if (!cancelled) setMembers(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "تعذر تحميل عضويات المتجر.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessLoading, isManager, navigate, reloadKey]);

  const changeMembership = async (
    member: CloudStaffMember,
    role: EditableRole,
    status: CloudStaffMember["status"],
    confirmation?: string,
  ) => {
    if (member.role === "manager" || !isEditableRole(member.role)) return;
    if (busyMemberId) return;
    if (confirmation && !window.confirm(confirmation)) return;

    setBusyMemberId(member.user_id);
    setActionError(null);
    try {
      const updated = await updateShopMember({ userId: member.user_id, role, status });
      setMembers((current) =>
        current.map((item) => (item.user_id === updated.user_id ? updated : item)),
      );
      setSelectedRoles((current) => ({ ...current, [updated.user_id]: role }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "تعذر تحديث العضوية.");
    } finally {
      setBusyMemberId(null);
    }
  };

  const roleFor = (member: CloudStaffMember): EditableRole =>
    selectedRoles[member.user_id] ?? (isEditableRole(member.role) ? member.role : "seller");

  const pendingCount = members.filter((member) => member.status === "pending").length;
  const activeCount = members.filter((member) => member.status === "active").length;
  const suspendedCount = members.filter((member) => member.status === "suspended").length;

  if (accessLoading) {
    return <main className="mx-auto max-w-5xl p-6 text-center text-slate-600">جارٍ التحقق من الصلاحية...</main>;
  }

  if (!isManager) {
    return <main className="mx-auto max-w-5xl p-6 text-center text-slate-600">هذه الصفحة متاحة لمدير المتجر فقط.</main>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">إدارة عضويات المتجر</h1>
            <p className="mt-1 text-sm text-slate-600">راجع طلبات الانضمام وحدّث صلاحيات وحالة أعضاء المتجر.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> العودة
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">بانتظار الموافقة</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">{pendingCount}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm text-emerald-800">عضويات نشطة</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">{activeCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-600">عضويات موقوفة</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">{suspendedCount}</p>
          </div>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-slate-700" /> أعضاء المتجر
              </CardTitle>
              <CardDescription className="mt-1">تُعرض العضويات من Supabase. تعطيل العضوية لا يحذف حساب Auth.</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((value) => value + 1)}
              disabled={loading}
              className="shrink-0 gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> تحديث
            </Button>
          </CardHeader>
          <CardContent>
            {actionError && (
              <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {actionError}
              </p>
            )}
            {loading ? (
              <p className="py-10 text-center text-slate-500">جارٍ تحميل العضويات...</p>
            ) : loadError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-red-800">
                <p>{loadError}</p>
                <Button variant="outline" className="mt-3" onClick={() => setReloadKey((value) => value + 1)}>إعادة المحاولة</Button>
              </div>
            ) : members.length === 0 ? (
              <p className="py-10 text-center text-slate-500">لا توجد عضويات لعرضها حاليًا.</p>
            ) : (
              <div className="space-y-3">
                {members.map((member) => {
                  const isBusy = busyMemberId === member.user_id;
                  const isManagerMember = member.role === "manager";
                  const canManage = isEditableRole(member.role);
                  const selectedRole = roleFor(member);
                  return (
                    <section key={member.user_id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="break-all font-semibold text-slate-900">{member.display_name || member.email}</p>
                          {member.display_name && <p className="break-all text-sm text-slate-600">{member.email}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>الدور: {roleLabels[member.role]}</span>
                            <span aria-hidden="true">•</span>
                            <span>تاريخ الانضمام: {formatDate(member.created_at)}</span>
                            <span aria-hidden="true">•</span>
                            <span>آخر دخول: {formatDate(member.last_sign_in_at)}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[member.status]}`}>
                            {member.status === "pending" ? <Clock3 className="h-3.5 w-3.5" /> : member.status === "active" ? <CheckCircle className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
                            {statusLabels[member.status]}
                          </span>
                          {canManage && (
                            <>
                              <label className="sr-only" htmlFor={`role-${member.user_id}`}>دور {member.email}</label>
                              <select
                                id={`role-${member.user_id}`}
                                value={selectedRole}
                                onChange={(event) => setSelectedRoles((current) => ({
                                  ...current,
                                  [member.user_id]: event.target.value as EditableRole,
                                }))}
                                disabled={isBusy || Boolean(busyMemberId)}
                                className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
                              >
                                <option value="seller">بائع</option>
                                <option value="admin">مشرف</option>
                              </select>
                              {member.status === "pending" ? (
                                <Button
                                  onClick={() => void changeMembership(member, selectedRole, "active")}
                                  disabled={Boolean(busyMemberId)}
                                  className="gap-1 bg-emerald-700 text-white hover:bg-emerald-800"
                                >
                                  <CheckCircle className="h-4 w-4" /> {isBusy ? "جارٍ الحفظ..." : "موافقة وتفعيل"}
                                </Button>
                              ) : selectedRole !== member.role ? (
                                <Button
                                  variant="outline"
                                  onClick={() => void changeMembership(member, selectedRole, member.status)}
                                  disabled={Boolean(busyMemberId)}
                                >
                                  {isBusy ? "جارٍ الحفظ..." : "حفظ الدور"}
                                </Button>
                              ) : null}
                              {member.status === "active" ? (
                                <Button
                                  variant="destructive"
                                  onClick={() => void changeMembership(member, selectedRole, "suspended", `هل تريد إيقاف عضوية ${member.email}؟`)}
                                  disabled={Boolean(busyMemberId)}
                                  className="gap-1"
                                >
                                  <LockKeyhole className="h-4 w-4" /> إيقاف العضوية
                                </Button>
                              ) : member.status === "suspended" ? (
                                <Button
                                  variant="outline"
                                  onClick={() => void changeMembership(member, selectedRole, "active", `هل تريد إعادة تفعيل عضوية ${member.email}؟`)}
                                  disabled={Boolean(busyMemberId)}
                                  className="gap-1"
                                >
                                  <UnlockKeyhole className="h-4 w-4" /> إعادة التفعيل
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  onClick={() => void changeMembership(member, selectedRole, "suspended", `هل تريد تعطيل طلب ${member.email}؟`)}
                                  disabled={Boolean(busyMemberId)}
                                  className="gap-1"
                                >
                                  <LockKeyhole className="h-4 w-4" /> تعطيل الطلب
                                </Button>
                              )}
                            </>
                          )}
                          {isManagerMember && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
                              <Shield className="h-4 w-4" /> دور المدير محمي
                            </span>
                          )}
                          {!canManage && !isManagerMember && (
                            <span className="text-xs text-slate-500">هذا الدور للعرض فقط حاليًا.</span>
                          )}
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-bold">إدارة بطاقات الرواتب غير متاحة حاليًا.</p>
          <p className="mt-1">ستُتاح إدارة بطاقات الرواتب بعد ترحيلها إلى Supabase.</p>
        </aside>
      </main>
    </div>
  );
}
