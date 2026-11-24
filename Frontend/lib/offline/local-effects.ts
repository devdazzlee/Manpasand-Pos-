import { listOutbox, pendingEffects, type OutboxEffects, type OutboxEntry } from "./outbox"

const round = (n: number) => Math.round(n * 1000) / 1000

/** Takes quantities out of a product's stock fields (sales not yet synced). */
function deductStock<T extends Record<string, any>>(product: T, qty: number): T {
  if (!qty) return product
  const next: Record<string, any> = { ...product }
  for (const field of ["stock", "current_stock", "available_stock"]) {
    if (typeof next[field] === "number") next[field] = round(next[field] - qty)
    else if (next[field] != null && !Number.isNaN(Number(next[field]))) next[field] = round(Number(next[field]) - qty)
  }
  return next as T
}

function shiftBalance<T extends Record<string, any>>(customer: T, delta: number): T {
  if (!delta) return customer
  return { ...customer, outstanding_balance: round(Number(customer.outstanding_balance ?? 0) + delta) }
}

export function applyEffectsToProducts<T extends { id: string }>(products: T[], effects: OutboxEffects): T[] {
  const stock = effects.stock ?? {}
  if (Object.keys(stock).length === 0) return products
  return products.map((p) => deductStock(p as any, stock[p.id] ?? 0))
}

export function applyEffectsToCustomers<T extends { id: string }>(customers: T[], effects: OutboxEffects): T[] {
  const balances = effects.customerBalance ?? {}
  if (Object.keys(balances).length === 0) return customers
  return customers.map((c) => shiftBalance(c as any, balances[c.id] ?? 0))
}

/**
 * Server data doesn't include changes still waiting in the outbox. Overlay them so
 * stock and balances on screen match what has really happened at this till.
 */
export async function withPendingProducts<T extends { id: string }>(products: T[]): Promise<T[]> {
  return applyEffectsToProducts(products, await pendingEffects())
}

/** Payloads of outbox entries of one type that the server hasn't confirmed yet (oldest first). */
export async function pendingPayloads<P = Record<string, any>>(type: string): Promise<Array<P & { _entry: OutboxEntry }>> {
  try {
    return (await listOutbox())
      .filter((entry) => entry.type === type)
      .map((entry) => ({ ...(entry.payload as P), _entry: entry }))
  } catch {
    return []
  }
}

/** Shape a not-yet-synced customer.create payload like a customer row from GET /customer. */
export function customerFromPayload(payload: Record<string, any>) {
  const { recordedOffline: _offline, _entry, ...fields } = payload
  return {
    ...fields,
    email: fields.email || null,
    // The opening balance shows up through the effects overlay, not here.
    outstanding_balance: 0,
    credit_limit: fields.credit_limit ?? 0,
    is_active: true,
    created_at: _entry?.createdAt,
    pending_sync: true,
  }
}

export async function withPendingCustomers<T extends { id: string }>(customers: T[]): Promise<T[]> {
  const known = new Set(customers.map((c) => c.id))
  const [creates, updates, deletes] = await Promise.all([
    pendingPayloads("customer.create"),
    pendingPayloads<{ id: string; changes: Record<string, unknown> }>("customer.update"),
    pendingPayloads<{ id: string }>("customer.delete"),
  ])
  const created = creates
    .filter((payload) => !known.has(payload.id))
    .map((payload) => customerFromPayload(payload) as unknown as T)
  const deleted = new Set(deletes.map((d) => d.id))
  const edited = [...created, ...customers]
    .filter((c) => !deleted.has(c.id))
    .map((c) => {
      const mine = updates.filter((u) => u.id === c.id)
      return mine.length ? (Object.assign({}, c, ...mine.map((u) => u.changes), { pending_sync: true }) as T) : c
    })
  return applyEffectsToCustomers(edited, await pendingEffects())
}

/**
 * Sales list for the Returns screen, including what only this till knows so far:
 * sales not yet uploaded (so they can be returned straight away, offline) and returns
 * not yet uploaded (so the same item can't be returned twice from this till).
 * Works on the raw GET /sale/for-returns shape.
 */
