import { idbDelete, idbGet, idbGetAll, idbPut, STORES, withStore } from "./idb"
import { uuidv7 } from "./ids"

/**
 * pending: waiting to be sent
 * failed:  the server rejected it — kept (never silently dropped) for a manager to review
 */
export type OutboxStatus = "pending" | "failed"

export interface OutboxEntry<P = Record<string, unknown>> {
  /** Idempotency key for /sync/push — the server applies an id at most once. */
  id: string
  type: string
  payload: P
  status: OutboxStatus
  createdAt: string
  attempts: number
  lastAttemptAt?: string
  lastError?: string
  /** Display-only details (invoice number, total, customer) for the sync status panel. */
  summary?: Record<string, unknown>
  /** Local effects not yet reflected in server data (stock and balance deltas). */
  effects?: OutboxEffects
  /**
   * The cashier signed in when this was recorded. It is uploaded under their session, so
   * the server credits them (and checks their permissions) even if someone else is signed
   * in by the time the till reconnects.
   */
  actor?: { token: string; userId?: string; email?: string }
}

function currentActor(): OutboxEntry["actor"] {
  if (typeof localStorage === "undefined") return undefined
  const token = localStorage.getItem("token")
  if (!token) return undefined
  return {
    token,
    userId: localStorage.getItem("userId") ?? undefined,
    email: localStorage.getItem("email") || localStorage.getItem("userEmail") || undefined,
  }
}

export interface OutboxEffects {
  /** productId -> quantity taken out of stock */
  stock?: Record<string, number>
  /** customerId -> change in what the customer owes */
  customerBalance?: Record<string, number>
}

type Listener = () => void
const listeners = new Set<Listener>()

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let channel: BroadcastChannel | null = null
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  channel = new BroadcastChannel("manpasand-pos-outbox")
  channel.onmessage = () => listeners.forEach((listener) => listener())
}

function notify() {
  listeners.forEach((listener) => listener())
  channel?.postMessage("changed") // other open tabs refresh their badges too
}

export async function enqueue<P extends Record<string, unknown>>(
  type: string,
  payload: P,
  extras: Pick<OutboxEntry<P>, "summary" | "effects"> = {},
): Promise<OutboxEntry<P>> {
  const entry: OutboxEntry<P> = {
    id: uuidv7(),
    type,
    payload,
    status: "pending",
    createdAt: new Date().toISOString(),
    attempts: 0,
    actor: currentActor(),
    ...extras,
  }
  // Resolves only after the write is durable — the sale is safe from a tab crash from here on.
  await idbPut(STORES.outbox, entry)
  notify()
  return entry
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const all = await idbGetAll<OutboxEntry>(STORES.outbox)
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export async function listPending(): Promise<OutboxEntry[]> {
  return (await listOutbox()).filter((entry) => entry.status === "pending")
}

export async function getEntry(id: string): Promise<OutboxEntry | undefined> {
  return idbGet<OutboxEntry>(STORES.outbox, id)
}

export async function updateEntry(entry: OutboxEntry): Promise<void> {
  await idbPut(STORES.outbox, entry)
  notify()
}

/** Only called once the server has confirmed the entry (applied or duplicate), or a manager discards it. */
export async function removeEntry(id: string): Promise<void> {
  await idbDelete(STORES.outbox, id)
  notify()
}

/**
 * Sends a rejected entry again under a fresh idempotency key (the old key's rejection
 * is final on the server). The payload — including the sale's own clientId — is kept,
 * so it still cannot be recorded twice.
 */
export async function requeueFailed(id: string): Promise<void> {
  const entry = await getEntry(id)
  if (!entry || entry.status !== "failed") return
  const retried: OutboxEntry = { ...entry, id: uuidv7(), status: "pending", attempts: 0, lastError: undefined }
  // One transaction: the entry is never missing between the delete and the re-add.
  await withStore(STORES.outbox, "readwrite", (store) => {
    store.delete(id)
    return store.put(retried)
  })
  notify()
}

/**
 * Sums the local effects of everything still waiting to upload. A change the server
 * refused (kept as "failed" for review) never happened there, so it no longer counts:
 * a refused sale must not keep showing its goods as gone from the shelf.
 */
export async function pendingEffects(): Promise<Required<OutboxEffects>> {
  const totals: Required<OutboxEffects> = { stock: {}, customerBalance: {} }
  let entries: OutboxEntry[] = []
  try {
    entries = await listPending()
  } catch {
    return totals
  }
  for (const entry of entries) {
    for (const [productId, qty] of Object.entries(entry.effects?.stock ?? {})) {
      totals.stock[productId] = (totals.stock[productId] ?? 0) + qty
    }
    for (const [customerId, delta] of Object.entries(entry.effects?.customerBalance ?? {})) {
      totals.customerBalance[customerId] = (totals.customerBalance[customerId] ?? 0) + delta
    }
  }
  return totals
}
