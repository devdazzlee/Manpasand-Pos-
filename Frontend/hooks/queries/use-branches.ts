"use client";

import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/query/query-keys";
import { STALE_TIME } from "@/lib/query/query-client";
import { fetchBranches, fetchBranchById } from "@/lib/api/branches";

export function useBranches({ isActive, enabled = true }: { isActive?: boolean; enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: qk.branches.list({ isActive }),
    queryFn: () => fetchBranches({ isActive }),
    staleTime: STALE_TIME.reference,
    enabled,
  });
  return { ...query, branches: query.data ?? [] };
}

export function useBranch(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.branches.detail(id ?? ""),
    queryFn: ({ signal }) => fetchBranchById(id as string, signal),
    staleTime: STALE_TIME.reference,
    enabled: Boolean(id),
  });
}
