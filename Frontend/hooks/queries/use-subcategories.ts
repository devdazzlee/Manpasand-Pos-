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
  fetchSubcategories,
  fetchSubcategoryById,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  toggleSubcategoryStatus,
  type SubcategoryQuery,
  type SubcategoryPayload,
  type Subcategory,
} from "@/lib/api/subcategories";

const EMPTY: Subcategory[] = [];

export function useSubcategories(params: SubcategoryQuery = {}) {
  const query = useQuery({
    queryKey: qk.subcategories.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchSubcategories(params, signal),
    staleTime: STALE_TIME.reference,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    subcategories: query.data?.data ?? EMPTY,
    meta: query.data?.meta ?? null,
    isFirstLoad: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
  };
}

/** Detail record — gated on the sheet being open. */
export function useSubcategory(id: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...qk.subcategories.all, "detail", id ?? ""] as const,
    queryFn: ({ signal }) => fetchSubcategoryById(id as string, signal),
    staleTime: STALE_TIME.reference,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

export function useSubcategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: qk.subcategories.all });

  return {
    create: useMutation({
      mutationFn: (body: SubcategoryPayload) => createSubcategory(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: SubcategoryPayload }) =>
        updateSubcategory(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteSubcategory(id),
      onSuccess: invalidate,
    }),
    toggleStatus: useMutation({
      mutationFn: (id: string) => toggleSubcategoryStatus(id),
      onSuccess: invalidate,
    }),
  };
}
