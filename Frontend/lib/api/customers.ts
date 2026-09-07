import { getList, getOne, cleanParams, type ListResult } from "./http";

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface CustomerQuery {
  search?: string;
  page?: number;
  limit?: number;
  isActive?: boolean;
  createdAfter?: string;
}

export async function fetchCustomers(
  q: CustomerQuery,
  signal?: AbortSignal,
): Promise<ListResult<Customer>> {
  return getList<Customer>(
    "/customer",
    cleanParams({
      page: q.page ?? 1,
      limit: q.limit ?? 20,
      search: q.search?.trim() || undefined,
      is_active: q.isActive,
      created_after: q.createdAfter,
    }),
    signal,
  );
}

export async function fetchCustomerPurchases(id: string, signal?: AbortSignal) {
  return getOne<any>(`/customer/${id}/purchases`, { signal });
}

export async function fetchCustomerLedger(id: string, signal?: AbortSignal) {
  return getOne<any>(`/customer/${id}/ledger`, { signal });
}
