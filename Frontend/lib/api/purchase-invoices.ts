import { getOne, post, del, cleanParams } from "./http";
import apiClient from "@/lib/apiClient";

export const PI_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID"] as const;
export type PurchaseInvoiceStatus = (typeof PI_STATUSES)[number];

export interface UninvoicedPurchase {
  id: string;
  product: { id: string; name: string; sku: string | null; code: string | null } | null;
  quantity: number;
  cost_price: number;
  line_total: number;
  purchase_date: string;
  invoice_ref: string | null;
  po_number: string | null;
}

export interface PurchaseInvoice {
  id: string;
  invoice_number: string;
  status: PurchaseInvoiceStatus;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  notes: string | null;
  supplier?: { id: string; name: string; code: string };
  branch?: { id: string; name: string } | null;
  purchase_order?: { id: string; po_number: string } | null;
  purchases: {
    id: string;
    product: { id: string; name: string; sku: string | null; code: string | null } | null;
    quantity: number;
    cost_price: number;
    line_total: number;
    purchase_date: string;
  }[];
}

export interface PurchaseInvoiceListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    outstanding: number;
    openCount: number;
    aging: { current: number; d1_30: number; d31_60: number; d60_plus: number };
  };
}

export interface PurchaseInvoiceQuery {
  page?: number;
  limit?: number;
  supplierId?: string;
  status?: PurchaseInvoiceStatus;
  overdue?: boolean;
  from?: string;
  to?: string;
}

export interface PurchaseInvoicePayload {
  supplier_id: string;
  branch_id?: string | null;
  purchase_order_id?: string | null;
  invoice_number: string;
  invoice_date?: string;
  due_date?: string | null;
  tax_amount?: number;
  discount_amount?: number;
  notes?: string | null;
  purchase_ids: string[];
}

export async function fetchPurchaseInvoices(
  q: PurchaseInvoiceQuery,
  signal?: AbortSignal,
): Promise<{ data: PurchaseInvoice[]; meta: PurchaseInvoiceListMeta }> {
  const res = await apiClient.get("/purchase-invoices", {
    params: cleanParams({
      page: q.page ?? 1,
      limit: q.limit ?? 20,
      supplier_id: q.supplierId,
      status: q.status,
      overdue: q.overdue ? "true" : undefined,
      from: q.from,
      to: q.to,
    }),
    signal,
  });
  const data: PurchaseInvoice[] = Array.isArray(res.data?.data) ? res.data.data : [];
  const m = res.data?.meta ?? {};
  return {
    data,
    meta: {
      total: Number(m.total ?? data.length) || 0,
      page: Number(m.page ?? q.page ?? 1) || 1,
      limit: Number(m.limit ?? q.limit ?? 20) || 20,
      totalPages: Math.max(1, Number(m.totalPages ?? 1) || 1),
      summary: {
        outstanding: Number(m.summary?.outstanding) || 0,
        openCount: Number(m.summary?.openCount) || 0,
        aging: {
          current: Number(m.summary?.aging?.current) || 0,
          d1_30: Number(m.summary?.aging?.d1_30) || 0,
          d31_60: Number(m.summary?.aging?.d31_60) || 0,
          d60_plus: Number(m.summary?.aging?.d60_plus) || 0,
        },
      },
    },
  };
}

export const fetchPurchaseInvoiceById = (id: string, signal?: AbortSignal) =>
  getOne<PurchaseInvoice>(`/purchase-invoices/${id}`, { signal });

export const fetchUninvoicedPurchases = (supplierId: string, signal?: AbortSignal) =>
  getOne<UninvoicedPurchase[]>(`/purchase-invoices/uninvoiced/${supplierId}`, { signal });

export const createPurchaseInvoice = (body: PurchaseInvoicePayload) =>
  post<PurchaseInvoice>("/purchase-invoices", body);

export const updatePurchaseInvoice = (id: string, body: Partial<PurchaseInvoicePayload>) =>
  apiClient.patch(`/purchase-invoices/${id}`, body).then((r) => r.data?.data as PurchaseInvoice);

export const deletePurchaseInvoice = (id: string) => del<void>(`/purchase-invoices/${id}`);
