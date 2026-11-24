import apiClient from "@/lib/apiClient"
import { withStore, STORES } from "./idb"
import { uuidv7 } from "./ids"
import { getDeviceId } from "./device"
import { isNetworkError, isOnline, reportServerReachable, subscribeOnline } from "./network"
import {
  enqueue,
  listOutbox,
  listPending,
  removeEntry,
  subscribeOutbox,
  updateEntry,
  type OutboxEffects,
  type OutboxEntry,
} from "./outbox"

type ResultStatus = "applied" | "duplicate" | "rejected" | "retry"
interface PushResult {
  id: string
  status: ResultStatus
  result?: any
  error?: string
}

export interface SyncState {
  online: boolean
  syncing: boolean
  pending: number
  failed: number
  lastSyncAt: number | null
  lastError: string | null
  /** The server refused our session (401/403): sync waits until the user logs in again. */
  authBlocked: boolean
}

const BATCH_SIZE = 20
/** How long the cashier waits on a live upload before the sale is kept offline instead. */
const LIVE_SUBMIT_TIMEOUT_MS = 10_000
const BASE_RETRY_MS = 5_000
const MAX_RETRY_MS = 5 * 60_000
const POLL_MS = 15_000
const PROBE_TIMEOUT_MS = 5_000

let state: SyncState = {
  online: isOnline(),
  syncing: false,
  pending: 0,
  failed: 0,
  lastSyncAt: null,
  lastError: null,
  authBlocked: false,
}
const listeners = new Set<(s: SyncState) => void>()

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener(state))
}

export function getSyncState(): SyncState {
  return state
}

export function subscribeSync(listener: (s: SyncState) => void): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

async function refreshCounts() {
  try {
    const all = await listOutbox()
    setState({
      pending: all.filter((e) => e.status === "pending").length,
      failed: all.filter((e) => e.status === "failed").length,
    })
  } catch {
    /* IndexedDB unavailable — counts stay as they were */
  }
}

/** Entries this tab is uploading right now, so a background flush doesn't send them twice. */
const inFlight = new Set<string>()

const currentToken = () => (typeof localStorage === "undefined" ? null : localStorage.getItem("token"))

/** Consecutive entries recorded by the same cashier, in their original order. */
function runsByCashier(entries: OutboxEntry[]): OutboxEntry[][] {
  const runs: OutboxEntry[][] = []
  for (const entry of entries) {
    const last = runs[runs.length - 1]
    if (last && last[0].actor?.token === entry.actor?.token) last.push(entry)
    else runs.push([entry])
  }
  return runs
}

async function send(entries: OutboxEntry[], token: string | null, timeout?: number): Promise<PushResult[]> {
  const res = await apiClient.post(
    "/sync/push",
    {
      deviceId: getDeviceId(),
      mutations: entries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        payload: entry.payload,
        createdAt: entry.createdAt,
        ...(entry.actor?.userId ? { recordedBy: { userId: entry.actor.userId, email: entry.actor.email } } : {}),
      })),
    },
    { ...(timeout ? { timeout } : {}), ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) },
  )
  reportServerReachable()
  return (res.data?.data?.results ?? []) as PushResult[]
}

/**
 * Uploads entries in order, each cashier's under their own session — so the server
 * records who really made the sale or payment, not whoever is signed in now. If that
 * session has ended (signed out online elsewhere), it goes up under the current session
 * and the server flags it for review with the original cashier's name.
 */
async function pushBatch(entries: OutboxEntry[], timeout?: number): Promise<PushResult[]> {
  entries.forEach((entry) => inFlight.add(entry.id))
  try {
    const results: PushResult[] = []
    for (const run of runsByCashier(entries)) {
      const own = run[0].actor?.token ?? currentToken()
      try {
        results.push(...(await send(run, own, timeout)))
      } catch (error) {
        const fallback = currentToken()
        if (!isAuthError(error) || !fallback || fallback === own) throw error
        results.push(...(await send(run, fallback, timeout)))
      }
    }
    return results
  } finally {
    entries.forEach((entry) => inFlight.delete(entry.id))
  }
}

