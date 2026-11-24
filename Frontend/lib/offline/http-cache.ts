import type { AxiosResponse, InternalAxiosRequestConfig } from "axios"
import { API_BASE } from "@/config/constants"
import { idbGet, idbPut, STORES, withStore } from "./idb"

interface CachedResponse {
  key: string
  data: unknown
  status: number
  savedAt: number
}

/** Params that only bust caches and must not split the cache key. */
const IGNORED_PARAMS = new Set(["_t"])

/**
 * One name per request, however a screen spelled it: `/branches` with
 * `{ fetch_all: true }`, `/branches?fetch_all=true` and the absolute
 * `${API_BASE}/branches?fetch_all=true` all map to `/branches?fetch_all=true`.
 * That is what lets the offline download fill in a screen's copy in advance.
 */
export function normalizedRequestKey(url: string, params: Record<string, unknown> = {}, baseURL = API_BASE): string {
  let path = url
  if (baseURL && path.startsWith(baseURL)) path = path.slice(baseURL.length)
  const [rawPath, rawQuery] = path.split("?")
  const merged: Record<string, unknown> = {}
  if (rawQuery) new URLSearchParams(rawQuery).forEach((value, key) => (merged[key] = value))
  Object.assign(merged, params)
  const query = Object.entries(merged)
    .filter(([key, value]) => !IGNORED_PARAMS.has(key) && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join("&")
  const cleanPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`
  return `${cleanPath}?${query}`
}

/**
 * Each signed-in user has their own offline copy: what an admin may read (reports,
 * costs) must not be served to a cashier who signs in on the same till offline.
 */
function userScope(): string {
  if (typeof localStorage === "undefined") return "anon"
  return (localStorage.getItem("email") || "anon").trim().toLowerCase()
}

export const scopedKey = (key: string, scope = userScope()) => `${scope}|${key}`

export function cacheKeyFor(config: InternalAxiosRequestConfig): string | null {
  if ((config.method ?? "get").toLowerCase() !== "get") return null
  if (config.responseType && config.responseType !== "json") return null // PDFs, images
  const key = normalizedRequestKey(config.url ?? "", (config.params ?? {}) as Record<string, unknown>, config.baseURL ?? API_BASE)
  // Uploads, connectivity probes and auth must always hit the server. (The Sync Review
  // list is an ordinary screen and is kept like the others.)
  if (/^\/auth(\/|\?)/.test(key) || (/^\/sync(\/|\?)/.test(key) && !key.startsWith("/sync/reviews?"))) return null
  return scopedKey(key)
}

/** When a request was last stored on this till (ms), or null. */
export async function cachedAt(key: string): Promise<number | null> {
  try {
    return (await idbGet<CachedResponse>(STORES.httpCache, key))?.savedAt ?? null
  } catch {
    return null
  }
}

/** Saves still being written — the offline download waits for them before it reports done. */
const pendingSaves = new Set<Promise<void>>()

export async function whenSaved(): Promise<void> {
  while (pendingSaves.size) await Promise.all([...pendingSaves])
}

export function saveResponse(key: string, response: AxiosResponse): Promise<void> {
  const save = writeResponse(key, response).finally(() => pendingSaves.delete(save))
  pendingSaves.add(save)
  return save
}

/** Users signed out online on this till: a late answer to one of their requests is dropped. */
const forgottenScopes = new Set<string>()

async function writeResponse(key: string, response: AxiosResponse): Promise<void> {
  const scope = key.split("|")[0]
  if (forgottenScopes.has(scope)) {
    // Signed back in since: their copy is wanted again.
    if (scope === userScope()) forgottenScopes.delete(scope)
    else return
  }
  try {
    await idbPut<CachedResponse>(STORES.httpCache, {
      key,
      data: response.data,
      status: response.status,
      savedAt: Date.now(),
    })
  } catch (error) {
    // Quota or private mode — the live response still reaches the screen.
    console.warn("[offline] Could not cache response for", key, error)
  }
}

export async function readCachedResponse(
  key: string,
  config: InternalAxiosRequestConfig,
): Promise<AxiosResponse | null> {
  try {
    const cached = await idbGet<CachedResponse>(STORES.httpCache, key)
    if (!cached) return null
    return {
      data: cached.data,
      status: cached.status,
      statusText: "OK (offline cache)",
      headers: { "x-offline-cache": "1", "x-offline-cached-at": String(cached.savedAt) },
      config,
    } as AxiosResponse
  } catch {
    return null
  }
}

export function isFromOfflineCache(response: AxiosResponse | undefined): boolean {
  return Boolean(response?.headers?.["x-offline-cache"])
}

/** Drops one user's offline copy (they signed out online on this till). */
export async function forgetUserCache(email: string): Promise<void> {
  forgottenScopes.add(email.trim().toLowerCase())
  // A save already under way when they signed out would land after the delete below.
  await whenSaved()
  const prefix = scopedKey("", email.trim().toLowerCase())
  try {
    await withStore(STORES.httpCache, "readwrite", (store) => {
      store.delete(IDBKeyRange.bound(prefix, prefix + "\uffff"))
    })
  } catch {
    /* nothing cached */
  }
}

export async function clearHttpCache(): Promise<void> {
  try {
    await withStore(STORES.httpCache, "readwrite", (store) => store.clear())
  } catch {
    /* nothing cached */
  }
}
