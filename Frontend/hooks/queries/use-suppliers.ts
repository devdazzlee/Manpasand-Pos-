"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/query/query-keys";
import { STALE_TIME } from "@/lib/query/query-client";
import {
  fetchSuppliers,
  fetchSupplierLedger,
  fetchSupplierPurchases,
  type SupplierQuery,
  type Supplier,
} from "@/lib/api/suppliers";

const EMPTY: Supplier[] = [];

export function useSuppliers(params: SupplierQuery, options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: qk.suppliers.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchSuppliers(params, signal),
    staleTime: STALE_TIME.directory,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });

  return {
    ...query,
    suppliers: query.data?.data ?? EMPTY,
    meta: query.data?.meta ?? null,
    isFirstLoad: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
  };
}

export function useSupplierPurchases(id: string | null) {
  return useQuery({
    queryKey: qk.suppliers.purchases(id ?? ""),
    queryFn: ({ signal }) => fetchSupplierPurchases(id as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id),
  });
}

export function useSupplierLedger(id: string | null) {
  return useQuery({
    queryKey: qk.suppliers.ledger(id ?? ""),
    queryFn: ({ signal }) => fetchSupplierLedger(id as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id),
  });
}
