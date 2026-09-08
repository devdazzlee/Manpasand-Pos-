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
  fetchExpenses,
  fetchExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  approveExpense,
  rejectExpense,
  fetchExpenseReport,
  fetchExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  toggleExpenseCategory,
  deleteExpenseCategory,
  fetchRecurringExpenses,
  createRecurringExpense,
  updateRecurringExpense,
  toggleRecurringExpense,
  deleteRecurringExpense,
  runRecurringExpenses,
  type ExpenseQuery,
  type ExpensePayload,
  type Expense,
  type RecurringExpensePayload,
} from "@/lib/api/expenses";

const EMPTY_EXPENSES: Expense[] = [];

/* ------------------------------ expenses ------------------------------ */

export function useExpenses(params: ExpenseQuery) {
  const query = useQuery({
    queryKey: qk.expenses.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchExpenses(params, signal),
    staleTime: STALE_TIME.volatile,
    placeholderData: keepPreviousData,
  });
  return {
    ...query,
    expenses: query.data?.data ?? EMPTY_EXPENSES,
    meta: query.data?.meta ?? null,
    isFirstLoad: query.isPending,
    isRefreshing: query.isFetching && !query.isPending,
  };
}

export function useExpense(id: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.expenses.detail(id ?? ""),
    queryFn: ({ signal }) => fetchExpenseById(id as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

export function useExpenseReport(
  range: { from?: string; to?: string },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: qk.expenses.report(range as Record<string, unknown>),
    queryFn: ({ signal }) => fetchExpenseReport(range, signal),
    staleTime: STALE_TIME.volatile,
    enabled: options?.enabled ?? true,
  });
}

export function useExpenseMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.expenses.all });
  return {
    create: useMutation({
      mutationFn: (body: ExpensePayload) => createExpense(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<ExpensePayload> }) =>
        updateExpense(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => deleteExpense(id), onSuccess: invalidate }),
    approve: useMutation({ mutationFn: (id: string) => approveExpense(id), onSuccess: invalidate }),
    reject: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason?: string }) => rejectExpense(id, reason),
      onSuccess: invalidate,
    }),
  };
}

/* ----------------------------- categories ----------------------------- */

export function useExpenseCategories(params: { search?: string; isActive?: boolean } = {}) {
  const query = useQuery({
    queryKey: [...qk.expenses.categories, params] as const,
    queryFn: () => fetchExpenseCategories(params),
    staleTime: STALE_TIME.reference,
  });
  return { ...query, categories: query.data ?? [] };
}

export function useExpenseCategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.expenses.categories });
    qc.invalidateQueries({ queryKey: qk.expenses.all });
  };
  return {
    create: useMutation({ mutationFn: createExpenseCategory, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateExpenseCategory>[1] }) =>
        updateExpenseCategory(id, body),
      onSuccess: invalidate,
    }),
    toggle: useMutation({ mutationFn: (id: string) => toggleExpenseCategory(id), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id: string) => deleteExpenseCategory(id), onSuccess: invalidate }),
  };
}

/* ------------------------ recurring expenses ------------------------ */

export function useRecurringExpenses(params: { isActive?: boolean } = {}) {
  const query = useQuery({
    queryKey: [...qk.expenses.recurring, params] as const,
    queryFn: () => fetchRecurringExpenses(params),
    staleTime: STALE_TIME.directory,
  });
  return { ...query, recurring: query.data ?? [] };
}

export function useRecurringExpenseMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.expenses.recurring });
    qc.invalidateQueries({ queryKey: qk.expenses.all });
  };
  return {
    create: useMutation({
      mutationFn: (body: RecurringExpensePayload) => createRecurringExpense(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<RecurringExpensePayload> }) =>
        updateRecurringExpense(id, body),
      onSuccess: invalidate,
    }),
    toggle: useMutation({ mutationFn: (id: string) => toggleRecurringExpense(id), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id: string) => deleteRecurringExpense(id), onSuccess: invalidate }),
    run: useMutation({ mutationFn: () => runRecurringExpenses(), onSuccess: invalidate }),
  };
}
