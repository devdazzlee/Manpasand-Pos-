"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEB_CACHE_TTL = void 0;
exports.getCache = getCache;
exports.setCache = setCache;
exports.withCache = withCache;
exports.invalidateCache = invalidateCache;
exports.invalidatePattern = invalidatePattern;
const redis_1 = require("../config/redis");
const WEB_CACHE_PREFIX = 'web:';
const buildKey = (key) => `${WEB_CACHE_PREFIX}${key}`;
async function getCache(key) {
    const raw = await (0, redis_1.safeRedisOperation)((redis) => redis.get(buildKey(key)), null);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
async function setCache(key, value, ttlSeconds) {
    const payload = JSON.stringify(value);
    await (0, redis_1.safeRedisOperation)((redis) => redis.set(buildKey(key), payload, 'EX', ttlSeconds), null);
}
async function withCache(key, ttlSeconds, loader) {
    const cached = await getCache(key);
    if (cached !== null)
        return cached;
    const fresh = await loader();
    await setCache(key, fresh, ttlSeconds);
    return fresh;
}
async function invalidateCache(keys) {
    if (!keys.length)
        return;
    const prefixed = keys.map(buildKey);
    await (0, redis_1.safeRedisOperation)((redis) => redis.del(...prefixed), null);
}
async function invalidatePattern(pattern) {
    await (0, redis_1.safeRedisOperation)(async (redis) => {
        const match = buildKey(pattern);
        const stream = redis.scanStream({ match, count: 100 });
        const pipeline = redis.pipeline();
        let queued = 0;
        for await (const keys of stream) {
            for (const k of keys) {
                pipeline.del(k);
                queued++;
            }
        }
        if (queued > 0)
            await pipeline.exec();
    }, undefined);
}
exports.WEB_CACHE_TTL = {
    HOME: 300,
    CATEGORIES_LIST: 600,
    CATEGORY_DETAIL: 180,
    PRODUCT_LIST: 60,
    PRODUCT_DETAIL: 300,
    SEARCH_SUGGEST: 60,
    PRODUCT_COUNT: 600,
};
//# sourceMappingURL=webCache.js.map