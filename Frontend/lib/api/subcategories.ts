import apiClient from "@/lib/apiClient";
import { getList, getOne, post, del, cleanParams, type ListResult } from "./http";

export interface Subcategory {
  id: string;
  code: string;
  name: string;
  image?: string;
  display_on_pos: boolean;
  is_active: boolean;
  product_count: number;
  created_at: string;
}

export interface SubcategoryQuery {
  search?: string;
  page?: number;
  limit?: number;
}

/** Mutation payloads are screen-shaped; keep them loose but explicit. */
export type SubcategoryPayload = Record<string, unknown>;

export async function fetchSubcategories(
  q: SubcategoryQuery = {},
  signal?: AbortSignal,
): Promise<ListResult<Subcategory>> {
  return getList<Subcategory>(
    "/subcategories",
    cleanParams({
      page: q.page,
      limit: q.limit,
      search: q.search?.trim() || undefined,
    }),
    signal,
  );
}

export async function fetchSubcategoryById(id: string, signal?: AbortSignal) {
  return getOne<Subcategory>(`/subcategories/${id}`, { signal });
}

export async function createSubcategory(body: SubcategoryPayload) {
  return post<Subcategory>("/subcategories", body);
}

export async function updateSubcategory(id: string, body: SubcategoryPayload) {
  const res = await apiClient.patch(`/subcategories/${id}`, body);
  return (res.data?.data ?? res.data) as Subcategory;
}

export async function deleteSubcategory(id: string) {
  return del<void>(`/subcategories/${id}`);
}

export async function toggleSubcategoryStatus(id: string) {
  const res = await apiClient.patch(`/subcategories/${id}/toggle-status`);
  return (res.data?.data ?? res.data) as Subcategory;
}
