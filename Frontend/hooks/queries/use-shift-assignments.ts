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
  fetchShiftAssignments,
  createShiftAssignment,
  updateShiftAssignment,
  endShiftAssignment,
  deleteShiftAssignment,
  type ShiftAssignmentQuery,
  type ShiftAssignmentPayload,
  type ShiftAssignmentRecord,
} from "@/lib/api/shift-assignments";

const EMPTY: ShiftAssignmentRecord[] = [];

export function useShiftAssignments(params: ShiftAssignmentQuery = {}) {
  const query = useQuery({
    queryKey: qk.shiftAssignments.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchShiftAssignments(params, signal),
    staleTime: STALE_TIME.volatile,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    shiftAssignments: query.data?.data ?? EMPTY,
    meta: query.data?.meta ?? null,
    summary: query.data?.summary ?? null,
    isFirstLoad: query.isPending || query.isPlaceholderData,
    isRefreshing: query.isFetching && !query.isPending && !query.isPlaceholderData,
  };
}

export function useShiftAssignmentMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.shiftAssignments.all });
    // shift changes carry an employee's sales/coverage — keep the roster fresh.
    qc.invalidateQueries({ queryKey: qk.employees.all });
  };

  return {
    create: useMutation({
      mutationFn: (body: ShiftAssignmentPayload) => createShiftAssignment(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        body,
      }: {
        id: string;
        body: ShiftAssignmentPayload;
      }) => updateShiftAssignment(id, body),
      onSuccess: invalidate,
    }),
    endShift: useMutation({
      mutationFn: ({ id, body }: { id: string; body?: ShiftAssignmentPayload }) =>
        endShiftAssignment(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteShiftAssignment(id),
      onSuccess: invalidate,
    }),
  };
}
