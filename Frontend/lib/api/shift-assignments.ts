import apiClient from "@/lib/apiClient";
import { getList, post, del, cleanParams, type ListMeta } from "./http";

export interface ShiftAssignmentRecord {
  id: string;
  employee_id: string;
  employee?: {
    id: string;
    name: string;
    employee_code?: string | null;
    department?: { id: string; name: string } | null;
    employee_type?: { id: string; name: string } | null;
  } | null;
  shift_time: string;
  start_date: string;
  end_date?: string | null;
  sales?: number;
  break_time?: string | null;
  start_time?: string;
  end_time?: string;
  break_hours?: number;
  total_hours?: number;
  status?: "scheduled" | "active" | "completed";
  [key: string]: unknown;
}

export interface ShiftSummary {
  total: number;
  active: number;
  scheduled: number;
  completed: number;
  today: number;
  todayHours: number;
  todaySales: number;
  totalSales: number;
}

/**
 * Every param the shifts screen's `fetchShifts()` sent. `period` is only sent
 * when no explicit date range is set — the screen's rule is reproduced here by
 * the caller, which passes `period: undefined` once `dateFrom`/`dateTo` exist.
 */
export interface ShiftAssignmentQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  period?: string;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ShiftListResult {
  data: ShiftAssignmentRecord[];
  meta: ListMeta;
  summary: ShiftSummary | null;
}

function toParams(q: ShiftAssignmentQuery): Record<string, unknown> {
  return cleanParams({
    page: q.page ?? 1,
    limit: q.limit ?? 20,
    search: q.search?.trim() || undefined,
    status: q.status,
    period: q.period,
    employee_id: q.employeeId,
    date_from: q.dateFrom,
    date_to: q.dateTo,
  });
}

/** `GET /shift-assignment` — envelope carries `meta.summary`. */
export async function fetchShiftAssignments(
  q: ShiftAssignmentQuery = {},
  signal?: AbortSignal,
): Promise<ShiftListResult> {
  const res = await apiClient.get("/shift-assignment", {
    params: toParams(q),
    signal,
  });
  const data: ShiftAssignmentRecord[] = Array.isArray(res.data?.data)
    ? res.data.data
    : [];
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
          total: Number(s.total) || 0,
          active: Number(s.active) || 0,
          scheduled: Number(s.scheduled) || 0,
          completed: Number(s.completed) || 0,
          today: Number(s.today) || 0,
          todayHours: Number(s.todayHours) || 0,
          todaySales: Number(s.todaySales) || 0,
          totalSales: Number(s.totalSales) || 0,
        }
      : null,
  };
}

export type ShiftAssignmentPayload = Record<string, unknown>;

export function createShiftAssignment(body: ShiftAssignmentPayload) {
  return post<ShiftAssignmentRecord>("/shift-assignment", body);
}

export function updateShiftAssignment(id: string, body: ShiftAssignmentPayload) {
  return apiClient
    .patch(`/shift-assignment/${id}`, body)
    .then((r) => r.data?.data ?? r.data);
}

export function endShiftAssignment(id: string, body?: ShiftAssignmentPayload) {
  return apiClient
    .patch(`/shift-assignment/${id}/end`, body ?? {})
    .then((r) => r.data?.data ?? r.data);
}

export function deleteShiftAssignment(id: string) {
  return del<void>(`/shift-assignment/${id}`);
}