/** Applies the server's verdicts to the outbox. Returns how many were confirmed. */
async function applyResults(entries: OutboxEntry[], results: PushResult[]): Promise<number> {
  const byId = new Map(results.map((r) => [r.id, r]))
  let confirmed = 0
  for (const entry of entries) {
    const result = byId.get(entry.id)
    const now = new Date().toISOString()
    if (!result) {
      await updateEntry({ ...entry, attempts: entry.attempts + 1, lastAttemptAt: now, lastError: "No result from server" })
    } else if (result.status === "applied" || result.status === "duplicate") {
      await removeEntry(entry.id)
      confirmed++
    } else if (result.status === "rejected") {
      await updateEntry({ ...entry, status: "failed", attempts: entry.attempts + 1, lastAttemptAt: now, lastError: result.error ?? "Rejected" })
    } else {
      await updateEntry({ ...entry, attempts: entry.attempts + 1, lastAttemptAt: now, lastError: result.error ?? "Server asked to retry" })
    }
  }
  return confirmed
}

function isAuthError(error: any) {
  const status = error?.response?.status
  return status === 401 || status === 403
}

/** A definite "no" for this request (4xx other than auth/rate-limit) — resending it unchanged won't help. */
function isRequestRejected(error: any) {
  const status = error?.response?.status
  return typeof status === "number" && status >= 400 && status < 500 && !isAuthError(error) && status !== 408 && status !== 429
}

function describe(error: any): string {
  return error?.response?.data?.message || error?.message || "Sync failed"
}

let retryDelay = BASE_RETRY_MS
let retryTimer: ReturnType<typeof setTimeout> | null = null
let flushing: Promise<void> | null = null

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => {
    retryTimer = null
    void flush()
  }, retryDelay)
  retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS)
}

/** Uploads every pending outbox entry, oldest first. Safe to call any time; concurrent calls share one run. */
export function flush(): Promise<void> {
  if (flushing) return flushing
  const run = async () => {
    const pending = (await listPending()).filter((entry) => !inFlight.has(entry.id))
    if (pending.length === 0) {
      await refreshCounts()
      return
    }
    setState({ syncing: true })
    try {
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE)
        try {
          await applyResults(batch, await pushBatch(batch))
        } catch (error: any) {
          if (!isRequestRejected(error)) throw error
          // The server refused the batch itself (one malformed entry). Send them one by
          // one so a single bad entry is parked as failed instead of blocking the queue.
          for (const entry of batch) {
            try {
              await applyResults([entry], await pushBatch([entry]))
            } catch (single: any) {
              if (!isRequestRejected(single)) throw single
              await updateEntry({ ...entry, status: "failed", attempts: entry.attempts + 1, lastAttemptAt: new Date().toISOString(), lastError: describe(single) })
            }
          }
        }
      }
      retryDelay = BASE_RETRY_MS
      setState({ lastSyncAt: Date.now(), lastError: null, authBlocked: false })
      if ((await listPending()).length > 0) scheduleRetry() // some asked to retry
    } catch (error: any) {
      if (isAuthError(error)) {
        setState({ authBlocked: true, lastError: "Log in again to finish syncing" })
      } else {
        setState({ lastError: isNetworkError(error) ? "Offline — will sync when the connection is back" : describe(error) })
        scheduleRetry()
      }
    } finally {
      setState({ syncing: false })
      await refreshCounts()
    }
  }
  // One uploader across tabs when the browser supports Web Locks; the server is idempotent either way.
  const locks = typeof navigator !== "undefined" ? (navigator as any).locks : undefined
  flushing = (locks ? locks.request("manpasand-pos-sync", run) : run()).finally(() => {
    flushing = null
  })
  return flushing as Promise<void>
}

/** Rewrites a queued entry as an offline sale under a fresh idempotency key, in one transaction. */
async function markRecordedOffline(entry: OutboxEntry): Promise<void> {
  const offline: OutboxEntry = {
    ...entry,
    id: uuidv7(),
    payload: { ...entry.payload, recordedOffline: true },
  }
  await withStore(STORES.outbox, "readwrite", (store) => {
    store.delete(entry.id)
    return store.put(offline)
  })
  await refreshCounts()
}

export type SubmitOutcome<T> = { status: "synced"; data: T } | { status: "queued"; entryId: string }

