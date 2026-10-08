import { useState, useEffect, useCallback, useRef } from 'react';
import { trpc } from './trpc';
import { toast } from 'sonner';

const PUBLIC_SYNC_KEYS = new Set([
  'abu_raghwa_products',
  'abu_raghwa_product_categories',
  'abu_catalog_manual_products',
  'abu_catalog_categories',
  'abu_catalog_companies',
  'abu_catalog_pricing',
  'abu_raghwa_global_offers',
  'abu_raghwa_offers',
  'abu_raghwa_display_settings',
]);

const parsedStorageCache = new Map<string, { raw: string; value: unknown }>();
const recentCloudSaves = new Map<string, { dataJson: string; savedAt: number }>();
const collectionSaveQueues = new Map<string, Promise<void>>();
const LARGE_COLLECTION_KEY = 'abu_raghwa_products';
const COLLECTION_PAGE_SIZE = 500;
const getStableCloudItemId = (item: unknown) => {
  if (item && typeof item === "object") {
    const value = item as Record<string, unknown>;
    const stableId = value.id ?? value.key ?? value.code;
    if (stableId !== undefined && stableId !== null && String(stableId).trim()) return String(stableId);
  }
  return JSON.stringify(item);
};
const saveCloudValue = (save: (input: { key: string; dataJson: string }) => void, key: string, dataJson: string) => {
  const now = Date.now();
  const previous = recentCloudSaves.get(key);
  // Several mounted pages can observe the same localStorage update. Coalesce
  // identical writes for a short window instead of batching thousands of
  // duplicate sync.set calls into one browser request.
  if (previous?.dataJson === dataJson && now - previous.savedAt < 2_000) return;
  recentCloudSaves.set(key, { dataJson, savedAt: now });
  save({ key, dataJson });
};
const readCachedLocalValue = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const cached = parsedStorageCache.get(key);
    if (cached?.raw === raw) return cached.value as T;
    const value = JSON.parse(raw) as T;
    parsedStorageCache.set(key, { raw, value });
    return value;
  } catch {
    return fallback;
  }
};

/**
 * هوك مخصص للمزامنة السحابية الفورية بين الأجهزة بدون أدوار أو تعقيد
 * يقرأ ويحفظ البيانات في خادم قاعدة البيانات المشتركة مع تحديث دوري (Polling) كل 4 ثوانٍ
 */
