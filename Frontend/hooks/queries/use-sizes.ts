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
  fetchSizes,
  createSize,
  updateSize,
  deleteSize,
  type SizeQuery,
  type SizePayload,
  type Size,
} from "@/lib/api/sizes";

const EMPTY: Size[] = [];

export function useSizes(params: SizeQuery = {}) {
  const query = useQuery({
    queryKey: qk.sizes.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchSizes(params, signal),
    staleTime: STALE_TIME.reference,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    sizes: query.data?.data ?? EMPTY,
    meta: query.data?.meta ?? null,
    isFirstLoad: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
  };
}

export function useSizeMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.sizes.all });

  return {
    create: useMutation({
      mutationFn: (body: SizePayload) => createSize(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: SizePayload }) =>
        updateSize(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteSize(id),
      onSuccess: invalidate,
    }),
  };
}
