/**
 * Offline-capable versions of the counter's write operations. Each one gives the record
 * its final id on the till, stores it in the outbox, and uploads it right away when
 * there is a connection (see submitMutation for the synced / queued / rejected outcomes).
 */
import { uuidv7 } from "./ids"
import { nextDocumentNumber, nextSaleNumber } from "./device"
import { submitMutation, type SubmitOutcome } from "./sync-engine"

export type { SubmitOutcome }

export interface NewCustomerInput {
  name: string
  email?: string
  phone_number?: string
  whatsapp_number?: string
  mobile_number?: string
  address?: string
  billing_address?: string
  credit_limit?: number
  outstanding_balance?: number
  [field: string]: unknown
}

export async function createCustomerOffline(input: NewCustomerInput) {
  const id = uuidv7()
  const payload: Record<string, unknown> = { ...input, id }
  if (!payload.email) delete payload.email
  const opening = Math.max(0, Number(input.outstanding_balance ?? 0))
  const outcome = await submitMutation<{ customer: { id: string } }>("customer.create", payload, {
    summary: { label: `New customer ${input.name}` },
    ...(opening > 0 ? { effects: { customerBalance: { [id]: opening } } } : {}),
  })
  return { id, outcome }
}

/** New Sale checkout — always through the outbox (live push when online). */
export async function createSaleOffline(
  input: Record<string, unknown> & {
    items: Array<{ productId: string; quantity: number; price: number }>
    paymentMethod: string
  },
) {
  const clientId = uuidv7()
  const saleNumber = nextSaleNumber()
  const stock: Record<string, number> = {}
  for (const item of input.items) {
    stock[item.productId] = (stock[item.productId] ?? 0) + (Number(item.quantity) || 0)
  }
  const total = input.items.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0)
  const payload = {
    ...input,
    clientId,
    saleNumber,
    saleDate: new Date().toISOString(),
  }
  const outcome = await submitMutation<any>("sale.create", payload, {
    summary: {
      saleNumber,
      label: `Sale ${saleNumber}`,
      total: Math.max(0, total - Number(input.discountAmount ?? 0)),
    },
    effects: { stock },
  })
  return { clientId, saleNumber, outcome }
}

export async function holdSaleOffline(input: {
  customerId?: string | null
  items: Record<string, unknown>[]
  subtotal: number
  branchId?: string | null
}) {
  const id = uuidv7()
  const outcome = await submitMutation(
    "holdSale.create",
    {
      id,
      customerId: input.customerId ?? null,
      items: input.items,
      ...(input.branchId ? { branchId: input.branchId } : {}),
    },
    {
      summary: { label: `Held cart (${input.items.length} items)`, total: input.subtotal },
    },
  )
  return { id, outcome }
}

export function deleteHoldSaleOffline(id: string) {
  return submitMutation("holdSale.delete", { id }, { summary: { label: "Remove held cart" } })
}

export async function recordCustomerPaymentOffline(input: {
  customerId: string
  customerName?: string
  amount: number
  description?: string
  referenceNo?: string
  saleId?: string
}) {
  const entryId = uuidv7()
  const outcome = await submitMutation<{ entry: unknown; newBalance: number }>(
    "customerPayment.create",
    { ...input, customerName: undefined, entryId, receivedAt: new Date().toISOString() },
    {
      summary: { label: `Payment from ${input.customerName ?? "customer"}`, total: input.amount, customerName: input.customerName },
      effects: { customerBalance: { [input.customerId]: -input.amount } },
    },
  )
  return { entryId, outcome }
}

export async function createExpenseOffline(input: { particular: string; amount: number; description?: string | null }) {
  const id = uuidv7()
  const outcome = await submitMutation("expense.create", { ...input, id, createdAt: new Date().toISOString() }, {
    summary: { label: `Expense: ${input.particular}`, total: input.amount },
  })
  return { id, outcome }
}

export interface RefundInput {
  /** Server id, till clientId or invoice number of the sale being returned against. */
  originalSaleRef: string
  customerId?: string
  returnedItems: Array<{ productId: string; quantity: number; disposition?: string }>
  exchangedItems?: Array<{ productId: string; quantity: number; price: number }>
  notes?: string
  returnReason?: string
  refundMethod?: string
  exchangePaymentMethod?: "CASH" | "CREDIT"
  orderScope?: "FULL" | "PARTIAL"
  [field: string]: unknown
}

