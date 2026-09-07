"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/query/query-keys";
import { STALE_TIME } from "@/lib/query/query-client";
import {
  fetchOrders,
  fetchOrderById,
  createOrder,
  updateOrderStatus,
  cancelOrder,
  type OrderQuery,
  type Order,
} from "@/lib/api/orders";

const EMPTY: Order[] = [];

export function useOrders(params: OrderQuery = {}) {
  const query = useQuery({
    queryKey: qk.orders.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchOrders(params, signal),
    staleTime: STALE_TIME.volatile,
  });
  return {
    ...query,
    orders: query.data ?? EMPTY,
    isFirstLoad: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
  };
}

/** Order detail — gate with `enabled` so it only loads while the panel is open. */
export function useOrder(id: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.orders.detail(id ?? ""),
    queryFn: ({ signal }) => fetchOrderById(id as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

export function useOrderMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.orders.all });

  return {
    create: useMutation({ mutationFn: createOrder, onSuccess: invalidate }),
    setStatus: useMutation({
      mutationFn: ({ id, status }: { id: string; status: string }) =>
        updateOrderStatus(id, status),
      onSuccess: invalidate,
    }),
    cancel: useMutation({ mutationFn: (id: string) => cancelOrder(id), onSuccess: invalidate }),
  };
}
