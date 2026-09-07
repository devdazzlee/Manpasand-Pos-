import { getList, cleanParams } from "./http";

export interface Category {
  id: string;
  name: string;
  is_active?: boolean;
}

/** Sentinel row the POS grid uses for the "All" tab. */
export const ALL_CATEGORY: Category = { id: "all", name: "All" };

export async function fetchCategories(
  params: { page?: number; limit?: number; search?: string } = {},
): Promise<Category[]> {
  const res = await getList<Category>(
    "/categories",
    cleanParams({ page: params.page ?? 1, limit: params.limit ?? 50, search: params.search }),
  );
  return res.data;
}
