import apiClient from "@/lib/apiClient";
import { getList, post, del, cleanParams, type ListResult } from "./http";

export interface Size {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  display_on_pos?: boolean;
  product_count: number;
  created_at: string;
}

export interface SizeQuery {
  search?: string;
  page?: number;
  limit?: number;
}

/** Mutation payloads are screen-shaped; keep them loose but explicit. */
export type SizePayload = Record<string, unknown>;

export async function fetchSizes(
  q: SizeQuery = {},
  signal?: AbortSignal,
): Promise<ListResult<Size>> {
  return getList<Size>(
    "/sizes",
    cleanParams({
      page: q.page,
      limit: q.limit,
      search: q.search?.trim() || undefined,
    }),
    signal,
  );
}

export async function createSize(body: SizePayload) {
  return post<Size>("/sizes", body);
}

export async function updateSize(id: string, body: SizePayload) {
  const res = await apiClient.patch(`/sizes/${id}`, body);
  return (res.data?.data ?? res.data) as Size;
}

export async function deleteSize(id: string) {
  return del<void>(`/sizes/${id}`);
}
