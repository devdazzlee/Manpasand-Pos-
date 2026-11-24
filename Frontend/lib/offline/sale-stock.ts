/**
 * Branch stock for the sale screen: GET /stock, less pending outbox sale effects.
 * (Manpasand has no /sale/stock endpoint.)
 */
import { useCallback, useEffect, useState } from "react"
import apiClient from "@/lib/apiClient"
import { pendingEffects, subscribeOutbox } from "./outbox"

export interface SaleStock {
  branch: { id: string; name: string } | null
  stock: Record<string, number>
  loaded: boolean
}

async function load(branchId?: string): Promise<Omit<SaleStock, "loaded"> | null> {
  try {
    const res = await apiClient.get("/stock", {
      params: { limit: 5000, page: 1, ...(branchId ? { branchId } : {}) },
    })
    const rows: any[] = Array.isArray(res.data?.data) ? res.data.data : []
    const stock: Record<string, number> = {}
    for (const row of rows) {
      const productId = row.product_id || row.productId || row.product?.id
      if (!productId) continue
      const qty = Number(row.current_quantity ?? row.available_stock ?? row.quantity ?? 0)
      stock[productId] = (stock[productId] ?? 0) + qty
    }
    return {
      branch: branchId ? { id: branchId, name: "" } : null,
      stock,
    }
  } catch {
    return null
  }
}

async function withWaiting(stock: Record<string, number>): Promise<Record<string, number>> {
  const taken = (await pendingEffects()).stock
  if (!Object.keys(taken).length) return stock
  const next = { ...stock }
  for (const [productId, qty] of Object.entries(taken)) {
    next[productId] = Math.round(((next[productId] ?? 0) - qty) * 1000) / 1000
  }
  return next
}

export async function liveSaleStock(productId: string, branchId?: string): Promise<number | null> {
  try {
    const fresh = await load(branchId)
    if (!fresh) return null
    const withLocal = await withWaiting({ [productId]: fresh.stock[productId] ?? 0 })
    return withLocal[productId]
  } catch {
    return null
  }
}

export function useSaleStock(branchId?: string) {
  const [state, setState] = useState<SaleStock>({ branch: null, stock: {}, loaded: false })
  const [server, setServer] = useState<Omit<SaleStock, "loaded"> | null>(null)

  const refresh = useCallback(async () => {
    const fresh = await load(branchId)
    if (fresh) setServer(fresh)
  }, [branchId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    let last = -1
    return subscribeOutbox(() => {
      void (async () => {
        const { listPending } = await import("./outbox")
        const count = (await listPending().catch(() => [])).length
        if (count < last) void refresh()
        last = count
        setServer((s) => (s ? { ...s } : s))
      })()
    })
  }, [refresh])

  useEffect(() => {
    if (!server) return
    let cancelled = false
    void withWaiting(server.stock).then((stock) => {
      if (!cancelled) setState({ branch: server.branch, stock, loaded: true })
    })
    return () => {
      cancelled = true
    }
  }, [server])

  const available = useCallback(
    (productId: string): number | null => (state.loaded ? state.stock[productId] ?? 0 : null),
    [state],
  )

  return { ...state, available, refresh }
}
