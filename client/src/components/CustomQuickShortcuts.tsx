import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { canSellerAccessPath } from "@/lib/sellerAccess";
import { SCREEN_PIN_LOCKS } from "@/lib/supabase/screenPinRegistry";
import { loadUserQuickShortcuts, saveUserQuickShortcuts } from "@/lib/supabase/quickShortcuts";
import { Check, ExternalLink, Settings2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type QuickShortcut = { path: string; title: string; description: string };

export default function CustomQuickShortcuts({ userId, role }: { userId: string; role: string }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const options = useMemo<QuickShortcut[]>(() => SCREEN_PIN_LOCKS
    .filter(screen => !screen.path.includes(":"))
    .filter(screen => role !== "seller" || canSellerAccessPath(screen.path))
    .map(screen => ({ path: screen.path, title: screen.title, description: screen.description })), [role]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void loadUserQuickShortcuts(userId).then(paths => { if (active) setSelectedPaths(paths); }).catch(error => {
      if (active) toast.error(error instanceof Error ? error.message : "تعذر تحميل اختصاراتك السحابية.");
    });
    return () => { active = false; };
  }, [userId]);
  const selected = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const visibleOptions = options.filter(option => selected.has(option.path));

  const toggle = (path: string) => {
    const next = selected.has(path) ? selectedPaths.filter(item => item !== path) : [...selectedPaths, path];
    setSelectedPaths(next);
    void saveUserQuickShortcuts(userId, next).catch(error => toast.error(error instanceof Error ? error.message : "تعذر حفظ الاختصارات سحابياً."));
  };

  return (
    <div dir="rtl" className="fixed bottom-5 left-5 z-[70]">
      {open && (
        <div className="mb-3 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-2xl ring-1 ring-black/5">
          <div className="flex items-center justify-between bg-gradient-to-l from-indigo-700 to-violet-600 px-4 py-3 text-white">
            <div><p className="font-black">اختصاراتي السريعة</p><p className="text-xs text-indigo-100">تظهر هنا اختياراتك فقط</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق الاختصارات" className="rounded-full p-1 hover:bg-white/15"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-[min(60vh,26rem)] overflow-y-auto p-3">
            {visibleOptions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50 p-4 text-center text-sm text-indigo-900">
                لم تختر اختصارات بعد. اضغط «تخصيص الاختصارات» لإضافة الشاشات التي تحتاجها.
              </div>
            ) : (
              <div className="grid gap-2">
                {visibleOptions.map(option => (
                  <button key={option.path} type="button" onClick={() => { navigate(option.path); setOpen(false); }} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-right transition hover:border-indigo-200 hover:bg-indigo-50">
                    <span className="min-w-0"><span className="block truncate font-bold text-slate-800">{option.title}</span><span className="block truncate text-[11px] text-slate-500">{option.description}</span></span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-indigo-600" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border-t bg-slate-50 p-3"><Button type="button" variant="outline" className="w-full gap-2" onClick={() => setCustomizeOpen(true)}><Settings2 className="h-4 w-4" /> تخصيص الاختصارات</Button></div>
        </div>
      )}
      <button type="button" onClick={() => setOpen(value => !value)} aria-label="فتح الاختصارات السريعة" aria-expanded={open} className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-xl ring-4 ring-white transition hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300">
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>

      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader className="text-right"><DialogTitle>تخصيص الاختصارات السريعة</DialogTitle><DialogDescription>حدد الشاشات التي تريد ظهورها في الزر العائم. يُحفظ اختيارك فوراً لهذا الحساب في Supabase.</DialogDescription></DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map(option => (
              <label key={option.path} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-indigo-300 hover:bg-indigo-50">
                <Checkbox checked={selected.has(option.path)} onCheckedChange={() => toggle(option.path)} aria-label={`اختيار ${option.title}`} className="mt-0.5" />
                <span><span className="flex items-center gap-1 font-bold text-slate-800">{selected.has(option.path) && <Check className="h-3.5 w-3.5 text-indigo-600" />}{option.title}</span><span className="mt-1 block text-xs text-slate-500">{option.description}</span></span>
              </label>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
