/**
 * Downloads, while online, everything the screens read — Sarwat-style crawl —
 * so a screen works offline even if nobody opened it on this till before.
 * Progress (e.g. 121/397) counts API requests, not products; one of those
 * requests (`/products/pos-catalog`) carries the full sellable catalog.
 */
import { endOfDay, endOfMonth, format, startOfDay, startOfMonth, subDays } from "date-fns"
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

const isAdmin = (role: string | null) => role === "ADMIN" || role === "SUPER_ADMIN"

/** What each screen loads first, for this user (mirrors the screens' own defaults). */
function screenRequests(): PrefetchRequest[] {
  const role = localStorage.getItem("role")
  const admin = isAdmin(role)
  const branchId = normalizeBranchId(localStorage.getItem("branch"))
  const branch = branchId ? { branchId } : {}
  const catalogParams = { ...getBranchScopeParam() }
  const start = startOfDay(new Date())
  const end = endOfDay(new Date())
  const today = { startDate: start.toISOString(), endDate: end.toISOString() }
  const todaySales = { dateField: "created_at", endExclusive: "true", ...today }

  const everyone: PrefetchRequest[] = [
    // New Sale — full catalog in one response (this is where all products live)
    { url: "/products/pos-catalog", params: catalogParams },
    { url: "/categories" },
    { url: "/customer", params: { page: 1, limit: 100 } },
    { url: "/customer", params: { page: 1, limit: 500 } },
    { url: "/sale/recent", params: { limit: 20, ...branch } },
    { url: "/sale/hold", params: branch },
    { url: "/dashboard/stats", params: admin ? {} : branch },
    // Today revenue / sales lists
    { url: "/sale", params: { ...todaySales, ...(admin ? {} : branch) } },
    { url: "/sale", params: { ...branch, limit: 25, page: 1 } },
    { url: "/sale", params: {} },
    // Branch stock for checkout (Manpasand has no /sale/stock)
    { url: "/stock", params: { limit: 5000, page: 1, ...branch } },
    { url: "/barcode-generator/printers" },
    { url: "/branches", params: { page: 1, limit: 100, is_active: true } },
    ...(branchId ? [{ url: `/branches/${branchId}` }] : []),
  ]

  if (!admin) {
    return role === "BRANCH_MANAGER" ? [...everyone, { url: "/sync/reviews", params: {} }] : everyone
  }

  return [
    ...everyone,
    { url: "/products", params: { fetch_all: true } },
    { url: "/products", params: { fetch_all: true, is_active: true } },
    { url: "/products/best-selling" },
    { url: "/expenses", params: { page: 1, limit: 20, ...today } },
    { url: "/expenses", params: { page: 1, limit: 20 } },
    { url: "/products", params: { fetch_all: false, limit: 10, page: 1 } },
    ...["/brands", "/colors", "/sizes", "/subcategories", "/suppliers", "/taxes", "/units"].map((url) => ({ url })),
    { url: "/branches", params: { fetch_all: true } },
    { url: "/branches", params: { is_active: true, fetch_all: true } },
    { url: "/stock", params: { limit: 20, page: 1 } },
    { url: "/stock", params: { limit: 1000 } },
    { url: "/purchases", params: { limit: 50, page: 1 } },
    { url: "/suppliers", params: { is_active: true } },
    { url: "/stock-out", params: { limit: 50, page: 1 } },
    { url: "/stock-adjustments", params: { limit: 100, page: 1 } },
    { url: "/categories", params: { fetch_all: true } },
    ...["/subcategories", "/units", "/brands", "/colors", "/sizes"].map((url) => ({ url, params: { search: "" } })),
    { url: "/employee", params: { limit: 500, page: 1 } },
    { url: "/salaries" },
    ...[
      [new Date(), new Date()],
      [subDays(new Date(), 6), new Date()],
      [subDays(new Date(), 29), new Date()],
      [startOfMonth(new Date()), endOfMonth(new Date())],
    ].map(([from, to]) => ({
      url: "/reports",
      params: {
        fetch_all: true,
        limit: 10,
        startDate: format(from, "yyyy-MM-dd"),
        endDate: format(to, "yyyy-MM-dd"),
      },
    })),
    { url: "/sync/reviews", params: {} },
  ]
}

/**
 * Per-record screens — this is what makes Sarwat show 100+/300+ in the pill:
 * every customer detail/ledger, every supplier, products per category.
 */
async function recordRequests(): Promise<PrefetchRequest[]> {
  const admin = isAdmin(localStorage.getItem("role"))
  const list = async (url: string, params?: Record<string, unknown>) => {
    try {
      const res = await apiClient.get(url, { params })
      const rows = (
        Array.isArray(res.data?.data) ? res.data.data : res.data?.data?.suppliers ?? []
      ) as Array<{ id: string; pending_sync?: boolean }>
      return rows.filter((row) => row?.id && !row.pending_sync)
    } catch {
      return []
    }
  }

  const out: PrefetchRequest[] = []
  // Prefer the larger customer page so we cover the till's picker offline.
  const customers = await list("/customer", { page: 1, limit: 500 })
  for (const c of customers) {
    out.push(
      { url: `/customer/${c.id}` },
      { url: `/customer/${c.id}/ledger` },
      { url: `/customer/${c.id}/statement` },
      { url: `/customer/${c.id}/activity`, params: { limit: 50 } },
    )
  }

  if (admin) {
    for (const s of await list("/suppliers", { is_active: true })) {
      out.push({ url: `/suppliers/${s.id}` })
    }
    for (const cat of await list("/categories", { fetch_all: true })) {
      out.push({ url: "/products", params: { category_id: cat.id, fetch_all: true } })
    }
  }
  return out
}

let running: Promise<void> | null = null

/**
 * Brings the till's offline copy up to date. `force` re-downloads everything (login);
 * otherwise only copies older than FRESH_MS are refreshed.
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
    const failedKeys: string[] = []
    try {
      const requests = [...screenRequests(), ...(await recordRequests())]
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
            if (error?.response?.status !== 403) {
              failed += 1
              failedKeys.push(normalizedRequestKey(r.url, r.params ?? {}))
            }
          }
          done += 1
          setState({ done, failed })
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
      await whenSaved()
      if (failedKeys.length) console.warn("[offline] Could not download:", failedKeys)
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
