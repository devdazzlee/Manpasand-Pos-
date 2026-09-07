import apiClient from "@/lib/apiClient";
import { getList, post, put, del, cleanParams, type ListMeta } from "./http";

export interface SalaryRecord {
  id: string;
  employee_id: string;
  employee?: {
    id: string;
    name: string;
    employee_code?: string | null;
    department?: { id: string; name: string } | null;
    employee_type?: { id: string; name: string } | null;
  } | null;
  month: number;
  year: number;
  amount: number | string;
  is_paid: boolean;
  paid_date?: string | null;
  notes?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

export interface SalarySummary {
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  paidCount: number;
  unpaidCount: number;
}

/**
 * Every param the Salaries screen's `fetchSalaries()` sent. `isPaid` maps to the
 * string `is_paid` ("true" / "false"), matching the old query string exactly.
 */
export interface SalaryQuery {
  page?: number;
  limit?: number;
  search?: string;
  /** true → is_paid="true", false → is_paid="false", undefined → omitted */
  isPaid?: boolean;
  month?: string | number;
  year?: string | number;
  employeeId?: string;
}

export interface SalaryListResult {
  data: SalaryRecord[];
  meta: ListMeta;
  summary: SalarySummary | null;
}

function toParams(q: SalaryQuery): Record<string, unknown> {
  return cleanParams({
    page: q.page ?? 1,
    limit: q.limit ?? 20,
    search: typeof q.search === "string" ? q.search.trim() || undefined : undefined,
    is_paid: q.isPaid === undefined ? undefined : q.isPaid ? "true" : "false",
    month: q.month,
    year: q.year,
    employee_id: q.employeeId,
  });
}

/** `GET /salaries` — envelope carries `meta.summary`, which `getList` would drop. */
export async function fetchSalaries(
  q: SalaryQuery = {},
  signal?: AbortSignal,
): Promise<SalaryListResult> {
  const res = await apiClient.get("/salaries", { params: toParams(q), signal });
  const data: SalaryRecord[] = Array.isArray(res.data?.data) ? res.data.data : [];
  const rawMeta = res.data?.meta ?? {};
  const page = Number(q.page ?? 1) || 1;
  const limit = Number(q.limit ?? 20) || 20;
  const s = rawMeta.summary;
  return {
    data,
    meta: {
      total: Number(rawMeta.total ?? data.length) || 0,
      page: Number(rawMeta.page ?? page) || page,
      limit: Number(rawMeta.limit ?? limit) || limit,
      totalPages: Math.max(1, Number(rawMeta.totalPages ?? 1) || 1),
    },
    summary: s
      ? {
          totalAmount: Number(s.totalAmount) || 0,
          paidAmount: Number(s.paidAmount) || 0,
          unpaidAmount: Number(s.unpaidAmount) || 0,
          paidCount: Number(s.paidCount) || 0,
          unpaidCount: Number(s.unpaidCount) || 0,
        }
      : null,
  };
}

export type SalaryPayload = Record<string, unknown>;

export function createSalary(body: SalaryPayload) {
  return post<SalaryRecord>("/salaries", body);
}

export function updateSalary(id: string, body: SalaryPayload) {
  return put<SalaryRecord>(`/salaries/${id}`, body);
}

export function deleteSalary(id: string) {
  return del<void>(`/salaries/${id}`);
}

export function markSalaryPaid(id: string, body?: SalaryPayload) {
  return apiClient
    .patch(`/salaries/${id}/mark-paid`, body ?? { paid_date: new Date().toISOString() })
    .then((r) => r.data);
}

export function markSalaryUnpaid(id: string) {
  return apiClient.patch(`/salaries/${id}/mark-unpaid`).then((r) => r.data);
}
