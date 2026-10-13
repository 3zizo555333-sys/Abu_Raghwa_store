import React from "react";
import { useSecurity } from "@/contexts/SecurityContext";
import { Button } from "@/components/ui/button";
import PasswordProtectedSection from "./PasswordProtectedSection";

export function withPasswordProtection(
  Component: React.ComponentType<any>,
  section: string,
  sectionLabel: string,
) {
  return function ProtectedComponent(props: any) {
    const {
      isPasswordEnabled,
      isLockSettingsReady,
      isLockSettingsLoading,
      lockSettingsError,
      featureLocks,
      refreshFeatureLocks,
    } = useSecurity();

    if (!isLockSettingsReady) {
      return (
        <main dir="rtl" className="grid min-h-screen place-items-center bg-slate-50 p-6">
          <section className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow">
            <h1 className="text-xl font-black text-slate-900">التحقق من أمان الصفحة</h1>
            {lockSettingsError ? (
              <>
                <p role="alert" className="mt-3 text-sm text-red-700">{lockSettingsError}</p>
                <Button className="mt-5" onClick={() => { void refreshFeatureLocks().catch(() => undefined); }}>إعادة المحاولة</Button>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-600">{isLockSettingsLoading ? "جارٍ تحميل حالة الأقفال من Supabase…" : "تعذر تأكيد إعدادات القفل؛ لن تُفتح الصفحة دون تحقق سحابي."}</p>
            )}
          </section>
        </main>
      );
    }

    if (!isPasswordEnabled(section)) return <Component {...props} />;
    const lockVersion = featureLocks.find(lock => lock.feature_key === section)?.updated_at ?? "unknown";
    return <PasswordProtectedSection key={`${section}:${lockVersion}`} section={section} sectionLabel={sectionLabel}><Component {...props} /></PasswordProtectedSection>;
  };
}
