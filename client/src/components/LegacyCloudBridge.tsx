import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * مفاتيح صفحات قديمة ما زالت تقرأ وتكتب localStorage مباشرة.
 * الجسر لا يغيّر واجهاتها: يرفع الكتابات إلى السحابة، وعند وصول تغيير خارجي
 * يستبدل التخزين المحلي ثم يعيد تحميل الصفحة كي تقرأ الصفحة القديمة البيانات الجديدة.
 */
export const LEGACY_CLOUD_KEYS = [
  "abu_raghwa_recipes",
  "abu_catalog_manual_products",
  "abu_catalog_categories",
  "abu_catalog_companies",
  "abu_catalog_pricing",
  "abu_raghwa_invoice_categories_v2",
  "abu_raghwa_custom_voice_commands",
  "abu_reward_levels",
  "points_system_employees",
  "abu_raghwa_sales",
  "abu_raghwa_tasks",
  "abu_raghwa_apartment_items",
  "abu_raghwa_apartment_categories",
  "current_invoice",
  "abu_raghwa_raw_materials",
  "abu_raghwa_materials",
  "abu_raghwa_shortages",
  "abu_raghwa_alert_history",
  "abu_raghwa_audit_log",
  "abu_raghwa_checks",
  "abu_raghwa_customers",
  "abu_raghwa_customers_advanced",
  "abu_raghwa_employees",
  "abu_raghwa_global_offers",
  "abu_raghwa_invoice_categories",
  "invoice_categories",
  "abu_raghwa_manual_products",
  "abu_raghwa_notifications",
  "abu_raghwa_payment_gateways",
  "abu_raghwa_productions",
  "abu_raghwa_suppliers_advanced",
  "abu_raghwa_shortage_categories",
  "abu_raghwa_expenses",
  "abu_raghwa_debts",
  "abu_raghwa_receivables",
  "abu_raghwa_email_notifications",
  "abu_raghwa_offers",
  "abu_raghwa_saved_offers",
  "abu_raghwa_custom_strategies",
  "abu_gift_delivery_logs",
  "abu_active_customer_phone",
  "abu_raghwa_processed_sales",
  "abu_raghwa_scanned_invoices",
  "abu_raghwa_attendance",
] as const;

const PUBLIC_LEGACY_CLOUD_KEYS = new Set<LegacyCloudKey>([
  "abu_catalog_manual_products",
  "abu_catalog_categories",
  "abu_catalog_companies",
  "abu_catalog_pricing",
  "abu_raghwa_global_offers",
  "abu_raghwa_offers",
]);

type LegacyCloudKey = (typeof LEGACY_CLOUD_KEYS)[number];

const readLocalJson = (key: string) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ?? "[]";
  } catch {
    return "[]";
  }
};

