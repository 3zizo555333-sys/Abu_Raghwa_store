const CACHE_NAME = "abu-raghwa-cloud-snapshots-v1";

type CachePayload<T> = { savedAt: number; value: T };

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
