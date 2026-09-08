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
  fetchSuppliers,
  fetchSupplierLedger,
  fetchSupplierPurchases,
  fetchSupplierStatement,
  fetchSupplierProducts,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  createSupplierPayment,
  deleteSupplierPayment,
  type SupplierPayload,
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
    isFirstLoad: query.isPending || query.isPlaceholderData,
    isRefreshing: query.isFetching && !query.isPending && !query.isPlaceholderData,
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

export function useSupplierStatement(
  id: string | null,
  range: { from?: string; to?: string },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...qk.suppliers.detail(id ?? ""), "statement", range] as const,
    queryFn: ({ signal }) => fetchSupplierStatement(id as string, range, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

export function useSupplierProducts(id: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...qk.suppliers.detail(id ?? ""), "products"] as const,
    queryFn: ({ signal }) => fetchSupplierProducts(id as string, signal),
    staleTime: STALE_TIME.directory,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

/**
 * Create / update / delete a supplier, plus ledger payment writes. Every
 * success invalidates the whole `suppliers` key so the list, purchases and
 * ledger queries all refetch.
 */
export function useSupplierMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.suppliers.all });

  return {
    create: useMutation({
      mutationFn: (body: SupplierPayload) => createSupplier(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: SupplierPayload }) =>
        updateSupplier(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteSupplier(id),
      onSuccess: invalidate,
    }),
    addPayment: useMutation({
      mutationFn: ({ id, body }: { id: string; body: SupplierPayload }) =>
        createSupplierPayment(id, body),
      onSuccess: invalidate,
    }),
    deletePayment: useMutation({
      mutationFn: ({ id, paymentId }: { id: string; paymentId: string }) =>
        deleteSupplierPayment(id, paymentId),
      onSuccess: invalidate,
    }),
  };
}
