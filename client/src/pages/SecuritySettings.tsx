import { useLocation } from "wouter";
import { ArrowLeft, KeyRound, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSecurity } from "@/contexts/SecurityContext";

export default function SecuritySettings() {
  const [, navigate] = useLocation();
  const { isManagerLoggedIn, managerEmail } = useSecurity();

  if (!isManagerLoggedIn) {
    return (
      <main dir="rtl" className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <section className="max-w-lg rounded-2xl bg-white p-8 text-center shadow">
          <h1 className="text-xl font-bold">إعدادات الأمان متاحة لمدير المتجر فقط</h1>
          <p className="mt-3 text-sm text-slate-600">تعذّر تأكيد عضوية مدير نشطة في Supabase.</p>
          <Button className="mt-5" onClick={() => navigate("/dashboard")}>العودة إلى لوحة التحكم</Button>
        </section>
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-violet-700">التحكم بالوصول</p>
            <h1 className="mt-1 text-3xl font-black text-slate-950">أمان المتجر</h1>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> العودة
          </Button>
        </header>

        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex items-start gap-3 p-5">
            <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
            <div>
              <p className="font-bold text-emerald-950">المصادقة الحالية عبر Supabase Auth</p>
              <p className="mt-1 text-sm text-emerald-900">الحساب: {managerEmail || "مدير المتجر"}. تُطبّق صلاحية العضوية وسياسات RLS على بيانات السحابة.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> كلمات مرور الصفحات القديمة</CardTitle>
            <CardDescription>أُوقفت كلمات المرور الإضافية المخزنة في المتصفح؛ لم تكن حدًا أمنيًا موثوقًا وكانت تُحفظ كنص صريح.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <p>بدلًا منها، يعتمد الوصول على حساب Supabase وعضوية نشطة ودور الموظف. يمنع RLS الوصول إلى البيانات حتى عند تجاوز واجهة المستخدم.</p>
            <p>لا تُستخدم Local Storage أو Session Storage لحفظ جلسات أو كلمات مرور، ولا تتم مزامنة قوائم المنتجات كنسخة JSON.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> إدارة الأعضاء</CardTitle>
            <CardDescription>راجع طلبات الانضمام، وفَعّل العضوية أو أوقفها من قاعدة البيانات.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/user-management")}>فتح إدارة عضويات المتجر</Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
