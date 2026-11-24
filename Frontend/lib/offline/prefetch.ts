/**
 * Downloads, while online, the GETs New Sale / holds / customers need offline.
 */
import apiClient from "@/lib/apiClient"
import { normalizeBranchId } from "@/lib/branch-utils"
import { cachedAt, normalizedRequestKey, scopedKey } from "./http-cache"
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

function screenRequests(): PrefetchRequest[] {
  const branchId = normalizeBranchId(localStorage.getItem("branch"))
  const branch = branchId ? { branchId } : {}
  return [
    { url: "/products/pos-catalog" },
    { url: "/categories" },
    { url: "/customer", params: { page: 1, limit: 100 } },
    { url: "/customer", params: { page: 1, limit: 500 } },
    { url: "/sale/hold", params: branch },
    { url: "/sale/recent", params: { limit: 20, ...branch } },
    { url: "/stock", params: { limit: 5000, page: 1, ...branch } },
    { url: "/branches", params: { page: 1, limit: 100, is_active: true } },
  ]
}

async function runOne(req: PrefetchRequest) {
  const key = scopedKey(normalizedRequestKey(req.url, req.params ?? {}))
  const saved = await cachedAt(key).catch(() => null)
  if (saved && Date.now() - saved < FRESH_MS) return
  await apiClient.get(req.url, { params: req.params })
}

export async function prefetchForOffline() {
  if (!isOnline() || state.running) return
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null
  if (!token) return

  const requests = screenRequests()
  setState({ running: true, done: 0, total: requests.length, failed: 0 })
  let failed = 0
  let done = 0
  const queue = [...requests]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const req = queue.shift()!
      try {
        await runOne(req)
      } catch {
        failed += 1
      } finally {
        done += 1
        setState({ done, failed })
      }
    }
  })
  await Promise.all(workers)
  localStorage.setItem(LAST_RUN_KEY, String(Date.now()))
  setState({ running: false, lastCompletedAt: Date.now() })
}

let started = false
export function startOfflinePrefetch() {
  if (started || typeof window === "undefined") return
  started = true
  const kick = () => {
    const last = Number(localStorage.getItem(LAST_RUN_KEY) || 0)
    if (!last || Date.now() - last > REFRESH_EVERY_MS) void prefetchForOffline()
  }
  kick()
  subscribeOnline((online) => {
    if (online) kick()
  })
  setInterval(kick, REFRESH_EVERY_MS)
}
