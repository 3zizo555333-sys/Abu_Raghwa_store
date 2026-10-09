import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { isManager, isUserAllowed } from "@/lib/accessControl";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { isPublicCustomerPath } from "@shared/pwaInstallability";

export default function AccessControlGate({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, isLoading, error } = useStaffAccess();
  const requiresLogin = location !== "/auth" && !isPublicCustomerPath(location);

  if (!requiresLogin) return <>{children}</>;
  if (isLoading) return <main className="fixed inset-0 z-[100] grid place-items-center bg-slate-50 p-5" dir="rtl"><p className="text-slate-600">جارٍ التحقق من جلسة Supabase…</p></main>;
  if (user && isUserAllowed(user)) return <>{children}</>;

  const pending = user?.status === "pending";
  const suspended = user?.status === "suspended";
  return (
    <main className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-50 p-5" dir="rtl">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl">
        <h1 className="text-2xl font-bold text-slate-900">{pending ? "العضوية بانتظار الموافقة" : suspended ? "تم إيقاف دخولك" : "سجّل الدخول أولاً"}</h1>
        <p className="mt-3 text-slate-600">
          {pending ? "اعتماد المدير مطلوب قبل الوصول إلى بيانات المحل." : suspended ? "عضويتك موقوفة. تواصل مع المدير لإعادة تفعيلها." : error ? "تعذر التحقق من الجلسة السحابية. اتصل بالإنترنت ثم أعد المحاولة." : "أدخل بحساب Supabase المرتبط بعضوية نشطة في المحل."}
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
    const { user, isLoading } = useStaffAccess();
    if (isLoading) return <main className="fixed inset-0 z-[100] grid place-items-center bg-slate-50 p-5" dir="rtl"><p>جارٍ التحقق من الصلاحيات…</p></main>;
    if (isManager(user)) return <Component {...props} />;
    return <main className="fixed inset-0 z-[100] grid place-items-center bg-slate-50 p-5" dir="rtl"><section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl"><h1 className="text-2xl font-bold text-slate-900">هذه الصفحة للمدير فقط</h1><p className="mt-3 text-slate-600">لا يمكنك رؤية حسابات العاملين الآخرين. اطلب صلاحية المدير للوصول إلى هذه الصفحة.</p><Button className="mt-6 w-full bg-violet-700 hover:bg-violet-800" onClick={() => navigate("/dashboard")}>العودة للوحة التحكم</Button></section></main>;
  };
}

/** يمنع البائع من صفحات التكاليف والأرباح، ويُبقيها متاحة للمدير والمشرف. */
export function withSupervisorRole(Component: React.ComponentType<any>) {
  return function SupervisorOnlyComponent(props: any) {
    const [, navigate] = useLocation();
    const { canViewSensitiveFinancials, isLoading } = useStaffAccess();
    if (isLoading) return <main className="fixed inset-0 z-[100] grid place-items-center bg-slate-50 p-5" dir="rtl"><p>جارٍ التحقق من الصلاحيات…</p></main>;
    if (canViewSensitiveFinancials) return <Component {...props} />;
    return <main className="fixed inset-0 z-[100] grid place-items-center bg-slate-50 p-5" dir="rtl"><section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl"><h1 className="text-2xl font-bold text-slate-900">هذه الصفحة للمشرف أو المدير</h1><p className="mt-3 text-slate-600">تم إخفاء التكاليف والأرباح والحسابات عن البائع.</p><Button className="mt-6 w-full bg-blue-700 hover:bg-blue-800" onClick={() => navigate("/dashboard")}>العودة للوحة التحكم</Button></section></main>;
  };
}
