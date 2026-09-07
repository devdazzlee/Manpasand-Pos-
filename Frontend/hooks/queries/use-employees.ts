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
  fetchEmployees,
  fetchEmployeeById,
  fetchEmployeeShiftHistory,
  fetchDepartments,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  reactivateEmployee,
  importEmployees,
  createDepartment,
  endEmployeeCurrentShift,
  type EmployeeQuery,
  type EmployeePayload,
  type Employee,
  type Department,
} from "@/lib/api/employees";

const EMPTY_EMPLOYEES: Employee[] = [];
const EMPTY_DEPARTMENTS: Department[] = [];
const EMPTY_HISTORY: any[] = [];

export function useEmployees(params: EmployeeQuery = {}) {
  const query = useQuery({
    queryKey: qk.employees.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchEmployees(params, signal),
    staleTime: STALE_TIME.directory,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    employees: query.data?.data ?? EMPTY_EMPLOYEES,
    meta: query.data?.meta ?? null,
    isFirstLoad: query.isPending || query.isPlaceholderData,
    isRefreshing: query.isFetching && !query.isPending && !query.isPlaceholderData,
  };
}

/** Employee detail — gate with `enabled` so it only loads while a sheet is open. */
export function useEmployee(
  id: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: qk.employees.detail(id ?? ""),
    queryFn: ({ signal }) => fetchEmployeeById(id as string, signal),
    staleTime: STALE_TIME.directory,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

/** Shift history for one employee — gated on the detail sheet being open. */
export function useEmployeeShiftHistory(
  id: string | null,
  options?: { enabled?: boolean },
) {
  const query = useQuery({
    queryKey: qk.employees.shiftHistory(id ?? ""),
    queryFn: ({ signal }) => fetchEmployeeShiftHistory(id as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
  return { ...query, history: query.data ?? EMPTY_HISTORY };
}

export function useDepartments() {
  const query = useQuery({
    queryKey: qk.employeeDepartments.list(),
    queryFn: ({ signal }) => fetchDepartments(signal),
    staleTime: STALE_TIME.reference,
  });
  return { ...query, departments: query.data ?? EMPTY_DEPARTMENTS };
}

/**
 * Every employee write. Anything that can touch shift state also invalidates
 * `qk.shiftAssignments.all`; department creation invalidates the department key.
 */
export function useEmployeeMutations() {
  const qc = useQueryClient();
  const invalidateEmployees = () =>
    qc.invalidateQueries({ queryKey: qk.employees.all });
  const invalidateWithShifts = () => {
    qc.invalidateQueries({ queryKey: qk.employees.all });
    qc.invalidateQueries({ queryKey: qk.shiftAssignments.all });
  };

  return {
    create: useMutation({
      mutationFn: (body: EmployeePayload) => createEmployee(body),
      onSuccess: invalidateEmployees,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: EmployeePayload }) =>
        updateEmployee(id, body),
      onSuccess: invalidateWithShifts,
    }),
    deactivate: useMutation({
      mutationFn: ({
        id,
        reason,
        status,
      }: {
        id: string;
        reason: string;
        status: string;
      }) => deactivateEmployee(id, { reason, status }),
      onSuccess: invalidateEmployees,
    }),
    reactivate: useMutation({
      mutationFn: (id: string) => reactivateEmployee(id),
      onSuccess: invalidateEmployees,
    }),
    importRows: useMutation({
      mutationFn: (rows: Record<string, unknown>[]) => importEmployees({ rows }),
      onSuccess: invalidateEmployees,
    }),
    createDepartment: useMutation({
      mutationFn: (name: string) => createDepartment({ name }),
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: qk.employeeDepartments.all }),
    }),
    endCurrentShift: useMutation({
      mutationFn: (employeeId: string) => endEmployeeCurrentShift(employeeId),
      onSuccess: invalidateWithShifts,
    }),
  };
}