export async function refundSaleOffline(input: RefundInput, display: { originalSaleNumber?: string; total?: number } = {}) {
  const clientId = uuidv7()
  const saleNumber = nextSaleNumber()
  const stock: Record<string, number> = {}
  for (const item of input.returnedItems) {
    // Only restocked items come back on the shelf.
    if (!item.disposition || item.disposition === "RESTOCK") stock[item.productId] = (stock[item.productId] ?? 0) - item.quantity
  }
  for (const item of input.exchangedItems ?? []) stock[item.productId] = (stock[item.productId] ?? 0) + item.quantity
  const outcome = await submitMutation<any>(
    "sale.refund",
    { ...input, exchangedItems: input.exchangedItems ?? [], clientId, saleNumber, saleDate: new Date().toISOString() },
    {
      summary: {
        saleNumber,
        label: `Return/exchange ${saleNumber}${display.originalSaleNumber ? ` for ${display.originalSaleNumber}` : ""}`,
        total: display.total,
      },
      effects: { stock },
    },
  )
  return { clientId, saleNumber, outcome }
}

export async function createStockAdjustmentOffline(input: {
  productId: string
  productName?: string
  branchId?: string
  systemQuantity: number
  adjustmentType: "ADDITION" | "SUBTRACTION" | "RECONCILIATION"
  adjustmentCategory: string
  physicalCount?: number
  changeQuantity?: number
  reason?: string
  referenceNo?: string
}) {
  const id = uuidv7()
  const difference =
    input.adjustmentType === "RECONCILIATION"
      ? Number(input.physicalCount ?? input.systemQuantity) - input.systemQuantity
      : input.adjustmentType === "ADDITION"
        ? Number(input.changeQuantity ?? 0)
        : -Math.abs(Number(input.changeQuantity ?? 0))
  const { productName, ...payload } = input
  const outcome = await submitMutation("stockAdjustment.create", { ...payload, id, adjustmentDate: new Date().toISOString() }, {
    summary: { label: `Stock ${input.adjustmentType.toLowerCase()}: ${productName ?? input.productId}` },
    // Stock effects count units taken out, so a positive difference is negative here.
    effects: { stock: { [input.productId]: -difference } },
  })
  return { id, outcome }
}

/** Only the fields that actually changed, with the values this till saw before (the server's conflict check). */
function diffFields<T extends Record<string, unknown>>(original: Record<string, unknown>, edited: T) {
  const changes: Record<string, unknown> = {}
  const base: Record<string, unknown> = {}
  const same = (a: unknown, b: unknown) => (a ?? "") === (b ?? "") || (a !== null && b !== null && a !== undefined && b !== undefined && String(a) === String(b))
  for (const [field, value] of Object.entries(edited)) {
    if (value === undefined || same(original[field], value)) continue
    changes[field] = value
    base[field] = original[field] ?? null
  }
  return { changes, base }
}

export async function updateCustomerOffline(
  original: { id: string; name?: string | null; [field: string]: unknown },
  edited: Record<string, unknown>,
) {
  const { changes, base } = diffFields(original, edited)
  if (Object.keys(changes).length === 0) return { outcome: { status: "synced", data: original } as SubmitOutcome<unknown>, changed: false }
  const outcome = await submitMutation("customer.update", { id: original.id, changes, base }, {
    summary: { label: `Edit customer ${original.name ?? ""}`.trim() },
  })
  return { outcome, changed: true }
}

export function deleteCustomerOffline(customer: { id: string; name?: string | null; updated_at?: string | null }) {
  return submitMutation("customer.delete", { id: customer.id, ...(customer.updated_at ? { baseUpdatedAt: customer.updated_at } : {}) }, {
    summary: { label: `Delete customer ${customer.name ?? ""}`.trim() },
  })
}

export function deleteExpenseOffline(expense: { id: string; particular?: string; amount?: number | string }) {
  return submitMutation("expense.delete", { id: expense.id }, {
    summary: { label: `Delete expense ${expense.particular ?? ""}`.trim(), total: Number(expense.amount ?? 0) || undefined },
  })
}

