/**
 * TanStack Query client, tuned for a POS.
 *
 * Why these defaults:
 *  - `refetchOnWindowFocus: false` — a cashier tabs between windows constantly;
 *    refetching every time would hammer the server and flicker the grid.
 *  - `retry` skips 4xx — a 400/401/404 will not fix itself on a second try.
 *  - `staleTime` is short by default but overridden per-resource (see
 *    `hooks/queries/*`): reference data (categories, branches, units…) is stale
 *    after 15 min, product/customer lists after ~45 s.
 */

import { QueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";

/** Bump when the shape of any cached query changes, to discard old persisted data. */
export const QUERY_CACHE_VERSION = "v1";

export const STALE_TIME = {
  /** Rarely changes during a shift: categories, branches, units, taxes, brands… */
  reference: 15 * 60_000,
  /** Changes as stock/prices move, but not every second. */
  catalog: 45_000,
  /** Customers, suppliers. */
  directory: 2 * 60_000,
  /** Dashboards, ledgers, reports — always want it fresh-ish. */
  volatile: 20_000,
} as const;

function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as AxiosError)?.response?.status;
  if (status && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME.volatile,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: shouldRetry,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
