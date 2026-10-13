import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSecurity } from "@/contexts/SecurityContext";
import { isValidFeaturePin } from "@/lib/supabase/featureLocks";
import { Lock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface PasswordProtectedSectionProps {
  section: string;
  sectionLabel: string;
  children: React.ReactNode;
}

export default function PasswordProtectedSection({ section, sectionLabel, children }: PasswordProtectedSectionProps) {
  const { checkPassword } = useSecurity();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  if (isUnlocked) return <>{children}</>;

  const handleUnlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!isValidFeaturePin(pin)) {
      setError("أدخل رمزاً مكوناً من 4 أو 6 أرقام.");
      return;
    }
    setIsChecking(true);
    try {
      const verified = await checkPassword(section, pin);
      if (verified) {
        setIsUnlocked(true);
        setPin("");
        toast.success(`تم فتح ${sectionLabel}`);
        return;
      }
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setPin("");
      if (nextAttempts >= 5) {
        setIsLocked(true);
        setError("تم إيقاف المحاولات مؤقتاً. حاول بعد قليل.");
        window.setTimeout(() => {
          setAttempts(0);
          setIsLocked(false);
          setError("");
        }, 30_000);
      } else {
        setError("رمز PIN غير صحيح.");
      }
    } catch (verificationError) {
      const message = verificationError instanceof Error ? verificationError.message : "تعذر التحقق من الرمز عبر السحابة.";
      setError(message);
      toast.error("تعذر التحقق من رمز القفل. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        dir="rtl"
        showCloseButton={false}
        onEscapeKeyDown={event => event.preventDefault()}
        onPointerDownOutside={event => event.preventDefault()}
        onInteractOutside={event => event.preventDefault()}
        className="max-w-md border-violet-200 p-7 shadow-2xl"
      >
        <DialogHeader className="items-center text-center">
          <div className="mb-1 inline-flex rounded-full bg-violet-100 p-4"><Lock className="h-8 w-8 text-violet-700" /></div>
          <DialogTitle className="text-2xl font-black text-slate-950">{sectionLabel} مقفل</DialogTitle>
          <DialogDescription className="leading-6">أدخل رمز PIN المعتمد للمتابعة. يجري التحقق منه بأمان عبر Supabase.</DialogDescription>
        </DialogHeader>
        <form onSubmit={event => { void handleUnlock(event); }} className="space-y-4">
          <label htmlFor="feature-pin" className="block text-sm font-bold text-slate-800">رمز القفل</label>
          <Input
            id="feature-pin"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{4}|[0-9]{6}"
            maxLength={6}
            value={pin}
            onChange={event => { setPin(event.target.value.replace(/[^0-9]/g, "").slice(0, 6)); setError(""); }}
            placeholder="•••• أو ••••••"
            className="text-center text-xl tracking-[0.45em]"
            disabled={isLocked || isChecking}
            autoFocus
          />
          {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
          {attempts > 0 && !isLocked && <p className="text-center text-xs text-amber-700">المحاولات المتبقية قبل الإيقاف المؤقت: {5 - attempts}</p>}
          <Button type="submit" className="w-full bg-violet-700 hover:bg-violet-800" disabled={isLocked || isChecking || !isValidFeaturePin(pin)}>
            {isChecking ? "جارٍ التحقق…" : isLocked ? "حاول بعد قليل" : "فتح الميزة"}
          </Button>
        </form>
        <p className="text-center text-xs text-slate-500">لا يُحفظ الرمز في هذا الجهاز، وتبقى صلاحيات Supabase وRLS مطبقة.</p>
      </DialogContent>
    </Dialog>
  );
}
