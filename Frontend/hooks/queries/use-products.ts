"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/query/query-keys";
import { STALE_TIME } from "@/lib/query/query-client";
import {
  fetchProducts,
  fetchAllPosProducts,
  type ProductQuery,
  type PosProduct,
} from "@/lib/api/products";

const EMPTY: PosProduct[] = [];

/**
 * Paginated / filtered product list for the POS grid.
 *
 * - One cache entry per unique filter combo (search + category + page…), so the
 *   same query fired from two places de-dupes to a single request.
 * - `keepPreviousData` keeps the current grid on screen while the next
 *   search/page loads instead of flashing empty.
 * - `signal` cancels the in-flight request when the filters change again.
 */
export function useProducts(params: ProductQuery, options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: qk.products.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchProducts(params, signal),
    staleTime: STALE_TIME.catalog,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });

  return {
    ...query,
    products: query.data?.data ?? EMPTY,
    meta: query.data?.meta ?? null,
    /** True only on the very first load — use for skeletons, not for refetches. */
    isFirstLoad: query.isPending,
    /** True while a background search/page change resolves. */
    isRefreshing: query.isFetching && !query.isPending,
  };
}

/**
 * The full sellable POS catalog, loaded once per session and cached. The selling
 * screen filters this in memory, so product search and category switches are
 * instant instead of one server round trip per keystroke.
 */
export function useAllPosProducts(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: qk.products.posCatalog,
    queryFn: () => fetchAllPosProducts(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: options?.enabled ?? true,
  });

  return {
    ...query,
    products: query.data ?? EMPTY,
    isFirstLoad: query.isPending,
    isRefreshing: query.isFetching && !query.isPending,
  };
}