export async function withPendingSalesForReturns(
  serverSales: any[],
  lookup: {
    products: Array<{ id: string; name?: string; sku?: string }>
    customers: Array<{ id: string; name?: string; email?: string | null; phone_number?: string | null }>
  },
): Promise<any[]> {
  const [creates, refunds, edits] = await Promise.all([
    pendingPayloads("sale.create"),
    pendingPayloads("sale.refund"),
    pendingPayloads("sale.update"),
  ])
  const knownNumbers = new Set(serverSales.map((s) => s.sale_number))
  const productById = new Map(lookup.products.map((p) => [p.id, p]))
  const customerById = new Map(lookup.customers.map((c) => [c.id, c]))

  const local = creates
    .filter((sale) => !knownNumbers.has(sale.saleNumber))
    .map((sale) => {
      const items = (sale.items ?? []) as Array<{ productId: string; quantity: number; price: number }>
      const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0)
      const total = Math.max(0, subtotal - Number(sale.discountAmount ?? 0))
      const customer = sale.customerId ? customerById.get(sale.customerId) : undefined
      return {
        // The till id: the server resolves a return's original sale by it until it syncs.
        id: sale.clientId,
        sale_number: sale.saleNumber,
        sale_date: sale.saleDate,
        subtotal,
        total_amount: total,
        discount_amount: Number(sale.discountAmount ?? 0),
        payment_received: sale.paymentMethod === "CREDIT" ? Number(sale.paidAmount ?? 0) : total,
        customer: customer ? { ...customer } : undefined,
        pending_sync: true,
        sale_items: items.map((it, index) => {
          const product = productById.get(it.productId)
          return {
            id: `${sale.clientId}-${index}`,
            product_id: it.productId,
            product: { id: it.productId, name: product?.name ?? "Product", sku: product?.sku ?? "" },
            quantity: it.quantity,
            quantity_returnable: it.quantity,
            quantity_already_returned: 0,
            unit_price: it.price,
            line_total: it.price * it.quantity,
          }
        }),
      }
    })

  const all = [...local.reverse(), ...serverSales].map((sale) => ({
    ...sale,
    sale_items: (sale.sale_items ?? []).map((item: any) => ({ ...item })),
  }))

  // An offline edit replaces the sale's lines: what can be returned is what was finally sold.
  for (const edit of edits) {
    const target = all.find((s) => [s.id, s.sale_number, s.client_id].includes(edit.saleRef))
    if (!target) continue
    const items = (edit.items ?? []) as Array<{ productId: string; quantity: number; price: number }>
    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0)
    target.subtotal = subtotal
    target.total_amount = Math.max(0, subtotal - Number(edit.discountAmount ?? 0))
    target.discount_amount = Number(edit.discountAmount ?? 0)
    target.sale_items = items.map((it, index) => {
      const product = productById.get(it.productId)
      return {
        id: `${edit.editId}-${index}`,
        product_id: it.productId,
        product: { id: it.productId, name: product?.name ?? "Product", sku: product?.sku ?? "" },
        quantity: it.quantity,
        quantity_returnable: it.quantity,
        quantity_already_returned: 0,
        unit_price: it.price,
        line_total: it.price * it.quantity,
      }
    })
  }

  for (const refund of refunds) {
    const target = all.find((s) => [s.id, s.sale_number, s.client_id].includes(refund.originalSaleRef))
    if (!target) continue
    for (const returned of (refund.returnedItems ?? []) as Array<{ productId: string; quantity: number }>) {
      const line = target.sale_items.find((item: any) => (item.product?.id ?? item.product_id) === returned.productId)
      if (!line) continue
      const sold = Number(line.quantity)
      const already = Number(line.quantity_already_returned ?? 0) + returned.quantity
      line.quantity_already_returned = already
      line.quantity_returnable = Math.max(0, Math.min(Number(line.quantity_returnable ?? sold), sold - already))
    }
    target.return_eligibility = {
      has_prior_returns: true,
      fully_returned: target.sale_items.every((item: any) => Number(item.quantity_returnable ?? item.quantity) <= 0),
    }
  }
  return all
}

/**
 * Returns/exchanges recorded on this till that haven't synced, shaped like the
 * REFUNDED/EXCHANGED sales the Returns history shows. `originals` must already include
 * this till's unsynced sales (see withPendingSalesForReturns) so a return of one of
 * them can be described. Refund figures are the till's estimate (net of the original
 * discount); the server's posted figures replace them once synced.
 */
