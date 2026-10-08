import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Users, CheckCircle, XCircle, Shield, Trash2, LockKeyhole, UnlockKeyhole } from "lucide-react";
import { type AccessUser } from "@/lib/accessControl";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";

type User = AccessUser;

export default function UserManagement() {
  const [, navigate] = useLocation();
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("abu_raghwa_users") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<"admin" | "seller">("seller");
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);
  const [managerCardReady, setManagerCardReady] = useState(false);
  const [staffSessionReady, setStaffSessionReady] = useState(() => Boolean(sessionStorage.getItem("abu_staff_sync_token")));
  const [cardPasswords, setCardPasswords] = useState<Record<string, string>>({});
  const utils = trpc.useUtils();
  const staffUsers = trpc.staffSync.list.useQuery(undefined, { enabled: managerCardReady && staffSessionReady, retry: false, refetchInterval: managerCardReady && staffSessionReady ? 5_000 : false });
  const approveStaff = trpc.staffSync.approve.useMutation({
    onSuccess: result => {
      // The server is the source of truth. Replace the optimistic record with the
      // approved record returned by the mutation so polling cannot resurrect it.
      setUsers(current => current.map(user => user.email.toLowerCase() === result.email.toLowerCase()
        ? { ...user, ...result.user, role: result.role, status: "APPROVED" as const, isApproved: true, isBlocked: false }
        : user));
      void staffUsers.refetch();
    },
  });
  const updateStaff = trpc.staffSync.update.useMutation({ onSuccess: () => { void staffUsers.refetch(); } });
  const removeStaff = trpc.staffSync.remove.useMutation({ onSuccess: () => { void staffUsers.refetch(); } });
  const openManagerCards = trpc.employeeFinance.loginWithStaffSession.useMutation({
    onSuccess: result => { sessionStorage.setItem("abu_employee_finance_token", result.token); setManagerCardReady(result.access === "manager"); },
  });
  const employeeCards = trpc.employeeFinance.managerOverview.useQuery(undefined, { enabled: managerCardReady, retry: false });
  const configureCard = trpc.employeeFinance.configureEmployee.useMutation({ onSuccess: () => { alert("تم حفظ كلمة مرور بطاقة العامل وإلغاء السابقة فورًا."); utils.employeeFinance.managerOverview.invalidate(); } });
  const setCardAccess = trpc.employeeFinance.setEmployeeCardAccess.useMutation({ onSuccess: result => { alert(result.isActive ? "تم السماح ببطاقة العامل." : "تم إيقاف بطاقة العامل فورًا."); utils.employeeFinance.managerOverview.invalidate(); } });

  useEffect(() => {
    const current = JSON.parse(localStorage.getItem("abu_raghwa_current_user") || "null");
    setCurrentUser(current);

    // التحقق من أن المستخدم الحالي هو المدير
    if (current?.role !== "manager") {
      alert("لا توجد صلاحية للوصول إلى هذه الصفحة");
      navigate("/dashboard");
      return;
    }

    if (current.role === "manager" && sessionStorage.getItem("abu_staff_sync_token")) openManagerCards.mutate();

  }, []);

  useEffect(() => {
    if (!staffUsers.data) return;
    setUsers(staffUsers.data as User[]);
    localStorage.setItem("abu_raghwa_users", JSON.stringify(staffUsers.data));
  }, [staffUsers.data]);

  const assignRole = async (userId: string, role: "admin" | "seller") => {
    const selected = users.find(user => user.id === userId);
    if (!selected) return;
    if (approvingUserId) return;
    const previousUsers = users;
    setApprovingUserId(userId);
    setUsers(previousUsers.map(u => u.id === userId ? { ...u, role, isApproved: true, status: "APPROVED" as const, isBlocked: false } : u));
    try {
      const result = await approveStaff.mutateAsync({ email: selected.email, role });
      setUsers(currentUsers => currentUsers.map(user => user.email.toLowerCase() === result.email.toLowerCase()
        ? { ...user, ...result.user, role: result.role, status: "APPROVED" as const, isApproved: true, isBlocked: false }
        : user));
      const updatedUsers = users.map(user => user.email.toLowerCase() === result.email.toLowerCase()
        ? { ...user, ...result.user, role: result.role, status: "APPROVED" as const, isApproved: true, isBlocked: false }
        : user);
      localStorage.setItem("abu_raghwa_users", JSON.stringify(updatedUsers));
      const active = JSON.parse(localStorage.getItem("abu_raghwa_current_user") || "null");
      if (active?.email?.toLowerCase() === result.email.toLowerCase()) {
        localStorage.setItem("abu_raghwa_current_user", JSON.stringify({ ...active, ...result.user, role: result.role, isApproved: true, isBlocked: false }));
        window.dispatchEvent(new Event("abu-staff-session-update"));
      }
      alert(`تم اعتماد الحساب على الخادم وتعيين الدور: ${role === "admin" ? "مشرف" : "بائع"}`);
    } catch (error) {
      setUsers(previousUsers);
      alert(error instanceof Error ? error.message : "تعذر اعتماد الحساب على الخادم");
    } finally {
      setApprovingUserId(null);
    }
  };

  const deleteUser = async (userId: string) => {
    if (confirm("هل أنت متأكد من حذف هذا المستخدم؟")) {
      const selected = users.find(user => user.id === userId);
      if (!selected) return;
      try {
        await removeStaff.mutateAsync({ email: selected.email });
        setUsers(current => current.filter(user => user.email.toLowerCase() !== selected.email.toLowerCase()));
        alert("تم حذف الحساب من الخادم.");
      } catch (error) {
        alert(error instanceof Error ? error.message : "تعذر حذف الحساب من الخادم");
      }
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "manager":
        return "مدير";
      case "admin":
        return "مشرف";
      case "seller":
        return "بائع";
      default:
        return role;
    }
  };

  const toggleAccess = async (user: User) => {
    const blocked = !user.isBlocked;
    if (!confirm(blocked ? `إيقاف دخول ${user.email} الآن؟` : `إعادة تفعيل دخول ${user.email}؟`)) return;
    try {
      const result = await updateStaff.mutateAsync({ email: user.email, isBlocked: blocked });
      setUsers(current => current.map(item => item.email.toLowerCase() === result.email.toLowerCase() ? { ...item, ...result.user } as User : item));
      alert(blocked ? "تم إيقاف دخول الموظف على الخادم فوراً." : "تمت إعادة تفعيل دخول الموظف على الخادم.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر تحديث حالة دخول الموظف");
    }
  };

  const pendingUsers = users.filter(u => !u.isApproved && !u.isBlocked);
  const approvedUsers = users.filter(u => u.isApproved);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">إدارة المستخدمين والصلاحيات</h1>
            <p className="text-gray-600 mt-1">تعيين الأدوار والموافقة على المستخدمين الجدد</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            العودة
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Pending Users */}
        {pendingUsers.length > 0 && (
          <Card className="border-0 shadow-sm mb-8 border-l-4 border-l-orange-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-orange-600" />
                المستخدمون في انتظار الموافقة ({pendingUsers.length})
              </CardTitle>
              <CardDescription>
                يتم فحص طلبات التسجيل من قاعدة البيانات تلقائيًا كل 5 ثوانٍ. {staffUsers.isFetching ? "جارٍ التحديث..." : "آخر تحديث تم بنجاح."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pendingUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 border border-orange-200 bg-orange-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{user.email}</p>
                      <p className="text-sm text-gray-600">
                        تاريخ التسجيل: {new Date(user.createdDate).toLocaleDateString("ar-EG")}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value as any)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="seller">بائع</option>
                        <option value="admin">مشرف</option>
                      </select>
                      <Button
                        onClick={() => assignRole(user.id, selectedRole)}
                        disabled={approvingUserId !== null || approveStaff.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {approvingUserId === user.id ? "جارٍ الاعتماد..." : "الموافقة"}
                      </Button>
                      <Button
                        onClick={() => deleteUser(user.id)}
                        variant="destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Approved Users */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              المستخدمون المعتمدون ({approvedUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {approvedUsers.length === 0 ? (
              <p className="text-gray-600 text-center py-8">لا توجد مستخدمون معتمدون بعد</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">البريد الإلكتروني</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">الدور</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">تاريخ التسجيل</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">آخر دخول</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">حالة الدخول</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedUsers.map((user) => (
                      <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">{user.email}</td>
                        <td className="py-3 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            user.role === "manager"
                              ? "bg-purple-100 text-purple-800"
                              : user.role === "admin"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-green-100 text-green-800"
                          }`}>
                            {getRoleLabel(user.role)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {new Date(user.createdDate).toLocaleDateString("ar-EG")}
                        </td>
                        <td className="py-3 px-4">
                          {new Date(user.lastLogin).toLocaleDateString("ar-EG")}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${user.isBlocked ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                            {user.isBlocked ? "موقوف" : "مسموح"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2">
                            {user.role !== "manager" && (
                              <>
                                <select
                                  value={user.role}
                                  onChange={(e) => assignRole(user.id, e.target.value as any)}
                                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                                >
                                  <option value="seller">بائع</option>
                                  <option value="admin">مشرف</option>
                                </select>
                              </>
                            )}
                            {user.role !== "manager" && (
                              <>
                                <Button onClick={() => toggleAccess(user)} variant={user.isBlocked ? "outline" : "destructive"} size="sm" title={user.isBlocked ? "إعادة التفعيل" : "إيقاف الدخول"} className="gap-1 whitespace-nowrap">
                                  {user.isBlocked ? <UnlockKeyhole className="w-3 h-3" /> : <LockKeyhole className="w-3 h-3" />} {user.isBlocked ? "إعادة تفعيل" : "إيقاف الدخول"}
                                </Button>
                                <Button onClick={() => deleteUser(user.id)} variant="outline" size="sm" className="gap-1 border-red-200 text-red-700 hover:bg-red-50">
                                  <Trash2 className="w-3 h-3" />حذف الحساب
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-8 border-2 border-violet-100 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-violet-700" />بطاقات العمال وإجراءات الدخول</CardTitle>
            <CardDescription>هنا تحدد كلمة مرور كل عامل، ثم تختار السماح أو الإيقاف. لا تحتاج بطاقة العامل إلى بريد إلكتروني.</CardDescription>
          </CardHeader>
          <CardContent>
            {!managerCardReady || employeeCards.isLoading ? <p className="rounded-xl bg-slate-50 p-4 text-center text-slate-500">جاري تحميل بطاقات العمال...</p> : employeeCards.error ? <p className="rounded-xl bg-red-50 p-4 text-center text-red-700">تعذر تحميل البطاقات. افتح إدارة الموظفين ثم عد لهذه الصفحة.</p> : !employeeCards.data?.length ? <p className="rounded-xl bg-slate-50 p-4 text-center text-slate-500">لم تُضف عاملًا بعد. أضف عاملًا من «إدارة الموظفين» ثم ستظهر بطاقته وإجراءاته هنا.</p> : <div className="grid gap-3 lg:grid-cols-2">{employeeCards.data.map(card => {
              const password = cardPasswords[card.employee.id] || "";
              return <section key={card.employee.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-900">{card.employee.name}</p><p className="text-sm text-slate-500">{card.employee.position || "عامل"}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${card.cardActive ? "bg-emerald-100 text-emerald-800" : card.pinConfigured ? "bg-red-100 text-red-800" : "bg-slate-200 text-slate-700"}`}>{card.cardActive ? "مسموح" : card.pinConfigured ? "موقوف" : "لم تُضبط"}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><Input type="password" value={password} onChange={event => setCardPasswords(current => ({ ...current, [card.employee.id]: event.target.value }))} placeholder="كلمة مرور جديدة للعامل" /><Button disabled={password.length < 4 || configureCard.isPending} onClick={() => configureCard.mutate({ employeeId: card.employee.id, password })}>حفظ/تغيير الكلمة</Button></div>{card.pinConfigured && <div className="mt-3"><Button className="w-full" variant={card.cardActive ? "destructive" : "outline"} disabled={setCardAccess.isPending} onClick={() => setCardAccess.mutate({ employeeId: card.employee.id, isActive: !card.cardActive })}>{card.cardActive ? "إيقاف الحساب" : "إعادة تفعيل الحساب"}</Button></div>}</section>;
            })}</div>}
          </CardContent>
        </Card>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-gray-600 text-sm">إجمالي المستخدمين</p>
                <p className="text-3xl font-bold text-gray-900">{users.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-gray-600 text-sm">في انتظار الموافقة</p>
                <p className="text-3xl font-bold text-orange-600">{pendingUsers.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-gray-600 text-sm">معتمدون</p>
                <p className="text-3xl font-bold text-green-600">{approvedUsers.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
