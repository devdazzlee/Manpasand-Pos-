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
  fetchWebsiteOrders,
  fetchWebsiteOrderById,
  updateWebsiteOrderStatus,
  reopenWebsiteOrder,
  deleteWebsiteOrder,
  type WebsiteOrdersQuery,
  type WebsiteOrderRecord,
} from "@/lib/api/website-orders";

const EMPTY: WebsiteOrderRecord[] = [];

export function useWebsiteOrders(params: WebsiteOrdersQuery) {
  const query = useQuery({
    queryKey: qk.websiteOrders.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchWebsiteOrders(params, signal),
    staleTime: STALE_TIME.volatile,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    orders: query.data ?? EMPTY,
    isFirstLoad: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
  };
}

/** Website-order detail — gate with `enabled` so it only loads while the sheet is open. */
export function useWebsiteOrder(id: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.websiteOrders.detail(id ?? ""),
    queryFn: ({ signal }) => fetchWebsiteOrderById(id as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

export function useWebsiteOrderMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.websiteOrders.all });

  return {
    setStatus: useMutation({
      mutationFn: ({ id, status }: { id: string; status: string }) =>
        updateWebsiteOrderStatus(id, status),
      onSuccess: invalidate,
    }),
    reopen: useMutation({
      mutationFn: (id: string) => reopenWebsiteOrder(id),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteWebsiteOrder(id),
      onSuccess: invalidate,
    }),
  };
}
