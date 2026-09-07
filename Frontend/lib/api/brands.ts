import apiClient from "@/lib/apiClient";
import { getList, post, del, cleanParams, type ListResult } from "./http";

export interface Brand {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  product_count: number;
  created_at: string;
}

export interface BrandQuery {
  search?: string;
  page?: number;
  limit?: number;
}

/** Mutation payloads are screen-shaped; keep them loose but explicit. */
export type BrandPayload = Record<string, unknown>;

export async function fetchBrands(
  q: BrandQuery = {},
  signal?: AbortSignal,
): Promise<ListResult<Brand>> {
  return getList<Brand>(
    "/brands",
    cleanParams({
      page: q.page,
      limit: q.limit,
      search: q.search?.trim() || undefined,
    }),
    signal,
  );
}

export async function createBrand(body: BrandPayload) {
  return post<Brand>("/brands", body);
}

export async function updateBrand(id: string, body: BrandPayload) {
  const res = await apiClient.patch(`/brands/${id}`, body);
  return (res.data?.data ?? res.data) as Brand;
}

export async function deleteBrand(id: string) {
  return del<void>(`/brands/${id}`);
}
