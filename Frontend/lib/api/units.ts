import apiClient from "@/lib/apiClient";
import { getList, post, del, cleanParams, type ListResult } from "./http";

export interface Unit {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  product_count: number;
  created_at: string;
}

export interface UnitQuery {
  search?: string;
  page?: number;
  limit?: number;
}

/** Mutation payloads are screen-shaped; keep them loose but explicit. */
export type UnitPayload = Record<string, unknown>;

export async function fetchUnits(
  q: UnitQuery = {},
  signal?: AbortSignal,
): Promise<ListResult<Unit>> {
  return getList<Unit>(
    "/units",
    cleanParams({
      page: q.page,
      limit: q.limit,
      search: q.search?.trim() || undefined,
    }),
    signal,
  );
}

export async function createUnit(body: UnitPayload) {
  return post<Unit>("/units", body);
}

export async function updateUnit(id: string, body: UnitPayload) {
  const res = await apiClient.patch(`/units/${id}`, body);
  return (res.data?.data ?? res.data) as Unit;
}

export async function deleteUnit(id: string) {
  return del<void>(`/units/${id}`);
}
