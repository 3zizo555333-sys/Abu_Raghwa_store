import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, KeyRound, Lock, LockKeyhole, LockOpen, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSecurity } from "@/contexts/SecurityContext";
import { SCREEN_PIN_LOCKS, isValidFeaturePin, type FeatureLockKey } from "@/lib/supabase/featureLocks";

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
    setAllFeatureLocks,
  } = useSecurity();
  const [pinValues, setPinValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const lockByKey = useMemo(() => new Map(featureLocks.map(lock => [lock.feature_key, lock])), [featureLocks]);
  const visibleFeatures = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return SCREEN_PIN_LOCKS;
    return SCREEN_PIN_LOCKS.filter(feature => `${feature.title} ${feature.path} ${feature.description}`.toLocaleLowerCase("ar").includes(term));
  }, [search]);
  const lockedCount = SCREEN_PIN_LOCKS.filter(feature => lockByKey.get(feature.key)?.enabled).length;
  const configuredCount = SCREEN_PIN_LOCKS.filter(feature => lockByKey.get(feature.key)?.pin_configured).length;

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

  const savePin = async (key: FeatureLockKey, title: string) => {
    const pin = pinValues[key] ?? "";
    if (!isValidFeaturePin(pin)) return toast.error("رمز PIN يجب أن يتكون من 4 أو 6 أرقام.");
    setBusy(key);
    try {
      await setFeatureLockPin(key, pin);
      setPinValues(current => ({ ...current, [key]: "" }));
      toast.success(`تم حفظ رمز مستقل لميزة «${title}» ومزامنته بأمان.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ رمز PIN في السحابة.");
    } finally {
      setBusy(null);
    }
  };

  const toggleFeature = async (key: FeatureLockKey, title: string, enabled: boolean) => {
    const lock = lockByKey.get(key);
    if (!lock) return toast.error("إعداد القفل غير متاح حالياً؛ حدّث الصفحة.");
    if (enabled && !lock.pin_configured) return toast.error(`عيّن رمز PIN مستقل لميزة «${title}» قبل تفعيل قفلها.`);
    setBusy(key);
    try {
      await setFeatureLockEnabled(key, enabled);
      toast.success(enabled ? `تم قفل «${title}» على أجهزة المتجر.` : `تم فتح قفل «${title}» ومزامنة الحالة.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحديث إعداد القفل.");
    } finally {
      setBusy(null);
    }
  };

  const applyBulk = async (enabled: boolean) => {
    setBulkBusy(true);
    try {
      const result = await setAllFeatureLocks(enabled);
      if (!enabled) {
        toast.success(`تم إلغاء أقفال ${SCREEN_PIN_LOCKS.length} شاشة ومزامنتها.`);
        return;
      }
      const missingTitles = result.missingKeys
        .map(key => SCREEN_PIN_LOCKS.find(feature => feature.key === key)?.title ?? key)
        .slice(0, 5);
      if (result.missingKeys.length) {
        const suffix = result.missingKeys.length > missingTitles.length ? " وغيرها" : "";
        toast.error(`تم قفل ${result.enabledCount} شاشة. عيّن PIN مستقلاً أولاً لـ ${result.missingKeys.length} شاشة: ${missingTitles.join("، ")}${suffix}.`);
      } else {
        toast.success(`تم قفل جميع الشاشات (${result.enabledCount}) بنجاح.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تطبيق الإجراء الجماعي.");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-violet-700">التحكم بالوصول</p>
            <h1 className="mt-1 text-3xl font-black text-slate-950">أمان المتجر</h1>
            <p className="mt-1 text-sm text-slate-600">PIN مستقل ومشفّر لكل شاشة تشغيلية، ومزامنة فورية على أجهزة المتجر.</p>
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
              <p className="mt-1 text-sm text-emerald-900">الحساب: {managerEmail || "مدير المتجر"}. الرمز الذي تحفظه هنا خاص بهذه الشاشة وحدها؛ لا يمكنه فتح أي شاشة أخرى. تظل صلاحيات العضوية وRLS مطبقة بعد اجتياز قفل الواجهة.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5" /> التحكم الشامل بالأقفال</CardTitle>
            <CardDescription>القفل الجماعي يفعّل الأقفال التي لها PIN مستقل محفوظ فقط. الشاشات التي لم يُعيّن لها PIN تبقى مفتوحة ويظهر اسمها أدناه.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm font-semibold text-slate-700">{lockedCount} مقفلة · {configuredCount} من {SCREEN_PIN_LOCKS.length} لها PIN مستقل</div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => { void applyBulk(true); }} disabled={bulkBusy || isLockSettingsLoading} className="gap-2">
                <Lock className="h-4 w-4" /> {bulkBusy ? "جارٍ تطبيق الأقفال…" : "قفل جميع الميزات"}
              </Button>
              <Button variant="outline" onClick={() => { void applyBulk(false); }} disabled={bulkBusy || isLockSettingsLoading} className="gap-2">
                <LockOpen className="h-4 w-4" /> إلغاء قفل الجميع
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> أقفال شاشات التطبيق</CardTitle>
              <CardDescription className="mt-1">{SCREEN_PIN_LOCKS.length} مساراً داخلياً؛ لكل مسار مفتاح PIN مستقل بلا مشاركة للرموز. التغيير متاح للمدير فقط.</CardDescription>
            </div>
            <Button variant="outline" size="sm" disabled={isLockSettingsLoading} onClick={() => { void refreshFeatureLocks().catch(() => undefined); }} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isLockSettingsLoading ? "animate-spin" : ""}`} /> تحديث السحابة
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {lockSettingsError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">تعذر تحميل الأقفال: {lockSettingsError}</div>}
            {isLockSettingsLoading && <p className="text-sm text-slate-500">جارٍ تحميل حالة الأقفال من السحابة…</p>}
            <label className="relative block">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث باسم الشاشة أو مسارها…" className="pr-10" />
            </label>
            <div className="grid gap-3 lg:grid-cols-2">
              {visibleFeatures.map(feature => {
                const lock = lockByKey.get(feature.key);
                const loading = busy === feature.key;
                return (
                  <section key={feature.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-bold text-slate-900">{feature.title}</h2>
                        <p className="mt-1 text-sm text-slate-600">{feature.description}</p>
                        <code dir="ltr" className="mt-1 block truncate text-left text-xs text-slate-400">{feature.path}</code>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`text-xs font-bold ${lock?.enabled ? "text-violet-800" : "text-slate-500"}`}>{lock?.enabled ? "مقفلة" : "مفتوحة"}</span>
                        <Switch
                          checked={Boolean(lock?.enabled)}
                          onCheckedChange={checked => { void toggleFeature(feature.key, feature.title, checked); }}
                          disabled={!lock || loading || bulkBusy || isLockSettingsLoading || (!lock.enabled && !lock.pin_configured)}
                          aria-label={`${lock?.enabled ? "تعطيل" : "تفعيل"} قفل ${feature.title}`}
                        />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        maxLength={6}
                        value={pinValues[feature.key] ?? ""}
                        onChange={event => setPinValues(current => ({ ...current, [feature.key]: event.target.value.replace(/[^0-9]/g, "").slice(0, 6) }))}
                        placeholder={lock?.pin_configured ? "أدخل PIN جديداً لهذه الشاشة" : "عيّن PIN من 4 أو 6 أرقام"}
                        className="text-center tracking-widest"
                        disabled={loading || bulkBusy}
                        aria-label={`رمز PIN مستقل لشاشة ${feature.title}`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => { void savePin(feature.key, feature.title); }}
                        disabled={loading || bulkBusy || !isValidFeaturePin(pinValues[feature.key] ?? "")}
                      >
                        {loading ? "جارٍ الحفظ…" : lock?.pin_configured ? "تغيير PIN الشاشة" : "حفظ PIN الشاشة"}
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{lock?.pin_configured ? "لها رمز مستقل محفوظ بـ bcrypt" : "لا يمكن تفعيل القفل قبل تعيين رمزها المستقل"} · لا يُعاد عرض الرمز المحفوظ.</p>
                  </section>
                );
              })}
            </div>
            {!isLockSettingsLoading && !lockSettingsError && visibleFeatures.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">لا توجد شاشة تطابق البحث.</p>}
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
