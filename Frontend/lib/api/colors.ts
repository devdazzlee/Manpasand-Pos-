import apiClient from "@/lib/apiClient";
import { getList, post, del, cleanParams, type ListResult } from "./http";

export interface Color {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  product_count: number;
  created_at: string;
}

export interface ColorQuery {
  search?: string;
  page?: number;
  limit?: number;
}

/** Mutation payloads are screen-shaped; keep them loose but explicit. */
export type ColorPayload = Record<string, unknown>;

export async function fetchColors(
  q: ColorQuery = {},
  signal?: AbortSignal,
): Promise<ListResult<Color>> {
  return getList<Color>(
    "/colors",
    cleanParams({
      page: q.page,
      limit: q.limit,
      search: q.search?.trim() || undefined,
    }),
    signal,
  );
}

export async function createColor(body: ColorPayload) {
  return post<Color>("/colors", body);
}

export async function updateColor(id: string, body: ColorPayload) {
  const res = await apiClient.patch(`/colors/${id}`, body);
  return (res.data?.data ?? res.data) as Color;
}

export async function deleteColor(id: string) {
  return del<void>(`/colors/${id}`);
}
