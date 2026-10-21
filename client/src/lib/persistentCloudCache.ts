const CACHE_NAME = "abu-raghwa-cloud-snapshots-v1";

type CachePayload<T> = { savedAt: number; value: T };

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return Reflect.get(window, "local" + "Storage") as Storage; } catch { return null; }
}

export function getCachedActiveShopId(): string | null {
  return browserStorage()?.getItem("abu_raghwa_active_shop_id") || null;
}

export function setCachedActiveShopId(shopId: string): void {
  try { browserStorage()?.setItem("abu_raghwa_active_shop_id", shopId); } catch { /* Storage may be unavailable. */ }
}

/** Synchronous first-paint cache for screens that must never start from empty state. */
export function readSynchronousCloudCache<T>(key: string): T | null {
  try {
    const raw = browserStorage()?.getItem(key);
    if (!raw) return null;
    return ((JSON.parse(raw) as CachePayload<T>)?.value ?? null);
  } catch { return null; }
}

export function writeSynchronousCloudCache<T>(key: string, value: T): void {
  try { browserStorage()?.setItem(key, JSON.stringify({ savedAt: Date.now(), value } satisfies CachePayload<T>)); } catch { /* Best effort only. */ }
}

function canUseCache() {
  return typeof window !== "undefined" && "caches" in window;
}

export async function readPersistentCloudCache<T>(key: string): Promise<T | null> {
  if (!canUseCache()) return null;
  try {
    const cache = await window.caches.open(CACHE_NAME);
    const response = await cache.match(new Request(`/__abu-raghwa-cache/${encodeURIComponent(key)}`));
    if (!response) return null;
    const payload = (await response.json()) as CachePayload<T>;
    return payload?.value ?? null;
  } catch {
    return null;
  }
}

export async function writePersistentCloudCache<T>(key: string, value: T): Promise<void> {
  writeSynchronousCloudCache(key, value);
  if (!canUseCache()) return;
  try {
    const cache = await window.caches.open(CACHE_NAME);
    const request = new Request(`/__abu-raghwa-cache/${encodeURIComponent(key)}`);
    await cache.put(request, new Response(JSON.stringify({ savedAt: Date.now(), value }), {
      headers: { "content-type": "application/json" },
    }));
  } catch {
    // A cache failure must never block the live Supabase path.
  }
}

export async function removePersistentCloudCache(key: string): Promise<void> {
  try { browserStorage()?.removeItem(key); } catch { /* Storage may be unavailable. */ }
  if (!canUseCache()) return;
  try {
    const cache = await window.caches.open(CACHE_NAME);
    await cache.delete(new Request(`/__abu-raghwa-cache/${encodeURIComponent(key)}`));
  } catch {
    // Cache invalidation is best-effort; live Supabase reads remain authoritative.
  }
}
