import { getList, getOne, cleanParams, type ListResult } from "./http";
import { getBranchScopeParam } from "@/lib/session";
import { mapApiProductToStoreProduct } from "@/lib/store";
import { offlineDB } from "@/lib/offline-db";

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

export interface ProductCostHistory {
  product: { id: string; name: string; sku: string | null; code: string | null; purchase_rate: number };
  summary: {
    receiptCount: number;
    totalQty: number;
    totalValue: number;
    latestCost: number;
    weightedAvgCost: number;
    minCost: number;
    maxCost: number;
    firstCost: number;
  };
  entries: {
    id: string;
    purchase_date: string;
    supplier: { id: string; name: string } | null;
    branch: { id: string; name: string } | null;
    quantity: number;
    unit_cost: number;
    line_total: number;
    invoice_ref: string | null;
    running_qty: number;
    weighted_avg_cost: number;
  }[];
}

export function fetchProductCostHistory(id: string, signal?: AbortSignal) {
  return getOne<ProductCostHistory>(`/products/${id}/cost-history`, { signal });
}

/**
 * The whole sellable POS catalog (active + display-on-pos), fetched once and
 * cached for the session. The selling screen filters this in memory so search
 * and category switches are instant — no per-keystroke server round trip.
 *
 * Hits the slim `/products/pos-catalog` projection (no images / description /
 * brand-supplier-tax joins), returns the entire catalog in one response, and
 * mirrors the raw rows into IndexedDB so a reload / offline start is instant.
 */
export async function fetchAllPosProducts(): Promise<PosProduct[]> {
  const res = await getList<any>(
    "/products/pos-catalog",
    cleanParams({ ...getBranchScopeParam() }),
  );
  void offlineDB.saveProducts(res.data).catch(() => {});
  return res.data.map(mapApiProductToStoreProduct);
}

/**
 * Last-known POS catalog from IndexedDB — used to paint the sale grid instantly
 * on load while the network copy revalidates in the background.
 */
export async function readPosCatalogCache(): Promise<PosProduct[]> {
  try {
    const rows = await offlineDB.getProducts();
    return rows
      .map((r: any) => mapApiProductToStoreProduct(r.data ?? r))
      .filter((p) => p.is_active !== false && p.display_on_pos !== false);
  } catch {
    return [];
  }
}
