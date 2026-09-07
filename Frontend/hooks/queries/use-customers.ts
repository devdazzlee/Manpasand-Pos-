"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/query/query-keys";
import { STALE_TIME } from "@/lib/query/query-client";
import {
  fetchCustomers,
  fetchCustomerLedger,
  fetchCustomerPurchases,
  type CustomerQuery,
  type Customer,
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
    isFirstLoad: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
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
