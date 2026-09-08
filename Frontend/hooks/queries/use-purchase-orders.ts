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
  fetchPurchaseOrders,
  fetchPurchaseOrderById,
  createPurchaseOrder,
  updatePurchaseOrder,
  setPurchaseOrderStatus,
  cancelPurchaseOrder,
  deletePurchaseOrder,
  receivePurchaseOrder,
  type PurchaseOrderQuery,
  type PurchaseOrderPayload,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from "@/lib/api/purchase-orders";

const EMPTY: PurchaseOrder[] = [];

export function usePurchaseOrders(params: PurchaseOrderQuery) {
  const query = useQuery({
    queryKey: qk.purchaseOrders.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchPurchaseOrders(params, signal),
    staleTime: STALE_TIME.volatile,
    placeholderData: keepPreviousData,
  });
  return {
    ...query,
    purchaseOrders: query.data?.data ?? EMPTY,
    meta: query.data?.meta ?? null,
    isFirstLoad: query.isPending,
    isRefreshing: query.isFetching && !query.isPending,
  };
}

export function usePurchaseOrder(id: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.purchaseOrders.detail(id ?? ""),
    queryFn: ({ signal }) => fetchPurchaseOrderById(id as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

export function usePurchaseOrderMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.purchaseOrders.all });
    qc.invalidateQueries({ queryKey: qk.suppliers.all });
  };
  return {
    create: useMutation({
      mutationFn: (body: PurchaseOrderPayload) => createPurchaseOrder(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<PurchaseOrderPayload> }) =>
        updatePurchaseOrder(id, body),
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: ({ id, status }: { id: string; status: PurchaseOrderStatus }) =>
        setPurchaseOrderStatus(id, status),
      onSuccess: invalidate,
    }),
    cancel: useMutation({ mutationFn: (id: string) => cancelPurchaseOrder(id), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id: string) => deletePurchaseOrder(id), onSuccess: invalidate }),
    receive: useMutation({
      mutationFn: ({
        id,
        body,
      }: {
        id: string;
        body: Parameters<typeof receivePurchaseOrder>[1];
      }) => receivePurchaseOrder(id, body),
      onSuccess: invalidate,
    }),
  };
}
