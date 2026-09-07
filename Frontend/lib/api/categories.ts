import apiClient from "@/lib/apiClient";
import { getList, post, del, cleanParams } from "./http";

export interface Category {
  id: string;
  name: string;
  is_active?: boolean;
  /** Admin table extras — present on the list payload, optional on the sentinel. */
  slug?: string;
  image?: string;
  description?: string;
  product_count?: number;
  productCount?: number;
  display_on_branches?: string[];
  display_on_pos?: boolean;
  created_at?: string;
}

/** Sentinel row the POS grid uses for the "All" tab. */
export const ALL_CATEGORY: Category = { id: "all", name: "All" };

/** Mutation payloads are screen-shaped; keep them loose but explicit. */
export type CategoryPayload = Record<string, unknown>;

export async function fetchCategories(
  params: { page?: number; limit?: number; search?: string } = {},
): Promise<Category[]> {
  const res = await getList<Category>(
    "/categories",
    cleanParams({
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      search: params.search,
    }),
  );
  return res.data;
}

export async function createCategory(body: CategoryPayload) {
  return post<Category>("/categories", body);
}

export async function updateCategory(id: string, body: CategoryPayload) {
  const res = await apiClient.patch(`/categories/${id}`, body);
  return (res.data?.data ?? res.data) as Category;
}

export async function deleteCategory(id: string) {
  return del<void>(`/categories/${id}`);
}

export async function toggleCategoryStatus(id: string) {
  const res = await apiClient.patch(`/categories/${id}/toggle-status`);
  return (res.data?.data ?? res.data) as Category;
}

/** Uploads an image file and returns its hosted URL. */
export async function uploadCategoryImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await apiClient.post("/categories/upload-image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
  return res.data.data.url as string;
}
