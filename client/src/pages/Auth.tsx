import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { isUserAllowed, type AccessUser } from "@/lib/accessControl";
import { trpc } from "@/lib/trpc";

type User = AccessUser;

const SUPERVISOR_EMAILS: string[] = [];

const DEFAULT_USERS: User[] = [];

export default function Auth() {
  const [, navigate] = useLocation();
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("abu_raghwa_users") || "[]");
      if (!Array.isArray(parsed)) return DEFAULT_USERS;
      const sanitized = parsed.map((user: Record<string, unknown>) => {
        const { password: _legacyPassword, ...safeUser } = user;
        return safeUser;
      });
      localStorage.setItem("abu_raghwa_users", JSON.stringify(sanitized));
      return sanitized as User[];
    } catch {
      return DEFAULT_USERS;
    }
  });
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const staffSyncLogin = trpc.staffSync.login.useMutation();
  const staffSyncRegister = trpc.staffSync.register.useMutation();
  // The server cookie is the durable session. The local token is only a
  // compatibility fallback for WebViews that do not expose cookies to fetch.
  // Always ask the server on the login route so reopening the app does not
  // require entering email/password again.
  const storedSessionQuery = trpc.staffSync.me.useQuery(undefined, { retry: false, refetchOnMount: "always" });

  useEffect(() => {
    if (storedSessionQuery.data) {
      localStorage.setItem("abu_raghwa_current_user", JSON.stringify(storedSessionQuery.data));
      localStorage.setItem("abu_staff_cookie_session", "1");
      navigate("/dashboard");
    }
  }, [navigate, storedSessionQuery.data]);

  const generateDeviceId = () => `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  const handleLogin = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    if (!formData.email || !formData.password) {
      setError("يرجى ملء جميع الحقول");
      setIsSubmitting(false);
      return;
    }

    let syncToken: string;
    let serverUser: User;
    try {
      const syncSession = await staffSyncLogin.mutateAsync({ email: formData.email, password: formData.password });
      syncToken = syncSession.token;
      serverUser = { ...syncSession.user, isBlocked: false, role: syncSession.user.role as User["role"] };
    } catch (loginError) {
      // Preserve the server's lifecycle message (pending/blocked/invalid password)
      // instead of collapsing every failure into a misleading generic error.
      setError(loginError instanceof Error ? loginError.message : "تعذر تسجيل الدخول الآن");
      setIsSubmitting(false);
      return;
    }

    // لا نعتمد على نسخة localStorage القديمة؛ الخادم هو مصدر الحقيقة بعد الموافقة.
    const user = serverUser;

    if (!isUserAllowed(user) && !SUPERVISOR_EMAILS.includes(user.email)) {
      setError(user.isBlocked ? "تم إيقاف حسابك من المدير." : "حسابك قيد الانتظار. يرجى انتظار موافقة المدير.");
      setIsSubmitting(false);
      return;
    }

    if (user.role !== "manager") {
      let notifications: Array<Record<string, unknown>> = [];
      try {
        const parsed = JSON.parse(localStorage.getItem("abu_raghwa_notifications") || "[]");
        if (Array.isArray(parsed)) notifications = parsed;
      } catch {
        notifications = [];
      }
      notifications.push({ id: `notif_${Date.now()}`, type: "login", message: `المستخدم ${user.email} قام بتسجيل الدخول`, timestamp: new Date().toISOString(), read: false, userId: user.id });
      localStorage.setItem("abu_raghwa_notifications", JSON.stringify(notifications));
    }

    const deviceId = generateDeviceId();
    const updatedUser: User = { ...user, lastLogin: new Date().toISOString(), deviceIds: [...(user.deviceIds || []), deviceId] };
    setUsers(current => {
      const next = [...current.filter(saved => saved.email.toLowerCase() !== updatedUser.email.toLowerCase()), updatedUser];
      localStorage.setItem("abu_raghwa_users", JSON.stringify(next));
      return next;
    });
    sessionStorage.removeItem("abu_employee_finance_token");
    sessionStorage.setItem("abu_staff_sync_token", syncToken);
    localStorage.setItem("abu_staff_sync_token", syncToken);
    localStorage.setItem("abu_staff_cookie_session", "1");
    localStorage.setItem("abu_raghwa_current_user", JSON.stringify(updatedUser));
    localStorage.setItem("abu_raghwa_device_id", deviceId);
    navigate("/dashboard");
    setIsSubmitting(false);
  };

  const handleRegister = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    if (!formData.email || !formData.password || !formData.confirmPassword) {
      setError("يرجى ملء جميع الحقول");
      setIsSubmitting(false);
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("كلمات المرور غير متطابقة");
      setIsSubmitting(false);
      return;
    }
    if (formData.password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      setIsSubmitting(false);
      return;
    }
    const normalizedEmail = formData.email.trim().toLowerCase();
    const newUser: User = {
      id: `user_${Date.now()}`,
      email: normalizedEmail,
      role: "seller",
      createdDate: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      deviceIds: [generateDeviceId()],
      isApproved: false,
    };
    try {
      const registration = await staffSyncRegister.mutateAsync({ email: normalizedEmail, password: formData.password });
      const registeredUser: User = {
        ...newUser,
        ...registration.user,
        role: registration.user.role as User["role"],
        isApproved: registration.user.isApproved ?? false,
      };
      setUsers(current => {
        const next = registration.pending
          ? [...current.filter(user => user.email.toLowerCase() !== normalizedEmail), registeredUser]
          : [registeredUser];
        localStorage.setItem("abu_raghwa_users", JSON.stringify(next));
        return next;
      });
      alert(registration.bootstrapRecovered
        ? "تمت استعادة حساب المدير لأن النظام لم يجد مديرًا معتمدًا. استخدم البريد وكلمة المرور الآن لتسجيل الدخول."
        : registration.existing
          ? "هذا الحساب موجود بالفعل. استخدم تبويب تسجيل الدخول بنفس البريد وكلمة المرور."
        : registration.pending
          ? "تم إرسال طلب التسجيل إلى المدير. سيظهر في إدارة المستخدمين حتى تتم الموافقة عليه."
          : "تم إنشاء حساب المدير الأول بنجاح. يمكنك تسجيل الدخول الآن.");
      setIsLogin(true);
      setFormData({ email: normalizedEmail, password: "", confirmPassword: "" });
      setIsSubmitting(false);
      return;
    } catch (registrationError) {
      setError(registrationError instanceof Error ? registrationError.message : "تعذر إرسال طلب التسجيل");
      setIsSubmitting(false);
      return;
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLogin) await handleLogin();
    else await handleRegister();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-orange-600">أبو رغوة</CardTitle>
          <CardDescription className="text-lg mt-2">{isLogin ? "تسجيل الدخول" : "إنشاء حساب جديد"}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}
            <div>
              <label className="block text-sm font-medium mb-2">البريد الإلكتروني</label>
              <Input type="email" placeholder="example@email.com" value={formData.email} onChange={event => setFormData({ ...formData, email: event.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">كلمة المرور</label>
              <Input type="password" placeholder="••••••••" value={formData.password} onChange={event => setFormData({ ...formData, password: event.target.value })} />
            </div>
            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">تأكيد كلمة المرور</label>
                  <Input type="password" placeholder="••••••••" value={formData.confirmPassword} onChange={event => setFormData({ ...formData, confirmPassword: event.target.value })} />
                </div>
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded text-sm">ملاحظة: الوظيفة سيتم تحديدها من قبل المدير بعد الموافقة على حسابك.</div>
              </>
            )}
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="w-full bg-orange-600 hover:bg-orange-700 text-white">
              {isSubmitting ? "جارٍ المعالجة..." : isLogin ? "دخول" : "إنشاء حساب"}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              {isLogin ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
              <button type="button" onClick={() => { if (isSubmitting) return; setIsLogin(!isLogin); setError(""); setFormData({ email: "", password: "", confirmPassword: "" }); }} className="text-orange-600 hover:text-orange-700 font-medium">
                {isLogin ? "إنشاء حساب" : "تسجيل دخول"}
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
