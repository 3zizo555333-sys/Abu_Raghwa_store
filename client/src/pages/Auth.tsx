import { type FormEvent, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSupabaseClient } from "@/lib/supabase/client";
import { CURRENT_STAFF_QUERY_KEY, loadCurrentStaffSession } from "@/lib/supabase/auth";

export default function Auth() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!formData.email.trim() || !formData.password) throw new Error("يرجى ملء البريد الإلكتروني وكلمة المرور.");
    const supabase = getSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
    });
    if (signInError) throw new Error(signInError.message);
    const staffSession = await loadCurrentStaffSession();
    await queryClient.invalidateQueries({ queryKey: CURRENT_STAFF_QUERY_KEY });
    if (!staffSession) throw new Error("لم يتم العثور على جلسة مستخدم صالحة.");
    if (staffSession.membershipState === "active") {
      navigate("/dashboard");
      return;
    }
    if (staffSession.membershipState === "pending") {
      setNotice("تم تسجيل الدخول، لكن عضويتك بانتظار موافقة المدير. لا يمكن فتح بيانات المحل قبل اعتمادها.");
      return;
    }
    if (staffSession.membershipState === "suspended") {
      await supabase.auth.signOut();
      await queryClient.invalidateQueries({ queryKey: CURRENT_STAFF_QUERY_KEY });
      throw new Error("تم إيقاف عضويتك في المحل. تواصل مع المدير لإعادة تفعيلها.");
    }
    await supabase.auth.signOut();
    await queryClient.invalidateQueries({ queryKey: CURRENT_STAFF_QUERY_KEY });
    throw new Error(staffSession.membershipState === "multiple"
      ? "يرتبط حسابك بأكثر من محل؛ يلزم تحديد المحل قبل المتابعة."
      : "لا توجد عضوية محل مرتبطة بهذا الحساب. اطلب من المدير إضافة حسابك.");
  };

  const handleRegister = async () => {
    if (!formData.email.trim() || !formData.password || !formData.confirmPassword) throw new Error("يرجى ملء جميع الحقول.");
    if (formData.password !== formData.confirmPassword) throw new Error("كلمتا المرور غير متطابقتين.");
    if (formData.password.length < 8) throw new Error("كلمة المرور يجب أن تتكون من 8 أحرف على الأقل.");
    const supabase = getSupabaseClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
      options: { data: { full_name: formData.email.trim().split("@")[0] } },
    });
    if (signUpError) throw new Error(signUpError.message);
    if (data.session) {
      const staffSession = await loadCurrentStaffSession();
      await queryClient.invalidateQueries({ queryKey: CURRENT_STAFF_QUERY_KEY });
      if (staffSession?.membershipState === "active") {
        navigate("/dashboard");
        return;
      }
      setNotice("أُنشئ الحساب. سيبقى الوصول معطّلًا إلى أن يراجع المدير طلب العضوية ويعتمده.");
    } else {
      setNotice("أُرسل طلب إنشاء الحساب. تحقّق من بريدك لتأكيد الحساب، ثم انتظر اعتماد المدير للعضوية.");
    }
    setIsLogin(true);
    setFormData(current => ({ ...current, password: "", confirmPassword: "" }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    setNotice("");
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("لا يوجد اتصال بالإنترنت. تم تعطيل تسجيل الدخول ولم تُحفظ أي بيانات محليًا.");
      }
      if (isLogin) await handleLogin();
      else await handleRegister();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذرت مصادقة الحساب مع السحابة.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-orange-600">أبو رغوة</CardTitle>
          <CardDescription className="text-lg mt-2">{isLogin ? "تسجيل الدخول السحابي" : "طلب حساب موظف"}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}
            {notice && <div role="status" className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded">{notice}</div>}
            <div>
              <label className="block text-sm font-medium mb-2">البريد الإلكتروني</label>
              <Input type="email" autoComplete="email" required placeholder="example@email.com" value={formData.email} onChange={event => setFormData({ ...formData, email: event.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">كلمة المرور</label>
              <Input type="password" autoComplete={isLogin ? "current-password" : "new-password"} minLength={8} required placeholder="••••••••" value={formData.password} onChange={event => setFormData({ ...formData, password: event.target.value })} />
            </div>
            {!isLogin && <div>
              <label className="block text-sm font-medium mb-2">تأكيد كلمة المرور</label>
              <Input type="password" autoComplete="new-password" minLength={8} required placeholder="••••••••" value={formData.confirmPassword} onChange={event => setFormData({ ...formData, confirmPassword: event.target.value })} />
              <p className="mt-2 text-sm text-slate-600">تُمنح الحسابات الجديدة دور بائع بحالة انتظار؛ اعتماد المدير مطلوب قبل فتح بيانات المحل.</p>
            </div>}
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="w-full bg-orange-600 hover:bg-orange-700 text-white">
              {isSubmitting ? "جارٍ الاتصال بالسحابة..." : isLogin ? "دخول" : "إرسال طلب الحساب"}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">{isLogin ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
              <button type="button" disabled={isSubmitting} onClick={() => { setIsLogin(!isLogin); setError(""); setNotice(""); setFormData({ email: "", password: "", confirmPassword: "" }); }} className="text-orange-600 hover:text-orange-700 font-medium disabled:opacity-50">
                {isLogin ? "طلب حساب موظف" : "تسجيل الدخول"}
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
