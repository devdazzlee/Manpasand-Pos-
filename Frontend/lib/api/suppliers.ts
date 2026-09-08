import { getList, getOne, post, put, del, cleanParams, type ListResult } from "./http";

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface SupplierQuery {
  search?: string;
  page?: number;
  limit?: number;
  isActive?: boolean;
  /** Maps to the `display_on_pos` server filter (the "On POS" chip). */
  displayOnPos?: boolean;
}

export async function fetchSuppliers(
  q: SupplierQuery,
  signal?: AbortSignal,
): Promise<ListResult<Supplier>> {
  return getList<Supplier>(
    "/suppliers",
    cleanParams({
      page: q.page ?? 1,
      limit: q.limit ?? 20,
      search: q.search?.trim() || undefined,
      is_active: q.isActive,
      display_on_pos: q.displayOnPos,
    }),
    signal,
  );
}

export async function fetchSupplierPurchases(id: string, signal?: AbortSignal) {
  return getOne<any>(`/suppliers/${id}/purchases`, { signal });
}

export async function fetchSupplierLedger(id: string, signal?: AbortSignal) {
  return getOne<any>(`/suppliers/${id}/ledger`, { signal });
}

export async function fetchSupplierStatement(
  id: string,
  range: { from?: string; to?: string } = {},
  signal?: AbortSignal,
) {
  return getOne<any>(`/suppliers/${id}/statement`, {
    params: cleanParams({ from: range.from, to: range.to }),
    signal,
  });
}

export async function fetchSupplierProducts(id: string, signal?: AbortSignal) {
  return getOne<any[]>(`/suppliers/${id}/products`, { signal });
}

/** Mutation payloads are screen-shaped; keep them loose but explicit. */
export type SupplierPayload = Record<string, unknown>;

export async function createSupplier(body: SupplierPayload) {
  return post<Supplier>("/suppliers", body);
}

export async function updateSupplier(id: string, body: SupplierPayload) {
  return put<Supplier>(`/suppliers/${id}`, body);
}

export async function deleteSupplier(id: string) {
  return del<void>(`/suppliers/${id}`);
}

export async function createSupplierPayment(id: string, body: SupplierPayload) {
  return post<unknown>(`/suppliers/${id}/payments`, body);
}

export async function deleteSupplierPayment(id: string, paymentId: string) {
  return del<void>(`/suppliers/${id}/payments/${paymentId}`);
}
