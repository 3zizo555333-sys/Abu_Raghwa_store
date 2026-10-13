import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, KeyRound, ShieldCheck, Users, RefreshCw, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSecurity } from "@/contexts/SecurityContext";
import { FEATURE_LOCKS, isValidFeaturePin, type FeatureLockKey } from "@/lib/supabase/featureLocks";

export default function SecuritySettings() {
  const [, navigate] = useLocation();
  const {
    isManagerLoggedIn,
    managerEmail,
    featureLocks,
    isLockSettingsLoading,
    lockSettingsError,
    refreshFeatureLocks,
    setFeatureLockEnabled,
    setFeatureLockPin,
  } = useSecurity();
  const [sharedPin, setSharedPin] = useState("");
  const [sharedPinConfirm, setSharedPinConfirm] = useState("");
  const [customPin, setCustomPin] = useState<Record<string, string>>({});
  const [customPinConfirm, setCustomPinConfirm] = useState<Record<string, string>>({});
  const [showCustomPinForm, setShowCustomPinForm] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

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

  const sharedPinConfigured = featureLocks.some(lock => lock.shared_pin_configured);
  const lockByKey = new Map(featureLocks.map(lock => [lock.feature_key, lock]));

  const saveSharedPin = async () => {
    if (!isValidFeaturePin(sharedPin)) return toast.error("رمز PIN الموحد يجب أن يتكون من 4 أو 6 أرقام.");
    if (sharedPin !== sharedPinConfirm) return toast.error("تأكيد رمز PIN غير مطابق.");
    setBusy("shared");
    try {
      await setFeatureLockPin("shared", sharedPin);
      setSharedPin("");
      setSharedPinConfirm("");
      toast.success(sharedPinConfigured ? "تم تغيير رمز القفل الموحد ومزامنته." : "تم حفظ رمز القفل الموحد بأمان.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ رمز PIN في السحابة.");
    } finally {
      setBusy(null);
    }
  };

  const toggleFeature = async (key: FeatureLockKey, enabled: boolean) => {
    const lock = lockByKey.get(key);
    if (!lock) return toast.error("إعداد القفل غير متاح حالياً؛ حدّث الصفحة.");
    if (enabled && !lock.pin_configured) {
      return toast.error(lock.pin_scope === "shared" ? "احفظ رمز PIN موحداً أولاً، أو عيّن رمزاً خاصاً لهذه الميزة." : "احفظ رمز PIN خاصاً بهذه الميزة أولاً.");
    }
    setBusy(key);
    try {
      await setFeatureLockEnabled(key, enabled, lock.pin_scope);
      toast.success(enabled ? "تم تفعيل قفل الميزة على أجهزة المتجر." : "تم تعطيل قفل الميزة ومزامنة الحالة.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحديث إعداد القفل.");
    } finally {
      setBusy(null);
    }
  };

  const saveCustomPin = async (key: FeatureLockKey) => {
    const pin = customPin[key] ?? "";
    if (!isValidFeaturePin(pin)) return toast.error("رمز PIN الخاص يجب أن يتكون من 4 أو 6 أرقام.");
    if (pin !== (customPinConfirm[key] ?? "")) return toast.error("تأكيد الرمز الخاص غير مطابق.");
    setBusy(key);
    try {
      await setFeatureLockPin(key, pin);
      setCustomPin(current => ({ ...current, [key]: "" }));
      setCustomPinConfirm(current => ({ ...current, [key]: "" }));
      setShowCustomPinForm(current => ({ ...current, [key]: false }));
      toast.success("تم حفظ الرمز الخاص وربطه بهذه الميزة. فعّل القفل من المفتاح عند الحاجة.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الرمز الخاص في السحابة.");
    } finally {
      setBusy(null);
    }
  };

  const switchToSharedPin = async (key: FeatureLockKey) => {
    const lock = lockByKey.get(key);
    if (!lock) return;
    if (!sharedPinConfigured) return toast.error("احفظ رمز PIN موحداً أولاً.");
    setBusy(key);
    try {
      await setFeatureLockEnabled(key, lock.enabled, "shared");
      toast.success("أصبحت الميزة تستخدم رمز PIN الموحد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تغيير نمط الرمز.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-violet-700">التحكم بالوصول</p>
            <h1 className="mt-1 text-3xl font-black text-slate-950">أمان المتجر</h1>
            <p className="mt-1 text-sm text-slate-600">أقفال PIN سحابية تعمل على أجهزة المتجر المتصلة.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> العودة
          </Button>
        </header>

        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex items-start gap-3 p-5">
            <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
            <div>
              <p className="font-bold text-emerald-950">مصادقة الحساب عبر Supabase Auth</p>
              <p className="mt-1 text-sm text-emerald-900">الحساب: {managerEmail || "مدير المتجر"}. تظل صلاحيات العضوية وسياسات RLS مطبقة حتى بعد فتح قفل الواجهة.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> رمز PIN موحد</CardTitle>
            <CardDescription>رمز من 4 أو 6 أرقام يمكن استخدامه لأكثر من ميزة. لا يظهر الرمز المحفوظ مجدداً؛ تغييره يستبدل الهاش السحابي مباشرة.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-sm font-bold">{sharedPinConfigured ? "رمز PIN جديد" : "إنشاء رمز PIN موحد"}
              <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={sharedPin} onChange={event => setSharedPin(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="4 أو 6 أرقام" className="mt-1 text-center tracking-widest" disabled={busy === "shared"} />
            </label>
            <label className="text-sm font-bold">تأكيد الرمز
              <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={sharedPinConfirm} onChange={event => setSharedPinConfirm(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="أعد إدخال الرمز" className="mt-1 text-center tracking-widest" disabled={busy === "shared"} />
            </label>
            <Button onClick={() => { void saveSharedPin(); }} disabled={busy === "shared" || !isValidFeaturePin(sharedPin) || sharedPin !== sharedPinConfirm}>
              {busy === "shared" ? "جارٍ الحفظ…" : sharedPinConfigured ? "تغيير الرمز" : "حفظ الرمز"}
            </Button>
            <p className="text-xs text-slate-500 sm:col-span-3">يُخزّن Supabase قيمة bcrypt فقط، ولا تُحفظ نسخة PIN في المتصفح أو في سجل المزامنة.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5" /> أقفال الميزات الحساسة</CardTitle>
              <CardDescription className="mt-1">التغيير متاح للمدير فقط ويُزامن لحظياً مع الأجهزة الأخرى.</CardDescription>
            </div>
            <Button variant="outline" size="sm" disabled={isLockSettingsLoading} onClick={() => { void refreshFeatureLocks().catch(() => undefined); }} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isLockSettingsLoading ? "animate-spin" : ""}`} /> تحديث
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lockSettingsError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">تعذر تحميل الأقفال: {lockSettingsError}</div>}
            {isLockSettingsLoading && <p className="text-sm text-slate-500">جارٍ تحميل حالة الأقفال من السحابة…</p>}
            {FEATURE_LOCKS.map(feature => {
              const lock = lockByKey.get(feature.key);
              const loading = busy === feature.key;
              return (
                <section key={feature.key} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-bold text-slate-900">{feature.title}</h2>
                      <p className="mt-1 text-sm text-slate-600">{feature.description}</p>
                      <p className="mt-2 text-xs text-violet-700">{lock?.pin_scope === "custom" ? "يستخدم رمزاً خاصاً بهذه الميزة" : "يستخدم رمز PIN الموحد"}{lock?.enabled ? " · القفل مفعّل" : " · القفل معطّل"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${lock?.enabled ? "text-violet-800" : "text-slate-500"}`}>{lock?.enabled ? "مقفل" : "مفتوح"}</span>
                      <Switch
                        checked={Boolean(lock?.enabled)}
                        onCheckedChange={checked => { void toggleFeature(feature.key, checked); }}
                        disabled={!lock || loading || isLockSettingsLoading || (!lock.enabled && !lock.pin_configured)}
                        aria-label={`${lock?.enabled ? "تعطيل" : "تفعيل"} قفل ${feature.title}`}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lock?.pin_scope === "custom" && <Button type="button" size="sm" variant="outline" onClick={() => { void switchToSharedPin(feature.key); }} disabled={!sharedPinConfigured || loading}>استخدام الرمز الموحد</Button>}
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowCustomPinForm(current => ({ ...current, [feature.key]: !current[feature.key] }))} disabled={loading}>
                      {lock?.pin_scope === "custom" ? "تغيير الرمز الخاص" : "تعيين رمز خاص"}
                    </Button>
                  </div>
                  {showCustomPinForm[feature.key] && (
                    <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <label className="text-sm font-semibold">رمز PIN خاص
                        <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={customPin[feature.key] ?? ""} onChange={event => setCustomPin(current => ({ ...current, [feature.key]: event.target.value.replace(/[^0-9]/g, "").slice(0, 6) }))} className="mt-1 text-center tracking-widest" placeholder="4 أو 6 أرقام" disabled={loading} />
                      </label>
                      <label className="text-sm font-semibold">تأكيد الرمز
                        <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={customPinConfirm[feature.key] ?? ""} onChange={event => setCustomPinConfirm(current => ({ ...current, [feature.key]: event.target.value.replace(/[^0-9]/g, "").slice(0, 6) }))} className="mt-1 text-center tracking-widest" placeholder="أعد إدخال الرمز" disabled={loading} />
                      </label>
                      <Button size="sm" onClick={() => { void saveCustomPin(feature.key); }} disabled={loading || !isValidFeaturePin(customPin[feature.key] ?? "") || (customPin[feature.key] ?? "") !== (customPinConfirm[feature.key] ?? "")}>{loading ? "جارٍ الحفظ…" : "حفظ الرمز الخاص"}</Button>
                    </div>
                  )}
                  {!lock?.pin_configured && !lock?.enabled && <p className="mt-2 text-xs text-amber-700">احفظ رمزاً موحداً أو رمزاً خاصاً قبل تفعيل القفل.</p>}
                </section>
              );
            })}
            {!isLockSettingsLoading && !lockSettingsError && featureLocks.length === 0 && <p role="alert" className="text-sm text-red-700">لم تصل إعدادات الأقفال من المتجر. أعد المحاولة قبل فتح أي ميزة.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> إدارة الأعضاء</CardTitle>
            <CardDescription>راجع طلبات الانضمام، وفَعّل العضوية أو أوقفها من قاعدة البيانات.</CardDescription>
          </CardHeader>
          <CardContent><Button onClick={() => navigate("/user-management")}>فتح إدارة عضويات المتجر</Button></CardContent>
        </Card>
      </div>
    </main>
  );
}
