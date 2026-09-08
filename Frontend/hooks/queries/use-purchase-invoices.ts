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
  fetchPurchaseInvoices,
  fetchPurchaseInvoiceById,
  fetchUninvoicedPurchases,
  createPurchaseInvoice,
  updatePurchaseInvoice,
  deletePurchaseInvoice,
  type PurchaseInvoiceQuery,
  type PurchaseInvoicePayload,
  type PurchaseInvoice,
} from "@/lib/api/purchase-invoices";

const EMPTY: PurchaseInvoice[] = [];

export function usePurchaseInvoices(
  params: PurchaseInvoiceQuery,
  options?: { enabled?: boolean },
) {
  const query = useQuery({
    queryKey: qk.purchaseInvoices.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchPurchaseInvoices(params, signal),
    staleTime: STALE_TIME.volatile,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
  return {
    ...query,
    invoices: query.data?.data ?? EMPTY,
    meta: query.data?.meta ?? null,
    isFirstLoad: query.isPending,
    isRefreshing: query.isFetching && !query.isPending,
  };
}

export function usePurchaseInvoice(id: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.purchaseInvoices.detail(id ?? ""),
    queryFn: ({ signal }) => fetchPurchaseInvoiceById(id as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

export function useUninvoicedPurchases(supplierId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.purchaseInvoices.uninvoiced(supplierId ?? ""),
    queryFn: ({ signal }) => fetchUninvoicedPurchases(supplierId as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(supplierId) && (options?.enabled ?? true),
  });
}

export function usePurchaseInvoiceMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.purchaseInvoices.all });
    qc.invalidateQueries({ queryKey: qk.suppliers.all });
    qc.invalidateQueries({ queryKey: qk.purchaseOrders.all });
  };
  return {
    create: useMutation({
      mutationFn: (body: PurchaseInvoicePayload) => createPurchaseInvoice(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<PurchaseInvoicePayload> }) =>
        updatePurchaseInvoice(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => deletePurchaseInvoice(id), onSuccess: invalidate }),
  };
}
