/**
 * Thin typed wrappers over the shared axios client.
 *
 * The backend always answers `{ success, message, data, meta }`. These helpers
 * unwrap that envelope and normalise `meta` so callers get a predictable shape.
 */

import apiClient from "@/lib/apiClient";
import type { AxiosRequestConfig } from "axios";

export interface ListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListResult<T> {
  data: T[];
  meta: ListMeta;
}

function normaliseMeta(raw: any, fallbackCount: number, page = 1, limit = 20): ListMeta {
  return {
    total: Number(raw?.total ?? fallbackCount) || 0,
    page: Number(raw?.page ?? page) || page,
    limit: Number(raw?.limit ?? limit) || limit,
    totalPages: Math.max(1, Number(raw?.totalPages ?? 1) || 1),
  };
}

/** GET a paginated list endpoint. `signal` wires request cancellation to React Query. */
export async function getList<T>(
  url: string,
  params: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<ListResult<T>> {
  const res = await apiClient.get(url, { params, signal });
  const data: T[] = Array.isArray(res.data?.data) ? res.data.data : [];
  const page = Number(params.page ?? 1);
  const limit = Number(params.limit ?? 20);
  return { data, meta: normaliseMeta(res.data?.meta, data.length, page, limit) };
}

/** GET a single resource; returns the unwrapped `data` payload. */
export async function getOne<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await apiClient.get(url, config);
  return (res.data?.data ?? res.data) as T;
}

export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await apiClient.post(url, body, config);
  return (res.data?.data ?? res.data) as T;
}

export async function put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await apiClient.put(url, body, config);
  return (res.data?.data ?? res.data) as T;
}

export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await apiClient.delete(url, config);
  return (res.data?.data ?? res.data) as T;
}

/** Drop `undefined` / `""` params so they don't become `?x=undefined`. */
export function cleanParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}
