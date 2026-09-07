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
  fetchBrands,
  createBrand,
  updateBrand,
  deleteBrand,
  type BrandQuery,
  type BrandPayload,
  type Brand,
} from "@/lib/api/brands";

const EMPTY: Brand[] = [];

export function useBrands(params: BrandQuery = {}) {
  const query = useQuery({
    queryKey: qk.brands.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchBrands(params, signal),
    staleTime: STALE_TIME.reference,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    brands: query.data?.data ?? EMPTY,
    meta: query.data?.meta ?? null,
    isFirstLoad: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
  };
}

export function useBrandMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.brands.all });

  return {
    create: useMutation({
      mutationFn: (body: BrandPayload) => createBrand(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: BrandPayload }) =>
        updateBrand(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteBrand(id),
      onSuccess: invalidate,
    }),
  };
}