export class SyncRejectedError extends Error {}

/**
 * Records a change durably on this till first, then tries to upload it straight away.
 * - synced:  the server recorded it (data is the server's result)
 * - queued:  no connection — it is safe in the outbox and syncs automatically later
 * - throws SyncRejectedError when the server refuses it while online (e.g. stock
 *   check failed); nothing was recorded, so the cashier can fix the cart and retry.
 */
export async function submitMutation<T = any>(
  type: string,
  payload: Record<string, unknown>,
  extras: { summary?: Record<string, unknown>; effects?: OutboxEffects } = {},
): Promise<SubmitOutcome<T>> {
  const startedOffline = !isOnline()
  let entry: OutboxEntry
  try {
    entry = await enqueue(type, startedOffline ? { ...payload, recordedOffline: true } : payload, extras)
  } catch (storageError) {
    // No local database (private window, storage blocked): behave like a plain online
    // request rather than lose the sale — the clientId still makes a resend safe.
    console.warn("[offline] Outbox unavailable, sending directly:", storageError)
    const [result] = await pushBatch([
      { id: uuidv7(), type, payload, status: "pending", createdAt: new Date().toISOString(), attempts: 0 },
    ])
    if (result?.status === "applied" || result?.status === "duplicate") return { status: "synced", data: result.result as T }
    throw new SyncRejectedError(result?.error || "The server could not record this sale")
  }
  await refreshCounts()

  if (startedOffline) return { status: "queued", entryId: entry.id }

  try {
    // Anything older still waiting goes first, in order: this entry may depend on it
    // (a credit sale to a customer who was added while offline).
    const older = (await listPending()).filter((e) => e.id !== entry.id && !inFlight.has(e.id))
    if (older.length >= BATCH_SIZE) {
      // A big backlog from an offline spell: keep order by letting the flush send it all.
      void flush()
      return { status: "queued", entryId: entry.id }
    }
    const results = await pushBatch([...older, entry], LIVE_SUBMIT_TIMEOUT_MS)
    if (older.length) await applyResults(older, results)
    const result = results.find((r) => r.id === entry.id)
    if (result?.status === "applied" || result?.status === "duplicate") {
      await removeEntry(entry.id)
      await refreshCounts()
      return { status: "synced", data: result.result as T }
    }
    if (result?.status === "rejected") {
      await removeEntry(entry.id)
      await refreshCounts()
      throw new SyncRejectedError(result.error || "The server rejected this change")
    }
    // "retry" or missing: the server had a transient problem — keep it and sync later.
    await markRecordedOffline(entry)
    scheduleRetry()
    return { status: "queued", entryId: entry.id }
  } catch (error: any) {
    if (error instanceof SyncRejectedError) throw error
    if (isRequestRejected(error) && (await listPending()).length > 1) {
      // The batch carried older entries too; the flush finds out which one is bad.
      void flush()
      return { status: "queued", entryId: entry.id }
    }
    if (isRequestRejected(error)) {
      await removeEntry(entry.id)
      await refreshCounts()
      throw new SyncRejectedError(describe(error))
    }
    if (isAuthError(error)) {
      setState({ authBlocked: true, lastError: "Log in again to finish syncing" })
    }
    // Network failure or server error: the request may or may not have landed. Either
    // way the sale's clientId keeps the eventual upload from recording it twice.
    await markRecordedOffline(entry)
    scheduleRetry()
    return { status: "queued", entryId: entry.id }
  }
}

let started = false

/** Starts background syncing for this tab. Idempotent. */
export function startSyncEngine() {
  if (started || typeof window === "undefined") return
  started = true

  subscribeOnline((online) => {
    setState({ online })
    if (online) {
      retryDelay = BASE_RETRY_MS
      void flush()
    }
  })
  subscribeOutbox(() => void refreshCounts())
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flush()
  })
  setInterval(() => {
    if (!isOnline()) {
      // Reads are being served locally, so nothing else would notice the server is back.
      void apiClient.get("/sync/ping", { timeout: PROBE_TIMEOUT_MS }).catch(() => {})
    } else if (state.pending > 0 && !retryTimer) {
      void flush()
    }
  }, POLL_MS)

  void refreshCounts().then(() => flush())
}