export function updateLedgerEntryOffline(input: {
  customerId: string
  entryId: string
  /** The entry as this till shows it. */
  seen: { amount?: number; description?: string | null; referenceNo?: string | null; date?: string }
  edited: { amount?: number; description?: string; referenceNo?: string; date?: string; direction?: "debit" | "credit" }
  /** Change in what the customer owes, for the on-screen balance until it syncs. */
  balanceDelta?: number
}) {
  const { direction, ...fields } = input.edited
  const { changes, base } = diffFields(input.seen, fields)
  return submitMutation(
    "ledgerEntry.update",
    { customerId: input.customerId, entryId: input.entryId, changes: { ...changes, ...(direction ? { direction } : {}) }, base },
    {
      summary: { label: "Edit ledger entry" },
      ...(input.balanceDelta ? { effects: { customerBalance: { [input.customerId]: input.balanceDelta } } } : {}),
    },
  )
}

export function deleteLedgerEntryOffline(input: {
  customerId: string
  entryId: string
  baseAmount: number
  reason?: string
  /** Change in what the customer owes once the entry is gone (for the on-screen balance). */
  balanceDelta?: number
}) {
  const { balanceDelta, ...payload } = input
  return submitMutation("ledgerEntry.delete", payload, {
    summary: { label: "Delete ledger entry", total: input.baseAmount },
    ...(balanceDelta ? { effects: { customerBalance: { [input.customerId]: balanceDelta } } } : {}),
  })
}

// ---------------------------------------------------------------- stock operations

type Taken = Record<string, number>
const sumTaken = (items: Array<{ productId: string; quantity: number }>, sign: 1 | -1): Taken => {
  const taken: Taken = {}
  for (const item of items) taken[item.productId] = (taken[item.productId] ?? 0) + sign * item.quantity
  return taken
}

/** Stock-in (Purchases screen). Goods received are added to on-screen stock straight away. */
export async function createPurchaseOffline(input: { supplierId: string; items: Array<{ productId: string; quantity: number; [k: string]: unknown }>; [field: string]: unknown }, display: { supplierName?: string } = {}) {
  const clientId = uuidv7()
  const purchaseNumber = nextDocumentNumber("PUR")
  const outcome = await submitMutation<any>("purchase.create", { ...input, clientId, purchaseNumber, happenedAt: new Date().toISOString() }, {
    summary: { label: `Stock in ${purchaseNumber}${display.supplierName ? ` from ${display.supplierName}` : ""}` },
    effects: { stock: sumTaken(input.items, -1) },
  })
  return { purchaseNumber, outcome }
}

export async function createStockOutOffline(input: { reason: string; items: Array<{ productId: string; quantity: number; notes?: string }>; [field: string]: unknown }) {
  const outcome = await submitMutation<any>("stockOut.create", { ...input, clientId: uuidv7(), happenedAt: new Date().toISOString() }, {
    summary: { label: `Stock out (${input.reason.toLowerCase()}, ${input.items.length} items)` },
    effects: { stock: sumTaken(input.items, 1) },
  })
  return { outcome }
}

export function addStockOffline(input: { productId: string; branchId?: string; quantity: number }, productName?: string) {
  return submitMutation<any>("stock.add", { ...input, clientId: uuidv7(), happenedAt: new Date().toISOString() }, {
    summary: { label: `Add stock: ${productName ?? input.productId} +${input.quantity}` },
    effects: { stock: { [input.productId]: -input.quantity } },
  })
}

export function adjustStockOffline(input: { productId: string; branchId?: string; quantityChange: number; reason?: string }, productName?: string) {
  return submitMutation<any>("stock.adjust", { ...input, clientId: uuidv7(), happenedAt: new Date().toISOString() }, {
    summary: { label: `Adjust stock: ${productName ?? input.productId} ${input.quantityChange > 0 ? "+" : ""}${input.quantityChange}` },
    effects: { stock: { [input.productId]: -input.quantityChange } },
  })
}

export function removeStockOffline(input: { productId: string; branchId?: string; quantity: number; reason?: string }, productName?: string) {
  return submitMutation<any>("stock.remove", { ...input, clientId: uuidv7(), happenedAt: new Date().toISOString() }, {
    summary: { label: `Remove stock: ${productName ?? input.productId} -${input.quantity}` },
    effects: { stock: { [input.productId]: input.quantity } },
  })
}

// ---------------------------------------------------------------- supplier ledger

export async function recordSupplierPaymentOffline(input: { supplierId: string; supplierName?: string; amount: number; description?: string; referenceNo?: string; purchaseId?: string }) {
  const { supplierName, ...payload } = input
  const entryId = uuidv7()
  const outcome = await submitMutation("supplierPayment.create", { ...payload, entryId, paidAt: new Date().toISOString() }, {
    summary: { label: `Payment to ${supplierName ?? "supplier"}`, total: input.amount },
  })
  return { entryId, outcome }
}

