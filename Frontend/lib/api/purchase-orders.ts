import { getOne, post, del, cleanParams } from "./http";
import apiClient from "@/lib/apiClient";

export const PO_STATUSES = [
  "PENDING",
  "APPROVED",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
] as const;
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];

export interface PurchaseOrderItem {
  id: string;
  product_id: string;
  ordered_quantity: number;
  received_quantity: number;
  unit_cost: number;
  total_cost: number;
  product?: { id: string; name: string; sku: string | null; code: string | null };
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_delivery: string | null;
  delivery_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  supplier?: { id: string; name: string; code: string };
  branch?: { id: string; name: string };
  user?: { id: string; email: string };
  purchase_order_items: PurchaseOrderItem[];
}

export interface PurchaseOrderListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: { outstandingValue: number; openCount: number };
}

export interface PurchaseOrderQuery {
  page?: number;
  limit?: number;
  search?: string;
  supplierId?: string;
  status?: PurchaseOrderStatus;
  from?: string;
  to?: string;
}

export interface PurchaseOrderPayload {
  supplier_id: string;
  branch_id?: string;
  order_date?: string;
  expected_delivery?: string | null;
  tax_amount?: number;
  notes?: string | null;
  items: { product_id: string; ordered_quantity: number; unit_cost: number }[];
}

export async function fetchPurchaseOrders(
  q: PurchaseOrderQuery,
  signal?: AbortSignal,
): Promise<{ data: PurchaseOrder[]; meta: PurchaseOrderListMeta }> {
  const res = await apiClient.get("/purchase-orders", {
    params: cleanParams({
      page: q.page ?? 1,
      limit: q.limit ?? 20,
      search: q.search?.trim() || undefined,
      supplier_id: q.supplierId,
      status: q.status,
      from: q.from,
      to: q.to,
    }),
    signal,
  });
  const data: PurchaseOrder[] = Array.isArray(res.data?.data) ? res.data.data : [];
  const m = res.data?.meta ?? {};
  return {
    data,
    meta: {
      total: Number(m.total ?? data.length) || 0,
      page: Number(m.page ?? q.page ?? 1) || 1,
      limit: Number(m.limit ?? q.limit ?? 20) || 20,
      totalPages: Math.max(1, Number(m.totalPages ?? 1) || 1),
      summary: {
        outstandingValue: Number(m.summary?.outstandingValue) || 0,
        openCount: Number(m.summary?.openCount) || 0,
      },
    },
  };
}

export const fetchPurchaseOrderById = (id: string, signal?: AbortSignal) =>
  getOne<PurchaseOrder>(`/purchase-orders/${id}`, { signal });

export const createPurchaseOrder = (body: PurchaseOrderPayload) =>
  post<PurchaseOrder>("/purchase-orders", body);

export const updatePurchaseOrder = (id: string, body: Partial<PurchaseOrderPayload>) =>
  apiClient.patch(`/purchase-orders/${id}`, body).then((r) => r.data?.data as PurchaseOrder);

export const setPurchaseOrderStatus = (id: string, status: PurchaseOrderStatus) =>
  apiClient.patch(`/purchase-orders/${id}/status`, { status }).then((r) => r.data?.data as PurchaseOrder);

export const cancelPurchaseOrder = (id: string) =>
  apiClient.post(`/purchase-orders/${id}/cancel`).then((r) => r.data?.data as PurchaseOrder);

export const deletePurchaseOrder = (id: string) => del<void>(`/purchase-orders/${id}`);

export const receivePurchaseOrder = (
  id: string,
  body: {
    invoice_ref?: string;
    notes?: string;
    lines: { item_id: string; quantity: number; sale_price?: number }[];
  },
) => post<PurchaseOrder>(`/purchase-orders/${id}/receive`, body);
