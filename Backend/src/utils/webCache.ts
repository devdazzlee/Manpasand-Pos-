import { safeRedisOperation } from '../config/redis';

const WEB_CACHE_PREFIX = 'web:';

const buildKey = (key: string) => `${WEB_CACHE_PREFIX}${key}`;

export async function getCache<T>(key: string): Promise<T | null> {
  const raw = await safeRedisOperation<string | null>(
    (redis) => redis.get(buildKey(key)),
    null
  );
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const payload = JSON.stringify(value);
  await safeRedisOperation<'OK' | null>(
    (redis) => redis.set(buildKey(key), payload, 'EX', ttlSeconds),
    null
  );
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = await getCache<T>(key);
  if (cached !== null) return cached;
  const fresh = await loader();
  await setCache(key, fresh, ttlSeconds);
  return fresh;
}

export async function invalidateCache(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const prefixed = keys.map(buildKey);
  await safeRedisOperation<number | null>(
    (redis) => redis.del(...prefixed),
    null
  );
}

export async function invalidatePattern(pattern: string): Promise<void> {
  await safeRedisOperation<void>(
    async (redis) => {
      const match = buildKey(pattern);
      const stream = redis.scanStream({ match, count: 100 });
      const pipeline = redis.pipeline();
      let queued = 0;
      for await (const keys of stream) {
        for (const k of keys as string[]) {
          pipeline.del(k);
          queued++;
        }
      }
      if (queued > 0) await pipeline.exec();
    },
    undefined
  );
}

export const WEB_CACHE_TTL = {
  HOME: 300,
  CATEGORIES_LIST: 600,
  CATEGORY_DETAIL: 180,
  PRODUCT_LIST: 60,
  PRODUCT_DETAIL: 300,
  SEARCH_SUGGEST: 60,
  PRODUCT_COUNT: 600,
} as const;