export async function pendingReturnRows(originals: any[]): Promise<any[]> {
  const refunds = await pendingPayloads("sale.refund")
  return refunds.map((refund) => {
    const original = originals.find((s) => [s.id, s.sale_number, s.client_id].includes(refund.originalSaleRef))
    const subtotal = Number(original?.subtotal ?? 0)
    const discount = Number(original?.discount_amount ?? 0)
    const discountRatio = subtotal > 0 && discount > 0 ? Math.min(1, discount / subtotal) : 0
    const lineFor = (productId: string) =>
      original?.sale_items?.find((item: any) => (item.product?.id ?? item.product_id) === productId)
    const returned = ((refund.returnedItems ?? []) as Array<{ productId: string; quantity: number }>).map((item, index) => {
      const line = lineFor(item.productId)
      const unit = Number(line?.unit_price ?? 0) * (1 - discountRatio)
      return {
        id: `${refund.clientId}-r${index}`,
        product: line?.product ?? { id: item.productId, name: "Product", sku: "" },
        quantity: -item.quantity,
        unit_price: unit,
        line_total: -unit * item.quantity,
        item_type: "RETURN",
      }
    })
    const exchanged = ((refund.exchangedItems ?? []) as Array<{ productId: string; quantity: number; price: number }>).map((item, index) => ({
      id: `${refund.clientId}-e${index}`,
      product: lineFor(item.productId)?.product ?? { id: item.productId, name: "Product", sku: "" },
      quantity: item.quantity,
      unit_price: item.price,
      line_total: item.price * item.quantity,
      item_type: "EXCHANGE",
    }))
    const total = [...returned, ...exchanged].reduce((sum, item) => sum + item.line_total, 0)
    return {
      id: refund.clientId,
      sale_number: refund.saleNumber,
      original_sale_id: original?.id ?? null,
      original_sale: original ? { id: original.id, sale_number: original.sale_number } : null,
      customer: original?.customer,
      sale_date: refund.saleDate,
      total_amount: Math.round(total * 100) / 100,
      status: exchanged.length ? "EXCHANGED" : "REFUNDED",
      payment_method: refund.exchangePaymentMethod ?? "CASH",
      notes: [refund.returnReason && `Reason: ${refund.returnReason}`, refund.notes, "Not synced yet"].filter(Boolean).join(" | "),
      sale_items: [...returned, ...exchanged],
      pending_sync: true,
    }
  })
}

/**
 * Sales History as this till knows it: unsynced sales and returns first (marked
 * `pending_sync`), offline edits applied, offline deletes hidden. Raw GET /sale shape.
 */
export async function withPendingSalesHistory(
  serverSales: any[],
  lookup: Parameters<typeof withPendingSalesForReturns>[1],
  options: { includeNew: boolean },
): Promise<any[]> {
  const [creates, updates, deletes] = await Promise.all([
    pendingPayloads("sale.create"),
    pendingPayloads("sale.update"),
    pendingPayloads<{ saleRef: string }>("sale.delete"),
  ])
  const withNew = options.includeNew ? await withPendingSalesForReturns(serverSales, lookup) : serverSales
  const createdByClientId = new Map(creates.map((c) => [c.clientId, c]))
  const returns = options.includeNew ? await pendingReturnRows(withNew) : []
  const knownNumbers = new Set(serverSales.map((s) => s.sale_number))

  const matches = (sale: any, ref: string) => [sale.id, sale.sale_number, sale.client_id].includes(ref)
  const productById = new Map(lookup.products.map((p) => [p.id, p]))
  const rows = [...returns.filter((r) => !knownNumbers.has(r.sale_number)), ...withNew].map((sale) => {
    const created = sale.pending_sync ? createdByClientId.get(sale.id) : undefined
    let row = created
      ? {
          ...sale,
          created_at: sale.sale_date,
          status: "COMPLETED",
          payment_method: created.paymentMethod,
          payment_status: created.paymentMethod === "CREDIT" ? (Number(created.paidAmount ?? 0) >= sale.total_amount ? "PAID" : "PENDING") : "PAID",
          total_amount: String(sale.total_amount),
          customer_id: created.customerId ?? null,
          customer: sale.customer ?? null,
          notes: "Not synced yet",
          sale_items: sale.sale_items.map((item: any) => ({ ...item, item_type: "ORIGINAL", unit_price: String(item.unit_price), line_total: String(item.line_total) })),
        }
      : sale
    for (const edit of updates.filter((u: any) => matches(row, u.saleRef))) {
      const items = (edit.items ?? []) as Array<{ productId: string; quantity: number; price: number }>
      const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0)
      const total = Math.max(0, subtotal - Number(edit.discountAmount ?? 0))
      row = {
        ...row,
        subtotal: String(subtotal),
        discount_amount: String(edit.discountAmount ?? 0),
        total_amount: String(total),
        payment_method: edit.paymentMethod ?? row.payment_method,
        ...(edit.customerId !== undefined ? { customer_id: edit.customerId } : {}),
        notes: [row.notes, "Edit not synced yet"].filter(Boolean).join(" | "),
        pending_sync: true,
        sale_items: items.map((it, index) => {
          const product = productById.get(it.productId)
          return {
            id: `${edit.editId}-${index}`,
            product_id: it.productId,
            product: { id: it.productId, name: product?.name ?? "Product", sku: product?.sku ?? "" },
            quantity: it.quantity,
            unit_price: String(it.price),
            line_total: String(it.price * it.quantity),
            item_type: "ORIGINAL",
          }
        }),
      }
    }
    return row
  })
  return rows.filter((sale) => !deletes.some((d) => matches(sale, d.saleRef)))
}
