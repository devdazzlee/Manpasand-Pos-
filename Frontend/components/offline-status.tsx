"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { flush, startSyncEngine, subscribeSync, type SyncState } from "@/lib/offline/sync-engine"
import { listOutbox, removeEntry, requeueFailed, subscribeOutbox, type OutboxEntry } from "@/lib/offline/outbox"
import { startOfflinePrefetch, subscribePrefetch, prefetchForOffline, type PrefetchState } from "@/lib/offline/prefetch"

function describeEntry(entry: OutboxEntry) {
  return String(entry.summary?.label ?? entry.summary?.saleNumber ?? entry.type)
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
}

/** Connection + sync indicator: what is waiting on this till and what needs a manager's attention. */
export function OfflineStatus() {
  const [sync, setSync] = useState<SyncState | null>(null)
  const [entries, setEntries] = useState<OutboxEntry[]>([])
  const [open, setOpen] = useState(false)

  const [prefetch, setPrefetch] = useState<PrefetchState | null>(null)

  useEffect(() => {
    startSyncEngine() // also covers a login after the page loaded
    // Download every screen's data so the whole POS works offline, then keep it fresh.
    startOfflinePrefetch()
    const offPrefetch = subscribePrefetch(setPrefetch)
    const offSync = subscribeSync(setSync)
    return () => {
      offPrefetch()
      offSync()
    }
  }, [])

  const loadEntries = useCallback(() => {
    listOutbox().then(setEntries).catch(() => setEntries([]))
  }, [])

  useEffect(() => {
    if (!open) return
    loadEntries()
    return subscribeOutbox(loadEntries)
  }, [open, loadEntries])

  if (!sync) return null

  const { online, syncing, pending, failed, authBlocked, lastError, lastSyncAt } = sync

  const tone = failed > 0 || authBlocked
    ? "border-red-300 bg-red-50 text-red-700"
    : !online
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : pending > 0
        ? "border-blue-300 bg-blue-50 text-blue-700"
        : "border-green-200 bg-white text-green-700"

  const label = !online
    ? `Offline${pending ? ` · ${pending} waiting` : ""}`
    : syncing
      ? `Syncing ${pending}…`
      : pending
        ? `${pending} waiting to sync`
        : prefetch?.running && !prefetch.lastCompletedAt
          ? `Preparing offline ${prefetch.done}/${prefetch.total || "…"}`
          : "Online"

  const discard = async (entry: OutboxEntry) => {
    const name = describeEntry(entry)
    if (!window.confirm(`Discard ${name}? It will NOT be recorded on the server. Only do this if it was entered again another way.`)) return
    await removeEntry(entry.id)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Sync status"
          className={cn(
            "fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-md lg:left-[19rem]",
            tone,
          )}
        >
          {failed > 0 || authBlocked ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : !online ? (
            <CloudOff className="h-3.5 w-3.5" />
          ) : syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : pending ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          {label}
          {failed > 0 && <span className="rounded-full bg-red-600 px-1.5 text-white">{failed} failed</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="border-b p-3">
          <div className="text-sm font-semibold">{online ? "Connected to server" : "Working offline"}</div>
          <p className="mt-1 text-xs text-gray-600">
            {online
              ? "Changes upload as soon as they are made."
              : "Sales, payments, returns and other changes are saved on this till and upload automatically when the internet is back. Keep this browser open and don't clear its data."}
          </p>
          {authBlocked && <p className="mt-1 text-xs text-red-600">Your session has ended — log in again so waiting changes can sync.</p>}
          {lastError && !authBlocked && <p className="mt-1 text-xs text-gray-500">{lastError}</p>}
          {lastSyncAt && <p className="mt-1 text-xs text-gray-400">Last sync {new Date(lastSyncAt).toLocaleTimeString()}</p>}
          <p className="mt-1 text-xs text-gray-500" data-testid="offline-copy">
            {prefetch?.running
              ? `Downloading data for offline use… ${prefetch.done}/${prefetch.total || "…"}`
              : prefetch?.lastCompletedAt
                ? `Offline copy of all screens updated ${new Date(prefetch.lastCompletedAt).toLocaleTimeString()}${prefetch.failed ? ` (${prefetch.failed} could not be downloaded)` : ""}`
                : "Offline copy not downloaded yet — connect to the internet once."}
            {online && !prefetch?.running && (
              <button type="button" className="ml-1 underline" onClick={() => void prefetchForOffline({ force: true })}>
                Update now
              </button>
            )}
          </p>
        </div>
        <div className="max-h-72 overflow-auto">
          {entries.length === 0 ? (
            <p className="p-3 text-xs text-gray-500">Nothing waiting — everything on this till is on the server.</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-2 border-b p-3 last:border-b-0">
                <div className="min-w-0 text-xs">
                  <div className="font-medium">
                    {describeEntry(entry)}
                    {entry.summary?.total != null && <> · Rs {Number(entry.summary.total).toLocaleString()}</>}
                  </div>
                  <div className="text-gray-500">
                    {entry.summary?.customerName ? `${String(entry.summary.customerName)} · ` : ""}
                    {formatTime(entry.createdAt)}
                  </div>
                  {entry.status === "failed" ? (
                    <div className="mt-1 text-red-600">Rejected: {entry.lastError}</div>
                  ) : entry.lastError ? (
                    <div className="mt-1 text-gray-400">Last try: {entry.lastError}</div>
                  ) : null}
                </div>
                {entry.status === "failed" && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => requeueFailed(entry.id).then(() => flush())}>
                      Retry
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600" aria-label="Discard" onClick={() => discard(entry)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end border-t p-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={syncing || pending === 0} onClick={() => flush()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Sync now
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
