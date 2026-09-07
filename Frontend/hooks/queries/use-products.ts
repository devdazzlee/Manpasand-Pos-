"use client";

import { useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/query/query-keys";
import { STALE_TIME } from "@/lib/query/query-client";
import {
  fetchProducts,
  fetchAllPosProducts,
  readPosCatalogCache,
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
 * The full sellable POS catalog, loaded once per session and cached.
 *
 * Stale-while-revalidate against IndexedDB: on first mount the grid paints
 * immediately from the last cached catalog (if any) while the network copy
 * fetches in the background. `fetchAllPosProducts` writes each fresh copy back
 * to IndexedDB. The screen filters this list in memory, so product search and
 * category switches are instant instead of one server round trip per keystroke.
 */
export function useAllPosProducts(options?: { enabled?: boolean }) {
  const qc = useQueryClient();
  const enabled = options?.enabled ?? true;

  // Seed from the offline cache once, if React Query has nothing yet. Marked
  // stale (updatedAt: 0) so the network revalidation still runs on mount.
  useEffect(() => {
    if (!enabled) return;
    if (qc.getQueryData(qk.products.posCatalog)) return;
    let cancelled = false;
    readPosCatalogCache().then((cached) => {
      if (cancelled || cached.length === 0) return;
      if (qc.getQueryData(qk.products.posCatalog)) return;
      qc.setQueryData(qk.products.posCatalog, cached, { updatedAt: 0 });
    });
    return () => {
      cancelled = true;
    };
  }, [qc, enabled]);

  const query = useQuery({
    queryKey: qk.products.posCatalog,
    queryFn: () => fetchAllPosProducts(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled,
  });

  return {
    ...query,
    products: query.data ?? EMPTY,
    /** No cached catalog yet — show skeletons. Once seeded from IndexedDB this
     *  is false even while the first network fetch is still in flight. */
    isFirstLoad: query.isPending && (query.data ?? EMPTY).length === 0,
    isRefreshing: query.isFetching && !query.isPending,
  };
}
