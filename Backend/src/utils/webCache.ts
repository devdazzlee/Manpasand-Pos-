// In-memory TTL cache for public website API responses.
// Redis was removed from the project; this lightweight layer prevents every
// page view from hammering Postgres with identical heavy queries.

type CacheEntry = { value: unknown; expiresAt: number };

const store = new Map<string, CacheEntry>();
const MAX_ENTRIES = 500;

function pruneIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
    if (store.size <= MAX_ENTRIES * 0.8) break;
  }
  if (store.size > MAX_ENTRIES) {
    const oldest = [...store.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < oldest.length - MAX_ENTRIES * 0.8; i++) {
      store.delete(oldest[i][0]);
    }
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export async function setCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  if (ttlSeconds <= 0) return;
  pruneIfNeeded();
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  if (ttlSeconds > 0) {
    const cached = await getCache<T>(key);
    if (cached !== null) return cached;
  }

  const value = await loader();
  await setCache(key, value, ttlSeconds);
  return value;
}

export async function invalidateCache(keys: string[]): Promise<void> {
  for (const key of keys) store.delete(key);
}

export async function invalidatePattern(pattern: string): Promise<void> {
  const prefix = pattern.replace(/\*$/, '');
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export const WEB_CACHE_TTL = {
  HOME: 5 * 60,
  CATEGORIES_LIST: 10 * 60,
  CATEGORY_DETAIL: 5 * 60,
  PRODUCT_LIST: 3 * 60,
  PRODUCT_DETAIL: 5 * 60,
  SEARCH_SUGGEST: 2 * 60,
  PRODUCT_COUNT: 10 * 60,
} as const;
