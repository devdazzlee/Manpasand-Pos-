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
  fetchColors,
  createColor,
  updateColor,
  deleteColor,
  type ColorQuery,
  type ColorPayload,
  type Color,
} from "@/lib/api/colors";

const EMPTY: Color[] = [];

export function useColors(params: ColorQuery = {}) {
  const query = useQuery({
    queryKey: qk.colors.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchColors(params, signal),
    staleTime: STALE_TIME.reference,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    colors: query.data?.data ?? EMPTY,
    meta: query.data?.meta ?? null,
    isFirstLoad: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
  };
}

export function useColorMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.colors.all });

  return {
    create: useMutation({
      mutationFn: (body: ColorPayload) => createColor(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: ColorPayload }) =>
        updateColor(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteColor(id),
      onSuccess: invalidate,
    }),
  };
}
