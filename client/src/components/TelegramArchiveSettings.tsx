import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getActiveShopContext } from "@/lib/supabase/products";

type Settings = {
  sales_channel_id: string;
  archive_channel_id: string;
  backup_channel_id: string;
  is_enabled: boolean;
  notify_live_sales: boolean;
  notify_low_stock: boolean;
  enable_daily_backup: boolean;
  has_bot_token: boolean;
};
const EMPTY: Settings = { sales_channel_id: "", archive_channel_id: "", backup_channel_id: "", is_enabled: false, notify_live_sales: true, notify_low_stock: true, enable_daily_backup: false, has_bot_token: false };

export default function TelegramArchiveSettings() {
  const [shopId, setShopId] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const context = await getActiveShopContext();
        if (cancelled) return;
        setShopId(context.shopId);
        const canManage = context.role === "manager" || context.role === "admin";
        setAllowed(canManage);
        if (!canManage) return;
        const { data, error: rpcError } = await (getSupabaseClient() as any).rpc("get_telegram_archive_settings_v1", { p_shop_id: context.shopId });
        if (rpcError) throw new Error(rpcError.message);
        const value = Array.isArray(data) ? data[0] : data;
        if (value) setSettings({ ...EMPTY, ...value, sales_channel_id: value.sales_channel_id || "", archive_channel_id: value.archive_channel_id || "", backup_channel_id: value.backup_channel_id || "", has_bot_token: Boolean(value.has_bot_token || value.bot_token_masked) });
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "تعذر تحميل إعدادات البوت."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const request = async (path: string, success: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const { data, error: authError } = await getSupabaseClient().auth.getSession();
      if (authError) throw new Error(authError.message);
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("انتهت الجلسة؛ سجّل الدخول مجدداً.");
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ shopId }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || "تعذر إكمال الطلب.");
      const channelResults = Array.isArray(result.results) ? result.results.map((item: { channel?: string; ok?: boolean; error?: string }) => `${item.channel || "القناة"}: ${item.ok ? "نجح" : item.error || "فشل"}`).join(" — ") : "";
      setNotice(channelResults || result.message || success);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر إكمال الطلب."); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: rpcError } = await (getSupabaseClient() as any).rpc("save_telegram_archive_settings_v1", {
        p_shop_id: shopId,
        p_sales_channel_id: settings.sales_channel_id.trim() || null,
        p_archive_channel_id: settings.archive_channel_id.trim() || null,
        p_backup_channel_id: settings.backup_channel_id.trim() || null,
        p_is_enabled: settings.is_enabled,
        p_notify_live_sales: settings.notify_live_sales,
        p_notify_low_stock: settings.notify_low_stock,
        p_enable_daily_backup: settings.enable_daily_backup,
        p_bot_token: token.trim() || null,
      });
      if (rpcError) throw new Error(rpcError.message);
      if (token.trim()) setSettings(current => ({ ...current, has_bot_token: true }));
      setToken(""); setNotice("تم حفظ إعدادات Bot 2 بنجاح.");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ الإعدادات."); }
    finally { setBusy(false); }
  };
  const field = (label: string, key: "sales_channel_id" | "archive_channel_id" | "backup_channel_id", hint: string) => <div><label className="mb-2 block text-sm font-medium">{label}</label><Input dir="ltr" value={settings[key]} onChange={e => setSettings(current => ({ ...current, [key]: e.target.value }))} placeholder={hint} /></div>;
  const toggle = (label: string, key: "is_enabled" | "notify_live_sales" | "notify_low_stock" | "enable_daily_backup") => <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={settings[key]} onChange={e => setSettings(current => ({ ...current, [key]: e.target.checked }))} />{label}</label>;

  if (loading) return <Card dir="rtl"><CardContent className="py-8 text-center text-sm text-slate-500">جارٍ تحميل إعدادات Bot 2…</CardContent></Card>;
  if (!allowed) return null;
  return <Card dir="rtl" className="border-0 border-t-4 border-sky-600 shadow-sm">
    <CardHeader><CardTitle>أرشفة تيليجرام — Bot 2</CardTitle><CardDescription>إعداد قنوات المبيعات والأرشيف والنسخ الاحتياطي. بيانات Bot 1 لا تتأثر بهذه الإعدادات.</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">{field("قناة المبيعات", "sales_channel_id", "معرّف القناة أو @username")}{field("قناة الأرشيف", "archive_channel_id", "معرّف القناة أو @username")}{field("قناة النسخ الاحتياطي", "backup_channel_id", "معرّف القناة أو @username")}</div>
      <div className="grid gap-3 sm:grid-cols-2">{toggle("تفعيل Bot 2", "is_enabled")}{toggle("إشعارات المبيعات المباشرة", "notify_live_sales")}{toggle("إشعارات انخفاض المخزون", "notify_low_stock")}{toggle("النسخ الاحتياطي اليومي", "enable_daily_backup")}</div>
      <div><label className="mb-2 block text-sm font-medium">توكن البوت</label><Input dir="ltr" type="password" autoComplete="new-password" value={token} onChange={e => setToken(e.target.value)} placeholder={settings.has_bot_token ? "•••••••••••• — محفوظ (أدخل قيمة جديدة للاستبدال)" : "أدخل توكن Bot 2"} /><p className="mt-1 text-xs text-slate-500">{settings.has_bot_token ? "يوجد توكن محفوظ؛ لا يُعرض التوكن الحالي." : "لا يوجد توكن محفوظ حتى الآن."}</p></div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || !shopId} onClick={() => void request("/api/telegram-archive/test", "تم إرسال طلب اختبار القنوات الثلاث.")}>اختبار القنوات الثلاث</Button><Button type="button" variant="outline" disabled={busy || !shopId} onClick={() => void request("/api/telegram-archive/backup-now", "تم طلب إنشاء نسخة احتياطية الآن.")}>أخذ نسخة الآن</Button><Button type="button" disabled={busy || !shopId} onClick={() => void save()}>{busy ? "جارٍ التنفيذ…" : "حفظ إعدادات Bot 2"}</Button></div>
    </CardContent>
  </Card>;
}