export function useCloudState<T>(key: string, initialValue: T, options?: { skipInitialSeed?: boolean }): [T, (value: T | ((val: T) => T)) => void, boolean] {
  const [data, setData] = useState<T>(() => {
    return readCachedLocalValue(key, initialValue);
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isInitialMount = useRef(true);
  const hasSeededEmptyCloudValue = useRef(false);
  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncEnabled = PUBLIC_SYNC_KEYS.has(key) || Boolean(sessionStorage.getItem('abu_staff_sync_token'));
  const isLargeCollection = key === LARGE_COLLECTION_KEY;
  const utils = trpc.useUtils();

  // Small settings keep the regular endpoint. The product collection is read
  // through bounded pages so a 10,000-item catalog never depends on one huge
  // response that a mobile browser or proxy may abort.
  const regularQuery = trpc.sync.get.useQuery(
    { key },
    {
      // Product/catalog changes must reach another phone quickly after a
      // manager import. Keep the request light (one read of the chunked
      // collection) but do not leave a 60-second stale window in the cache.
      staleTime: PUBLIC_SYNC_KEYS.has(key) ? 10_000 : 20_000,
      refetchInterval: (_data, query) => query?.state.error ? false : (PUBLIC_SYNC_KEYS.has(key) ? 5_000 : 30_000), // تحديث سريع دون إعادة تحميل الكتالوج كاملًا عند كل نبضة
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
      retry: false,
      enabled: syncEnabled && !isLargeCollection,
    }
  );
  const firstChunkQuery = trpc.sync.getChunk.useQuery(
    { key, offset: 0, limit: COLLECTION_PAGE_SIZE },
    {
      staleTime: 10_000,
      refetchInterval: (_data, query) => query?.state.error ? false : 5_000,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
      retry: false,
      enabled: syncEnabled && isLargeCollection,
    }
  );
  const [chunkedServerData, setChunkedServerData] = useState<string | null>(null);
  const [chunkedCloudError, setChunkedCloudError] = useState<unknown>(null);
  const [chunkedLoadComplete, setChunkedLoadComplete] = useState(!isLargeCollection);
  const hasReconciledLargeLocal = useRef(false);
  useEffect(() => {
    if (!isLargeCollection || !firstChunkQuery.data) return;
    let cancelled = false;
    setChunkedLoadComplete(false);
    setChunkedCloudError(null);
    const loadCollection = async () => {
      const seen = new Set<string>();
      const items: unknown[] = [];
      const appendUnique = (pageItems: unknown[]) => {
        for (const item of pageItems) {
          const key = getStableCloudItemId(item);
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(item);
        }
      };
      appendUnique(firstChunkQuery.data.items);
      // Render the first page immediately. A large catalog must not look
      // empty on an employee phone while the remaining pages are loading.
      setChunkedServerData(JSON.stringify(items));
      let offset = firstChunkQuery.data.items.length;
      let cursor = firstChunkQuery.data.nextCursor ?? null;
      let hasMore = Boolean(firstChunkQuery.data.hasMore) || Boolean(cursor) || (items.length >= COLLECTION_PAGE_SIZE && items.length < Number(firstChunkQuery.data.total || 0));
      // Cursor pages are deliberately sequential: unlike parallel OFFSET
      // requests, each page starts after the last delivered record even if a
      // product is added or deleted while another device is loading.
      while (hasMore && !cancelled) {
        let page: typeof firstChunkQuery.data | undefined;
        let lastError: unknown;
        for (let attempt = 0; attempt < 2 && !page; attempt += 1) {
          try {
            page = await utils.sync.getChunk.fetch({
              key,
              offset,
              limit: COLLECTION_PAGE_SIZE,
              ...(cursor ? { afterPosition: cursor.position, afterRecordId: cursor.recordId } : {}),
            });
          } catch (error) {
            lastError = error;
            if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
        if (!page) throw lastError instanceof Error ? lastError : new Error("تعذر تحميل صفحة من المنتجات السحابية");
        const before = items.length;
        appendUnique(page.items);
        if (!page.items.length || items.length === before) break;
        offset += page.items.length;
        cursor = page.nextCursor ?? null;
        hasMore = Boolean(page.hasMore) || Boolean(cursor) || page.items.length >= COLLECTION_PAGE_SIZE;
        if (!cancelled) setChunkedServerData(JSON.stringify(items));
      }
      if (!cancelled) setChunkedLoadComplete(true);
    };
    loadCollection().catch(error => {
      if (!cancelled) {
        setChunkedCloudError(error);
        setChunkedLoadComplete(false);
      }
    });
    return () => { cancelled = true; };
  }, [firstChunkQuery.data, isLargeCollection, key, utils]);

  const serverData = isLargeCollection ? chunkedServerData : regularQuery.data;
  const cloudError = isLargeCollection ? (firstChunkQuery.error || chunkedCloudError) : regularQuery.error;

  // الحفظ في الخادم
  const saveMutation = trpc.sync.set.useMutation({
    // القيمة المحلية المعروضة هي الأحدث بالفعل؛ التحديث الخارجي يكفيه polling الهادئ.
    // عدم إعادة جلب القائمة بعد كل حفظ يمنع دوامة طلبات عند إدخال بيانات كثيرة.
    onSuccess: () => undefined,
    onError: (error) => {
      if (error.message.includes('سجّل دخول الموظف') || error.message.includes('انتهت جلسة الموظف')) return;
      console.error(`[CloudSync] Failed to save ${key}:`, error);
      toast.error(`تعذر حفظ البيانات سحابيًا (${key}). تحقق من الاتصال وحاول مرة أخرى.`);
    },
  });
  // The mutation result object can be recreated during renders. Keep only the
  // stable mutate function in effects so initial local-data seeding runs once.
  const saveCloud = saveMutation.mutate;
  const saveCloudSnapshot = saveMutation.mutateAsync;

  const saveLargeCollection = useCallback(async (value: T, baseDataJson?: string | null) => {
    const items = Array.isArray(value) ? value : [];
    const previous = collectionSaveQueues.get(key) || Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      await saveCloudSnapshot({ key, dataJson: JSON.stringify(items), ...(baseDataJson ? { baseDataJson } : {}) });
    });
    collectionSaveQueues.set(key, next);
    await next;
  }, [key, saveCloudSnapshot]);

  // مزامنة البيانات القادمة من الخادم. For large catalogs the completed
  // server response is the authoritative snapshot; stale local-only IDs must
  // never be re-uploaded because they may have been intentionally deleted.
  useEffect(() => {
    if (serverData !== null && serverData !== undefined && (!isLargeCollection || chunkedLoadComplete)) {
      try {
        const parsed = JSON.parse(serverData);
        // مقارنة سريعة لتجنب إعادة التجسيد بلا مبرر
        setData(prev => {
          const prevStr = JSON.stringify(prev);
          let nextParsed = parsed;
          if (isLargeCollection && !hasReconciledLargeLocal.current && Array.isArray(prev) && Array.isArray(parsed) && prev.length > parsed.length) {
            const serverIds = new Set(parsed.map(getStableCloudItemId));
            const localOnlyItems = prev.filter(item => !serverIds.has(getStableCloudItemId(item)));
            if (localOnlyItems.length) {
              // A pre-hardening device may contain a newly created product
              // that never reached the cloud. Preserve it once and let the
              // server's conflict-safe merge publish it for every device.
              nextParsed = [...parsed, ...localOnlyItems];
              saveLargeCollection(nextParsed as T, serverData);
            }
            hasReconciledLargeLocal.current = true;
          }
          // Never let an empty bootstrap response erase a non-empty local
          // collection. Keep the local records and re-upload them after the
          // server confirms the response, rather than treating a transient
          // empty response as an intentional delete.
          if (Array.isArray(prev) && Array.isArray(parsed) && prev.length > 0 && parsed.length === 0) {
            nextParsed = prev;
            const preservedJson = JSON.stringify(prev);
            if (isLargeCollection) void saveLargeCollection(prev as T, serverData);
            else saveCloudValue(saveCloud, key, preservedJson);
          }
          const newStr = JSON.stringify(nextParsed);
          if (prevStr !== newStr) {
            parsedStorageCache.set(key, { raw: newStr, value: nextParsed });
            window.setTimeout(() => localStorage.setItem(key, newStr), 0);
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("abu-raghwa-cloud-update", { detail: { key } }));
            }
            return nextParsed;
          }
          return prev;
        });
      } catch (e) {
        console.error("Error parsing cloud sync data for key:", key, e);
      }
    }
  }, [chunkedLoadComplete, isLargeCollection, saveLargeCollection, serverData, key]);

  // مزامنة فورية بين أكثر من مكوّن مفتوح في نفس الجهاز.
  useEffect(() => {
    const handleLocalCloudUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; data?: T }>).detail;
      if (!detail || detail.key !== key || detail.data === undefined) return;
      setData(prev => Array.isArray(prev) && Array.isArray(detail.data) && prev.length > 0 && detail.data.length === 0 ? prev : detail.data as T);
      const json = JSON.stringify(detail.data);
      parsedStorageCache.set(key, { raw: json, value: detail.data });
      window.setTimeout(() => localStorage.setItem(key, json), 0);
    };
    window.addEventListener("abu-raghwa-cloud-update", handleLocalCloudUpdate);
    return () => window.removeEventListener("abu-raghwa-cloud-update", handleLocalCloudUpdate);
  }, [key]);

  // عند أول استخدام لقسم قديم لم يُنقل بعد: لا نرفع النسخة المحلية إلا بعد
  // أن يؤكد الخادم فعلاً عدم وجود بيانات لهذا المفتاح، حتى لا نطغى على بيانات جهاز آخر.
  useEffect(() => {
    if (options?.skipInitialSeed || cloudError || serverData !== null || hasSeededEmptyCloudValue.current) return;
    const localRaw = localStorage.getItem(key);
    if (!localRaw || localRaw === "[]" || localRaw === "{}" || localRaw === "null") return;

    hasSeededEmptyCloudValue.current = true;
    saveCloudValue(saveCloud, key, localRaw);
  }, [cloudError, data, key, options?.skipInitialSeed, saveCloud, serverData]);

  // دالة التحديث المحلية والمرسلة للسحابة
  const setCloudData = useCallback((value: T | ((val: T) => T)) => {
    setData(prev => {
      const nextValue = typeof value === 'function' ? (value as (val: T) => T)(prev) : value;

      // لا نُجري JSON.stringify أو طلب الشبكة داخل حدث النقر؛ فهذا كان يجمّد الهاتف
      // عند التعامل مع قائمة منتجات كبيرة. نُبقي الحالة مرئية فورًا ونؤجل الحفظ قليلًا.
      if (pendingSaveTimer.current) clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = setTimeout(() => {
        const jsonStr = JSON.stringify(nextValue);
        parsedStorageCache.set(key, { raw: jsonStr, value: nextValue });
        localStorage.setItem(key, jsonStr);
        // لا نرفع أي تعديل قبل أن يجيب الخادم؛ هذا يمنع جهازًا جديدًا أو تحديثًا
        // من استبدال سجل سحابي موجود بقيمة محلية فارغة أثناء الإقلاع.
        if (!cloudError && serverData !== undefined && (!isLargeCollection || serverData !== null)) {
          if (isLargeCollection) void saveLargeCollection(nextValue, serverData);
          else saveCloudValue(saveCloud, key, jsonStr);
        }
        pendingSaveTimer.current = null;
      }, 350);
      window.dispatchEvent(new CustomEvent("abu-raghwa-cloud-update", { detail: { key, data: nextValue } }));
      
      return nextValue;
    });
  }, [cloudError, isLargeCollection, key, saveCloud, saveLargeCollection, serverData]);

  return [data, setCloudData, isLoading];
}
