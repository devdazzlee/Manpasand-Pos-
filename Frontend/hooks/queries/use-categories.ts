"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/query/query-keys";
import { STALE_TIME } from "@/lib/query/query-client";
import { fetchCategories, ALL_CATEGORY, type Category } from "@/lib/api/categories";

interface Options {
  /** Prepend the "All" sentinel row (POS grid needs it, admin tables don't). */
  withAll?: boolean;
  limit?: number;
  enabled?: boolean;
}

export function useCategories({ withAll = false, limit = 50, enabled = true }: Options = {}) {
  const query = useQuery({
    queryKey: qk.categories.list({ limit }),
    queryFn: () => fetchCategories({ limit }),
    staleTime: STALE_TIME.reference,
    enabled,
  });

  const categories = useMemo<Category[]>(() => {
    const rows = query.data ?? [];
    return withAll ? [ALL_CATEGORY, ...rows] : rows;
  }, [query.data, withAll]);

  return { ...query, categories };
}
