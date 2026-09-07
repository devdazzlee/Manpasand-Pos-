import { getList, getOne, cleanParams, type ListResult } from "./http";

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
