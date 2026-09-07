import { getList, getOne, post, put, del, cleanParams, type ListResult } from "./http";

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

export interface StatementRange {
  from?: string;
  to?: string;
}

export async function fetchCustomerStatement(
  id: string,
  range: StatementRange = {},
  signal?: AbortSignal,
) {
  return getOne<any>(`/customer/${id}/statement`, {
    params: cleanParams({ from: range.from, to: range.to }),
    signal,
  });
}

export async function fetchCustomerActivity(id: string, signal?: AbortSignal) {
  return getOne<any>(`/customer/${id}/activity`, { params: { limit: 50 }, signal });
}

/** Mutation payloads are screen-shaped; keep them loose but explicit. */
export type CustomerPayload = Record<string, unknown>;

export async function createCustomer(body: CustomerPayload) {
  return post<Customer>("/customer", body);
}

export async function updateCustomer(id: string, body: CustomerPayload) {
  return put<Customer>(`/customer/${id}`, body);
}

export async function deleteCustomer(id: string) {
  return del<void>(`/customer/${id}`);
}

export async function createCustomerPayment(id: string, body: CustomerPayload) {
  return post<unknown>(`/customer/${id}/payments`, body);
}

export async function deleteCustomerPayment(id: string, paymentId: string) {
  return del<void>(`/customer/${id}/payments/${paymentId}`);
}
