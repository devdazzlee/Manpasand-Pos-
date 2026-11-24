/**
 * Downloads, while online, the GETs New Sale / holds / customers need offline.
 * Phase 1 — POS till only (not Sarwat’s full admin screen crawl).
 */
import apiClient from "@/lib/apiClient"
import { normalizeBranchId } from "@/lib/branch-utils"
import { getBranchScopeParam } from "@/lib/session"
import { cachedAt, normalizedRequestKey, scopedKey, whenSaved } from "./http-cache"
import { isOnline, subscribeOnline } from "./network"

interface PrefetchRequest {
  url: string
  params?: Record<string, unknown>
}

export interface PrefetchState {
  running: boolean
  done: number
  total: number
  failed: number
  lastCompletedAt: number | null
}

let state: PrefetchState = { running: false, done: 0, total: 0, failed: 0, lastCompletedAt: null }
const listeners = new Set<(s: PrefetchState) => void>()
const setState = (patch: Partial<PrefetchState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l(state))
}
export const getPrefetchState = () => state
export function subscribePrefetch(listener: (s: PrefetchState) => void): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

const LAST_RUN_KEY = "pos_offline_prefetch_at"
const FRESH_MS = 25 * 60_000
const REFRESH_EVERY_MS = 30 * 60_000
const CONCURRENCY = 4

/** Same GETs New Sale / holds / customers use, so http_cache keys match the screens. */
function screenRequests(): PrefetchRequest[] {
  const branchId = normalizeBranchId(localStorage.getItem("branch"))
  const branch = branchId ? { branchId } : {}
  // Must match fetchAllPosProducts() — otherwise the till caches a key the sale screen never reads.
  const catalogParams = { ...getBranchScopeParam() }
  return [
    { url: "/products/pos-catalog", params: catalogParams },
    { url: "/categories" },
    { url: "/customer", params: { page: 1, limit: 100 } },
    { url: "/customer", params: { page: 1, limit: 500 } },
    { url: "/sale/hold", params: branch },
    { url: "/sale/recent", params: { limit: 20, ...branch } },
    { url: "/stock", params: { limit: 5000, page: 1, ...branch } },
    { url: "/branches", params: { page: 1, limit: 100, is_active: true } },
  ]
}

let running: Promise<void> | null = null

/**
 * Brings the till’s offline POS copy up to date.
 * `force` re-downloads everything (Update now / first login).
 */
export function prefetchForOffline({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (running) return running
  if (typeof window === "undefined" || !localStorage.getItem("token") || !isOnline()) {
    return Promise.resolve()
  }

  running = (async () => {
    setState({ running: true, done: 0, total: 0, failed: 0 })
    let failed = 0
    let done = 0
    try {
      const requests = screenRequests()
      const seen = new Set<string>()
      const todo: PrefetchRequest[] = []
      for (const r of requests) {
        const key = normalizedRequestKey(r.url, r.params ?? {})
        if (seen.has(key)) continue
        seen.add(key)
        if (!force) {
          const at = await cachedAt(scopedKey(key)).catch(() => null)
          if (at && Date.now() - at < FRESH_MS) continue
        }
        todo.push(r)
      }
      setState({ total: todo.length })

      let next = 0
      const worker = async () => {
        while (next < todo.length) {
          if (!isOnline()) return
          const r = todo[next++]
          try {
            await apiClient.get(r.url, { params: r.params })
          } catch (error: any) {
            if (error?.response?.status !== 403) failed += 1
          }
          done += 1
          setState({ done, failed })
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
      await whenSaved()
      if (isOnline()) {
        localStorage.setItem(LAST_RUN_KEY, String(Date.now()))
        setState({ lastCompletedAt: Date.now() })
      }
    } finally {
      setState({ running: false })
      running = null
    }
  })()
  return running
}

let started = false

/** Download at login, then keep the copy fresh while online. Idempotent. */
export function startOfflinePrefetch({ justLoggedIn = false }: { justLoggedIn?: boolean } = {}) {
  if (typeof window === "undefined") return
  const last = Number(localStorage.getItem(LAST_RUN_KEY) || 0)
  if (last) setState({ lastCompletedAt: last })
  void prefetchForOffline({ force: justLoggedIn || !last })
  if (started) return
  started = true
  setInterval(() => void prefetchForOffline(), REFRESH_EVERY_MS)
  subscribeOnline((online) => {
    if (online) void prefetchForOffline()
  })
}

/** A new login on this till: the next download is a full one. */
export function markLoginForPrefetch() {
  localStorage.removeItem(LAST_RUN_KEY)
}
