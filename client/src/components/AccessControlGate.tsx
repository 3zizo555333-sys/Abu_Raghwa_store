import { type ReactNode, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { isManager, isUserAllowed, type AccessUser } from "@/lib/accessControl";
import { useStaffAccess } from "@/hooks/useStaffAccess";

const SESSION_KEY = "abu_raghwa_current_user";

export default function AccessControlGate({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const currentUser = useMemo(() => {
    try {
      if (!sessionStorage.getItem("abu_staff_sync_token") && !localStorage.getItem("abu_staff_sync_token") && !localStorage.getItem("abu_staff_cookie_session")) return null;
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) as AccessUser : null;
    } catch {
      return null;
    }
  }, [location]);

  const requiresLogin = location !== "/auth" && location !== "/public-offer" && location !== "/catalog" && location !== "/catalog-offers";
  // The login response is the trusted source for the current session. A stale
  // local/cloud copy must not turn a successful manager login into a block screen.
  const effectiveUser = currentUser;
  const blocked = requiresLogin && currentUser && !isManager(effectiveUser) && !isUserAllowed(effectiveUser);

  useEffect(() => {
    if (blocked) localStorage.removeItem(SESSION_KEY);
  }, [blocked]);

  if (!requiresLogin || (currentUser && (isManager(effectiveUser) || isUserAllowed(effectiveUser)))) return <>{children}</>;

  return (
    <main className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-50 p-5" dir="rtl">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl">
        <h1 className="text-2xl font-bold text-slate-900">{blocked ? "تم إيقاف دخولك" : "سجّل الدخول أولاً"}</h1>
        <p className="mt-3 text-slate-600">
          {blocked ? "قام المدير بإيقاف حسابك. تواصل معه لإعادة التفعيل." : "أدخل بحساب الموظف المعتمد من المدير للوصول إلى التطبيق."}
        </p>
        <Button className="mt-6 w-full bg-blue-600 hover:bg-blue-700" onClick={() => navigate("/auth")}>
          الذهاب إلى تسجيل الدخول
        </Button>
      </section>
    </main>
  );
}

/** حماية واجهات الإدارة التي لا ينبغي أن يراها العامل حتى لو عرف رابطها. */
export function withManagerRole(Component: React.ComponentType<any>) {
  return function ManagerOnlyComponent(props: any) {
    const [, navigate] = useLocation();
    const currentUser = useMemo(() => {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) as AccessUser : null;
      } catch {
        return null;
      }
    }, []);
    if (isManager(currentUser)) return <Component {...props} />;
    return <main className="fixed inset-0 z-[100] grid place-items-center bg-slate-50 p-5" dir="rtl"><section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl"><h1 className="text-2xl font-bold text-slate-900">هذه الصفحة للمدير فقط</h1><p className="mt-3 text-slate-600">لا يمكنك رؤية رواتب أو حسابات العاملين الآخرين. افتح إدارة الموظفين لرؤية بطاقتك وسحوباتك فقط.</p><Button className="mt-6 w-full bg-violet-700 hover:bg-violet-800" onClick={() => navigate("/employees")}>فتح بطاقة حسابي</Button></section></main>;
  };
}

/** يمنع البائع من صفحات التكاليف والأرباح، ويُبقيها متاحة للمدير والمشرف. */
export function withSupervisorRole(Component: React.ComponentType<any>) {
  return function SupervisorOnlyComponent(props: any) {
    const [, navigate] = useLocation();
    const { canViewSensitiveFinancials } = useStaffAccess();
    if (canViewSensitiveFinancials) return <Component {...props} />;
    return <main className="fixed inset-0 z-[100] grid place-items-center bg-slate-50 p-5" dir="rtl"><section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl"><h1 className="text-2xl font-bold text-slate-900">هذه الصفحة للمشرف أو المدير</h1><p className="mt-3 text-slate-600">تم إخفاء التكاليف والأرباح والحسابات عن البائع. يمكنك متابعة البيع والأسعار من المنتجات والعروض.</p><Button className="mt-6 w-full bg-blue-700 hover:bg-blue-800" onClick={() => navigate("/dashboard")}>العودة للوحة التحكم</Button></section></main>;
  };
}
