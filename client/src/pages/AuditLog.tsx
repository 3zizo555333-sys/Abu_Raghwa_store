import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Download, RefreshCw, ShieldAlert } from "lucide-react";
import { withPasswordProtection } from "@/components/withPasswordProtection";
import { getSupabaseClient, requireCloudResult } from "@/lib/supabase/client";
import { getActiveShopContext } from "@/lib/supabase/products";

type AuditEntry = {
  id: number;
  entityType: string;
  timestamp: string;
  actorId: string;
  action: string;
  entityId: string;
  changedFields: string[];
  details: string;
};
const MAX_ROWS = 200;

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function AuditLogContent() {
  const [, navigate] = useLocation();
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [filterType, setFilterType] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAuditLog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const context = await getActiveShopContext();
      if (!(context.role === "manager" || context.role === "admin" || context.role === "supervisor")) {
        throw new Error("سجل التدقيق متاح للمدير والمشرف فقط.");
      }
      const result = await getSupabaseClient()
        .from("audit_events")
        .select("id, actor_id, action, entity_type, entity_id, changed_fields, details, created_at")
        .eq("shop_id", context.shopId)
        .order("created_at", { ascending: false })
        .range(0, MAX_ROWS - 1);
      const rows = requireCloudResult(result);
      setAuditLog(rows.map(row => ({
        id: row.id,
        entityType: row.entity_type,
        timestamp: row.created_at,
        actorId: row.actor_id ?? "system",
        action: row.action,
        entityId: row.entity_id ?? "",
        changedFields: row.changed_fields,
        details: JSON.stringify(row.details ?? {}),
      })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل سجل التدقيق من Supabase.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAuditLog(); }, [loadAuditLog]);

  const filteredLog = useMemo(() => auditLog.filter(entry => {
    const matchesType = filterType === "all" || entry.entityType === filterType;
    const searchable = `${entry.actorId} ${entry.action} ${entry.entityId} ${entry.details} ${entry.changedFields.join(" ")}`.toLocaleLowerCase("ar-EG");
    return matchesType && searchable.includes(searchText.toLocaleLowerCase("ar-EG"));
  }), [auditLog, filterType, searchText]);

  const getTypeLabel = (type: string) => ({ products: "منتج", invoice: "فاتورة", expenses: "مصروف", bank_checks: "شيك", tasks: "مهمة" } as Record<string, string>)[type] || type;
  const getTypeColor = (type: string) => type === "invoice" ? "bg-green-50" : type === "products" ? "bg-blue-50" : "bg-gray-50";

  const exportLog = () => {
    const lines = [
      ["التاريخ", "الكيان", "المستخدم", "الإجراء", "معرف السجل", "الحقول المعدلة", "التفاصيل"].map(csvCell).join(","),
      ...filteredLog.map(entry => [entry.timestamp, getTypeLabel(entry.entityType), entry.actorId, entry.action, entry.entityId, entry.changedFields.join("; "), entry.details].map(csvCell).join(",")),
    ];
    const element = document.createElement("a");
    element.setAttribute("href", `data:text/csv;charset=utf-8,${encodeURIComponent(lines.join("\n"))}`);
    element.setAttribute("download", `audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const productEvents = auditLog.filter(entry => entry.entityType === "products").length;
  const invoiceEvents = auditLog.filter(entry => entry.entityType === "invoice").length;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white shadow-sm"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6"><div><h1 className="text-3xl font-bold text-gray-900">سجل التدقيق</h1><p className="mt-1 text-gray-600">أحداث الأعمال المحفوظة في Supabase، بحد أقصى 200 حدث حديث</p></div><Button variant="outline" onClick={() => navigate("/dashboard")} className="flex items-center gap-2"><ArrowLeft className="h-4 w-4" />العودة</Button></div></header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><p>سجل التدقيق غير قابل للمسح أو التعديل من الواجهة. يعرض هذا السجل الأحداث التي تسجلها قاعدة البيانات فقط؛ محاولات الدخول الفاشلة ليست ضمن هذا المصدر.</p></div>
        {error && <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button type="button" variant="outline" onClick={() => void loadAuditLog()}>إعادة المحاولة</Button></div>}
        <Card className="mb-8 border-0 shadow-sm"><CardHeader><CardTitle>تصفية الأحداث</CardTitle><CardDescription>البحث محليًا في النتائج السحابية المحمّلة دون حفظها في التخزين المحلي.</CardDescription></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-3"><div><label htmlFor="audit-search" className="mb-2 block text-sm font-medium">البحث</label><input id="audit-search" type="search" placeholder="مستخدم، إجراء، أو معرف سجل" value={searchText} onChange={event => setSearchText(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" /></div><div><label htmlFor="audit-type" className="mb-2 block text-sm font-medium">نوع السجل</label><select id="audit-type" value={filterType} onChange={event => setFilterType(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2"><option value="all">الكل</option><option value="products">المنتجات</option><option value="invoice">الفواتير</option><option value="expenses">المصروفات</option><option value="bank_checks">الشيكات</option></select></div><div className="flex items-end gap-2"><Button type="button" onClick={exportLog} disabled={!filteredLog.length} className="flex-1"><Download className="ml-2 h-4 w-4" />تصدير النتائج</Button><Button type="button" variant="outline" onClick={() => void loadAuditLog()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button></div></div></CardContent></Card>
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3"><Card className="border-0 shadow-sm"><CardContent className="pt-6"><p className="text-sm text-gray-600">الأحداث المحمّلة</p><p className="text-2xl font-bold text-blue-600">{auditLog.length}</p></CardContent></Card><Card className="border-0 shadow-sm"><CardContent className="pt-6"><p className="text-sm text-gray-600">تغييرات المنتجات</p><p className="text-2xl font-bold text-orange-600">{productEvents}</p></CardContent></Card><Card className="border-0 shadow-sm"><CardContent className="pt-6"><p className="text-sm text-gray-600">أحداث الفواتير</p><p className="text-2xl font-bold text-green-600">{invoiceEvents}</p></CardContent></Card></div>
        <Card className="border-0 shadow-sm"><CardHeader><CardTitle>الأحداث الأخيرة</CardTitle><CardDescription>النتيجة مقيدة بالمحل الحالي وسياسات RLS في قاعدة البيانات.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-100"><tr><th className="px-4 py-3 text-right font-medium">التاريخ والوقت</th><th className="px-4 py-3 text-right font-medium">الكيان</th><th className="px-4 py-3 text-right font-medium">المستخدم</th><th className="px-4 py-3 text-right font-medium">الإجراء</th><th className="px-4 py-3 text-right font-medium">معرف السجل</th><th className="px-4 py-3 text-right font-medium">الحقول والتفاصيل</th></tr></thead><tbody>{filteredLog.length ? filteredLog.map(entry => <tr key={entry.id} className={`border-b ${getTypeColor(entry.entityType)}`}><td className="whitespace-nowrap px-4 py-3">{new Date(entry.timestamp).toLocaleString("ar-EG")}</td><td className="px-4 py-3 font-medium">{getTypeLabel(entry.entityType)}</td><td className="max-w-48 truncate px-4 py-3 font-mono text-xs">{entry.actorId}</td><td className="px-4 py-3">{entry.action}</td><td className="max-w-40 truncate px-4 py-3 font-mono text-xs">{entry.entityId || "—"}</td><td className="max-w-md px-4 py-3 text-xs text-gray-600"><div>{entry.changedFields.join(", ") || "—"}</div><div className="mt-1 break-all">{entry.details}</div></td></tr>) : <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{loading ? "جارٍ تحميل سجل التدقيق…" : "لا توجد أحداث مطابقة ضمن النتائج المحمّلة."}</td></tr>}</tbody></table></div></CardContent></Card>
      </main>
    </div>
  );
}

export default withPasswordProtection(AuditLogContent, "logs", "السجل");
