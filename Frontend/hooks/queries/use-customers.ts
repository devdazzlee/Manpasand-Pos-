"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { qk } from "@/lib/query/query-keys";
import { STALE_TIME } from "@/lib/query/query-client";
import {
  fetchCustomers,
  fetchCustomerLedger,
  fetchCustomerPurchases,
  fetchCustomerStatement,
  fetchCustomerActivity,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  createCustomerPayment,
  deleteCustomerPayment,
  type CustomerPayload,
  type CustomerQuery,
  type Customer,
  type StatementRange,
} from "@/lib/api/customers";

const EMPTY: Customer[] = [];

export function useCustomers(params: CustomerQuery, options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: qk.customers.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchCustomers(params, signal),
    staleTime: STALE_TIME.directory,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });

  return {
    ...query,
    customers: query.data?.data ?? EMPTY,
    meta: query.data?.meta ?? null,
    isFirstLoad: query.isPending || query.isPlaceholderData,
    isRefreshing: query.isFetching && !query.isPending && !query.isPlaceholderData,
  };
}

/** Lazily loaded when a customer detail panel opens; cached per customer. */
export function useCustomerPurchases(id: string | null) {
  return useQuery({
    queryKey: qk.customers.purchases(id ?? ""),
    queryFn: ({ signal }) => fetchCustomerPurchases(id as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id),
  });
}

export function useCustomerLedger(id: string | null) {
  return useQuery({
    queryKey: qk.customers.ledger(id ?? ""),
    queryFn: ({ signal }) => fetchCustomerLedger(id as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id),
  });
}

/** Date-ranged printable statement. Only fetched while the statement view is open. */
export function useCustomerStatement(
  id: string | null,
  range: StatementRange,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...qk.customers.detail(id ?? ""), "statement", range] as const,
    queryFn: ({ signal }) => fetchCustomerStatement(id as string, range, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

export function useCustomerActivity(id: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...qk.customers.detail(id ?? ""), "activity"] as const,
    queryFn: ({ signal }) => fetchCustomerActivity(id as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

/**
 * Create / update / delete a customer, plus ledger payment writes. Every
 * success invalidates the whole `customers` key so the list, purchases and
 * ledger queries all refetch.
 */
export function useCustomerMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.customers.all });

  return {
    create: useMutation({
      mutationFn: (body: CustomerPayload) => createCustomer(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: CustomerPayload }) =>
        updateCustomer(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteCustomer(id),
      onSuccess: invalidate,
    }),
    addPayment: useMutation({
      mutationFn: ({ id, body }: { id: string; body: CustomerPayload }) =>
        createCustomerPayment(id, body),
      onSuccess: invalidate,
    }),
    deletePayment: useMutation({
      mutationFn: ({ id, paymentId }: { id: string; paymentId: string }) =>
        deleteCustomerPayment(id, paymentId),
      onSuccess: invalidate,
    }),
  };
}