export function updateSupplierLedgerEntryOffline(input: {
  supplierId: string
  entryId: string
  seen: { amount?: number; description?: string | null; referenceNo?: string | null; date?: string }
  edited: { amount?: number; description?: string; referenceNo?: string; date?: string; direction?: "debit" | "credit" }
}) {
  const { direction, ...fields } = input.edited
  const { changes, base } = diffFields(input.seen, fields)
  return submitMutation(
    "supplierLedgerEntry.update",
    { supplierId: input.supplierId, entryId: input.entryId, changes: { ...changes, ...(direction ? { direction } : {}) }, base },
    { summary: { label: "Edit supplier ledger entry" } },
  )
}

export function deleteSupplierLedgerEntryOffline(input: { supplierId: string; entryId: string; baseAmount: number; reason?: string }) {
  return submitMutation("supplierLedgerEntry.delete", input, { summary: { label: "Delete supplier ledger entry", total: input.baseAmount } })
}

// ---------------------------------------------------------------- sale edit / delete

interface SaleSnapshot {
  id: string
  sale_number: string
  updated_at?: string
  pending_sync?: boolean
  total_amount?: number | string
  payment_method?: string
  payment_received?: number | string
  customer_id?: string | null
  customer?: { id?: string } | null
  sale_items?: Array<{ product_id?: string; product?: { id: string }; quantity: number | string; item_type?: string }>
}

const originalLines = (sale: SaleSnapshot) =>
  (sale.sale_items ?? [])
    .filter((i) => !i.item_type || i.item_type === "ORIGINAL")
    .map((i) => ({ productId: (i.product?.id ?? i.product_id) as string, quantity: Number(i.quantity) }))

const owedOn = (sale: SaleSnapshot) =>
  String(sale.payment_method).toUpperCase() === "CREDIT" ? Math.max(0, Number(sale.total_amount ?? 0) - Number(sale.payment_received ?? 0)) : 0

/** Sales History editor. Sends the version the till saw; a change made elsewhere since is a conflict. */
export function updateSaleOffline(
  sale: SaleSnapshot,
  edit: { items: Array<{ productId: string; quantity: number; price: number }>; discountAmount?: number; paymentMethod?: string; paidAmount?: number; customerId?: string | null; notes?: string },
) {
  const stock: Taken = sumTaken(edit.items, 1)
  for (const line of originalLines(sale)) stock[line.productId] = (stock[line.productId] ?? 0) - line.quantity
  const total = Math.max(0, edit.items.reduce((s, i) => s + i.price * i.quantity, 0) - Number(edit.discountAmount ?? 0))
  const owedAfter = String(edit.paymentMethod).toUpperCase() === "CREDIT" ? Math.max(0, total - Number(edit.paidAmount ?? 0)) : 0
  const customerBefore = sale.customer_id ?? sale.customer?.id ?? null
  const customerAfter = edit.customerId === undefined ? customerBefore : edit.customerId
  const customerBalance: Record<string, number> = {}
  if (customerBefore) customerBalance[customerBefore] = (customerBalance[customerBefore] ?? 0) - owedOn(sale)
  if (customerAfter) customerBalance[customerAfter] = (customerBalance[customerAfter] ?? 0) + owedAfter
  return submitMutation<any>(
    "sale.update",
    {
      ...edit,
      saleRef: sale.id,
      editId: uuidv7(),
      ...(sale.updated_at && !sale.pending_sync ? { baseUpdatedAt: new Date(sale.updated_at).toISOString() } : {}),
    },
    { summary: { label: `Edit sale ${sale.sale_number}`, total }, effects: { stock, customerBalance } },
  )
}

export function deleteSaleOffline(sale: SaleSnapshot) {
  const customer = sale.customer_id ?? sale.customer?.id
  return submitMutation<any>(
    "sale.delete",
    { saleRef: sale.id, ...(sale.updated_at && !sale.pending_sync ? { baseUpdatedAt: new Date(sale.updated_at).toISOString() } : {}) },
    {
      summary: { label: `Delete sale ${sale.sale_number}`, total: Number(sale.total_amount ?? 0) },
      effects: {
        stock: sumTaken(originalLines(sale), -1),
        ...(customer && owedOn(sale) ? { customerBalance: { [customer]: -owedOn(sale) } } : {}),
      },
    },
  )
}
