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
  fetchUnits,
  createUnit,
  updateUnit,
  deleteUnit,
  type UnitQuery,
  type UnitPayload,
  type Unit,
} from "@/lib/api/units";

const EMPTY: Unit[] = [];

export function useUnits(params: UnitQuery = {}) {
  const query = useQuery({
    queryKey: qk.units.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchUnits(params, signal),
    staleTime: STALE_TIME.reference,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    units: query.data?.data ?? EMPTY,
    meta: query.data?.meta ?? null,
    isFirstLoad: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
  };
}

export function useUnitMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.units.all });

  return {
    create: useMutation({
      mutationFn: (body: UnitPayload) => createUnit(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: UnitPayload }) =>
        updateUnit(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteUnit(id),
      onSuccess: invalidate,
    }),
  };
}
