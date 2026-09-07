"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/query/query-keys";
import { STALE_TIME } from "@/lib/query/query-client";
import {
  fetchEmployeeTypes,
  createEmployeeType,
  updateEmployeeType,
  deleteEmployeeType,
  toggleEmployeeTypeStatus,
  type EmployeeType,
  type EmployeeTypePayload,
} from "@/lib/api/employee-types";

const EMPTY: EmployeeType[] = [];

export function useEmployeeTypes() {
  const query = useQuery({
    queryKey: qk.employeeTypes.list(),
    queryFn: ({ signal }) => fetchEmployeeTypes(signal),
    staleTime: STALE_TIME.reference,
  });
  return {
    ...query,
    employeeTypes: query.data ?? EMPTY,
    isFirstLoad: query.isPending,
    isRefreshing: query.isFetching && !query.isPending,
  };
}

export function useEmployeeTypeMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: qk.employeeTypes.all });

  return {
    create: useMutation({
      mutationFn: (body: EmployeeTypePayload) => createEmployeeType(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: EmployeeTypePayload }) =>
        updateEmployeeType(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteEmployeeType(id),
      onSuccess: invalidate,
    }),
    toggleStatus: useMutation({
      mutationFn: (id: string) => toggleEmployeeTypeStatus(id),
      onSuccess: invalidate,
    }),
  };
}
