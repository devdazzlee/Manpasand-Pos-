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
  fetchPurchaseReturns,
  fetchPurchaseReturnById,
  createPurchaseReturn,
  cancelPurchaseReturn,
  type PurchaseReturnQuery,
  type PurchaseReturnPayload,
  type PurchaseReturn,
} from "@/lib/api/purchase-returns";

const EMPTY: PurchaseReturn[] = [];

export function usePurchaseReturns(params: PurchaseReturnQuery) {
  const query = useQuery({
    queryKey: qk.purchaseReturns.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchPurchaseReturns(params, signal),
    staleTime: STALE_TIME.volatile,
    placeholderData: keepPreviousData,
  });
  return {
    ...query,
    purchaseReturns: query.data?.data ?? EMPTY,
    meta: query.data?.meta ?? null,
    isFirstLoad: query.isPending,
    isRefreshing: query.isFetching && !query.isPending,
  };
}

export function usePurchaseReturn(id: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.purchaseReturns.detail(id ?? ""),
    queryFn: ({ signal }) => fetchPurchaseReturnById(id as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

export function usePurchaseReturnMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.purchaseReturns.all });
    qc.invalidateQueries({ queryKey: qk.suppliers.all });
  };
  return {
    create: useMutation({
      mutationFn: (body: PurchaseReturnPayload) => createPurchaseReturn(body),
      onSuccess: invalidate,
    }),
    cancel: useMutation({ mutationFn: (id: string) => cancelPurchaseReturn(id), onSuccess: invalidate }),
  };
}
