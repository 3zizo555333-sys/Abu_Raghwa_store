import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { browserState } from "@/lib/browserState";
import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database, Json } from "./database.types";
import { trpc } from "@/lib/trpc";

type FeatureKey = Database["public"]["Tables"]["shop_feature_state"]["Row"]["feature_key"];
type FeatureRow = Database["public"]["Tables"]["shop_feature_state"]["Row"];
const SUPERVISOR_FEATURE_KEYS = new Set<FeatureKey>([
  "abu_raghwa_tasks", "points_system_employees",
  "abu_raghwa_penalty_rules", "abu_raghwa_penalty_logs", "abu_raghwa_invoice_categories_v2",
]);

export function canManageFeatureState(role: string, key: FeatureKey): boolean {
  return role === "manager" || role === "admin" || (role === "supervisor" && SUPERVISOR_FEATURE_KEYS.has(key));
}

async function activeContext(key: FeatureKey) {
  const context = await getActiveShopContext(true);
  if (!canManageFeatureState(context.role, key)) throw new Error("هذه الميزة متاحة للمدير أو المشرف المصرح به فقط.");
  return context;
}

export async function loadShopFeatureState<T>(key: FeatureKey): Promise<{ shopId: string; row: FeatureRow | null; value: T | null }> {
  const { shopId } = await activeContext(key);
  const result = await getSupabaseClient().from("shop_feature_state").select("shop_id,feature_key,payload,version,updated_by,created_at,updated_at").eq("shop_id", shopId).eq("feature_key", key).maybeSingle();
  const row = result.error ? (() => { throw new Error(result.error.message); })() : result.data as FeatureRow | null;
  return { shopId, row, value: (row?.payload as T | undefined) ?? null };
}

export async function saveShopFeatureState<T>(key: FeatureKey, payload: T, expectedVersion: number | null): Promise<FeatureRow> {
  assertCloudOnline();
  const { shopId } = await activeContext(key);
  const result = await getSupabaseClient().rpc("save_shop_feature_state", {
    p_shop_id: shopId,
    p_feature_key: key,
    p_payload: payload as Json,
    p_expected_version: expectedVersion,
  });
  return requireCloudResult(result) as FeatureRow;
}

export async function subscribeToShopFeatureState(shopId: string, key: FeatureKey, onChange: () => void): Promise<() => Promise<unknown>> {
  const supabase = getSupabaseClient();
  const channel = supabase.channel(`feature-state-${shopId}-${key}-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "shop_feature_state", filter: `shop_id=eq.${shopId}` }, payload => {
      if (payload.new && (payload.new as FeatureRow).feature_key === key) onChange();
      if (payload.old && (payload.old as FeatureRow).feature_key === key) onChange();
    })
    .subscribe();
  return async () => { await supabase.removeChannel(channel); };
}

/**
 * Supabase-first state for small legacy feature screens. It migrates a same-device
 * browser snapshot only when the authoritative shop row is absent, then removes the
 * local copy after the cloud confirms it. Manager/supervisor access is enforced by RLS.
 */
export function useShopFeatureState<T>(key: FeatureKey, initialValue: T): [T, (value: T | ((current: T) => T)) => void, boolean, () => Promise<boolean>] {
  const legacyQuery = trpc.sync.get.useQuery({ key }, { enabled: false, retry: false });
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;
  const [value, setValue] = useState<T>(initialValueRef.current);
  const [isLoading, setIsLoading] = useState(true);
  const shopIdRef = useRef<string | null>(null);
  const versionRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  valueRef.current = value;

  const refresh = useCallback(async (keepPending = false) => {
    const result = await loadShopFeatureState<T>(key);
    shopIdRef.current = result.shopId;
    if (keepPending && revisionRef.current > savedRevisionRef.current) return;
    if (result.row) {
      versionRef.current = Number(result.row.version);
      if (!keepPending) {
        valueRef.current = result.value as T;
        setValue(result.value as T);
      }
      browserState.remove(key);
      return;
    }
    versionRef.current = null;
    if (revisionRef.current > 0) return;
    let legacy = browserState.get(key);
    if (browserState.get("abu_staff_sync_token")) {
      try {
        const response = await legacyQuery.refetch();
        if (typeof response.data === "string" && response.data !== "[]" && response.data !== "{}" && response.data !== "null") legacy = response.data;
      } catch { /* Use the same-device snapshot only as a compatibility fallback. */ }
    }
    if (legacy && legacy !== "[]" && legacy !== "{}" && legacy !== "null") {
      try {
        const migrated = JSON.parse(legacy) as T;
        valueRef.current = migrated;
        setValue(migrated);
        revisionRef.current += 1;
        await flushRef.current();
      } catch {
        toast.error("تعذر نقل بيانات الميزة القديمة إلى السحابة؛ لم تُحذف النسخة المحلية.");
      }
    } else {
      valueRef.current = initialValueRef.current;
      setValue(initialValueRef.current);
    }
  }, [key, legacyQuery.refetch]);

  flushRef.current = async () => {
    while (savedRevisionRef.current < revisionRef.current) {
      const targetRevision = revisionRef.current;
      const snapshot = valueRef.current;
      try {
        const saved = await saveShopFeatureState(key, snapshot, versionRef.current);
        versionRef.current = Number(saved.version);
        savedRevisionRef.current = targetRevision;
        browserState.remove(key);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `تعذر حفظ ${key} في Supabase.`);
        if (versionRef.current !== null) {
          try { await refresh(true); } catch { /* Preserve the unsaved screen state and surface the original error. */ }
        }
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => Promise<unknown>) | undefined;
    const initialize = async () => {
      try {
        await refresh();
        if (!active || !shopIdRef.current) return;
        unsubscribe = await subscribeToShopFeatureState(shopIdRef.current, key, () => {
          if (revisionRef.current === savedRevisionRef.current) void refresh();
          else void refresh(true);
        });
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "تعذر تحميل بيانات الميزة من Supabase.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void initialize();
    return () => { active = false; if (timerRef.current) clearTimeout(timerRef.current); if (unsubscribe) void unsubscribe(); };
  }, [key, refresh]);

  const update = useCallback((next: T | ((current: T) => T)) => {
    if (isLoading) {
      toast.error("انتظر اكتمال تحميل الحالة السحابية قبل الحفظ.");
      return;
    }
    const resolved = typeof next === "function" ? (next as (current: T) => T)(valueRef.current) : next;
    valueRef.current = resolved;
    revisionRef.current += 1;
    setValue(resolved);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { timerRef.current = null; void flushRef.current(); }, 250);
  }, [isLoading]);

  const flushNow = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    return flushRef.current();
  }, []);

  return [value, update, isLoading, flushNow];
}