function LegacyCloudKeySync({ storageKey, onRemoteUpdate, enabled }: { storageKey: LegacyCloudKey; onRemoteUpdate: () => void; enabled: boolean }) {
  const lastKnownValue = useRef(readLocalJson(storageKey));
  const lastCloudValue = useRef(readLocalJson(storageKey));
  const pendingLocalValue = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const cloudQuery = trpc.sync.get.useQuery(
    { key: storageKey },
    { refetchInterval: (_data, query) => query?.state.error ? false : 20_000, refetchOnWindowFocus: false, staleTime: 15_000, retry: false, enabled },
  );
  const saveMutation = trpc.sync.set.useMutation();

  useEffect(() => {
    if (!enabled) return;
    const handleLocalWrite = (event: Event) => {
      const customEvent = event as CustomEvent<{ key?: string }>;
      if (customEvent.detail?.key !== storageKey) return;
      const currentValue = readLocalJson(storageKey);
      if (currentValue === lastKnownValue.current) return;
      lastKnownValue.current = currentValue;
      pendingLocalValue.current = currentValue;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const latestValue = pendingLocalValue.current;
        if (latestValue !== null) {
          const baseDataJson = lastCloudValue.current;
          saveMutation.mutate({ key: storageKey, dataJson: latestValue, baseDataJson }, {
            onSuccess: () => {
              lastCloudValue.current = latestValue;
              pendingLocalValue.current = null;
            },
            onError: () => {
              pendingLocalValue.current = null;
            },
          });
        }
        saveTimer.current = null;
      }, 700);
    };

    window.addEventListener("abu-raghwa-local-write", handleLocalWrite);
    return () => {
      window.removeEventListener("abu-raghwa-local-write", handleLocalWrite);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [enabled, saveMutation, storageKey]);

  useEffect(() => {
    if (!enabled) return;
    if (cloudQuery.data === undefined) return;

    // أول جهاز يفتح قسماً قديماً ينقل بياناته الموجودة إلى السحابة مرة واحدة.
    if (cloudQuery.data === null) {
      const localValue = readLocalJson(storageKey);
      lastKnownValue.current = localValue;
      lastCloudValue.current = localValue;
      pendingLocalValue.current = localValue;
      saveMutation.mutate({ key: storageKey, dataJson: localValue });
      return;
    }

    const cloudValue = cloudQuery.data;
    const localValue = readLocalJson(storageKey);
    if (cloudValue === localValue) {
      lastKnownValue.current = cloudValue;
      lastCloudValue.current = cloudValue;
      if (pendingLocalValue.current === cloudValue) pendingLocalValue.current = null;
      return;
    }

    // بعد حذف أو تعديل محلي، قد يعيد الاستعلام قيمة سحابية أقدم لثوانٍ قليلة.
    // لا نعيد تحميل الصفحة في هذه اللحظة؛ ننتظر حتى يصل التغيير المحلي إلى السحابة.
    if (pendingLocalValue.current === localValue) return;

    // التغيير وصل من جهاز آخر؛ نحدّث التخزين ثم نعيد قراءة الصفحة نفسها دون تبديل الواجهة.
    lastKnownValue.current = cloudValue;
    lastCloudValue.current = cloudValue;
    window.localStorage.setItem(storageKey, cloudValue);
    onRemoteUpdate();
  }, [cloudQuery.data, enabled, onRemoteUpdate, saveMutation, storageKey]);

  return null;
}

export default function LegacyCloudBridge({ enabled = true, publicOnly = false }: { enabled?: boolean; publicOnly?: boolean }) {
  const refreshQueued = useRef(false);
  const [activeCount, setActiveCount] = useState(0);

  const visibleKeys = LEGACY_CLOUD_KEYS.filter(storageKey => !publicOnly || PUBLIC_LEGACY_CLOUD_KEYS.has(storageKey));

  useEffect(() => {
    if (!enabled) {
      setActiveCount(0);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const start = () => {
      let count = 0;
      const activateNext = () => {
        if (cancelled) return;
        count += 3;
        setActiveCount(Math.min(count, visibleKeys.length));
        if (count < visibleKeys.length) timer = window.setTimeout(activateNext, 80);
      };
      activateNext();
    };
    const idleCallback = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    // Legacy collections are background synchronization only. Starting all
    // queries during login made the first page compete for the network.
    if (idleCallback) {
      idleCallback(() => { timer = window.setTimeout(start, 1200); }, { timeout: 2500 });
    } else {
      timer = window.setTimeout(start, 1500);
    }
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, publicOnly, visibleKeys.length]);

  useEffect(() => {
    const storagePrototype = Storage.prototype as Storage & { __abuRaghwaCloudPatched?: boolean };
    if (storagePrototype.__abuRaghwaCloudPatched) return;

    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
      originalSetItem.call(this, key, value);
      if (this === window.localStorage && (LEGACY_CLOUD_KEYS as readonly string[]).includes(key)) {
        window.dispatchEvent(new CustomEvent("abu-raghwa-local-write", { detail: { key, value } }));
      }
    };
    storagePrototype.__abuRaghwaCloudPatched = true;
  }, []);

  const queueRefresh = () => {
    // صفحة المنتجات تتلقى تغييرات الجداول من Supabase Realtime؛ إعادة تحميلها
    // قد تُغلق نافذة التفاصيل، بينما تحتاج الصفحات القديمة فقط إلى إعادة القراءة.
    if (window.location.pathname === "/products") return;
    if (refreshQueued.current) return;
    refreshQueued.current = true;
    window.setTimeout(() => window.location.reload(), 250);
  };

  return (
    <>
      {visibleKeys.map((storageKey, index) => (
        <LegacyCloudKeySync key={storageKey} storageKey={storageKey} enabled={enabled && index < activeCount} onRemoteUpdate={queueRefresh} />
      ))}
    </>
  );
}
