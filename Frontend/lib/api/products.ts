import { getList, getOne, cleanParams, type ListResult } from "./http";
import { collectPaginatedData } from "@/lib/paginated-fetch";
import { getBranchScopeParam } from "@/lib/session";
import { mapApiProductToStoreProduct } from "@/lib/store";

/** The normalised product shape the POS screens consume. */
export type PosProduct = ReturnType<typeof mapApiProductToStoreProduct>;

export interface ProductQuery {
  search?: string;
  categoryId?: string;
  subcategoryId?: string;
  page?: number;
  limit?: number;
  isActive?: boolean;
  displayOnPos?: boolean;
  isFeatured?: boolean;
  stockStatus?: "out" | "low";
}

function toParams(q: ProductQuery): Record<string, unknown> {
  return cleanParams({
    page: q.page ?? 1,
    limit: q.limit ?? 20,
    search: q.search?.trim() || undefined,
    category_id: q.categoryId,
    subcategory_id: q.subcategoryId,
    is_active: q.isActive,
    display_on_pos: q.displayOnPos,
    is_featured: q.isFeatured,
    stock_status: q.stockStatus,
    ...getBranchScopeParam(),
  });
}

export async function fetchProducts(
  q: ProductQuery,
  signal?: AbortSignal,
): Promise<ListResult<PosProduct>> {
  const raw = await getList<any>("/products", toParams(q), signal);
  return { data: raw.data.map(mapApiProductToStoreProduct), meta: raw.meta };
}

export async function fetchProductById(id: string, signal?: AbortSignal): Promise<PosProduct> {
  const raw = await getOne<any>(`/products/${id}`, { signal });
  return mapApiProductToStoreProduct(raw);
}

/**
 * The whole sellable POS catalog (active + display-on-pos), fetched once and
 * cached for the session. The selling screen filters this in memory so search
 * and category switches are instant — no per-keystroke server round trip.
 */
export async function fetchAllPosProducts(): Promise<PosProduct[]> {
  const raw = await collectPaginatedData<any>(
    "/products",
    cleanParams({ is_active: true, display_on_pos: true, ...getBranchScopeParam() }),
    { limit: 200, maxPages: 100 },
  );
  return raw.map(mapApiProductToStoreProduct);
}
