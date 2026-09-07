/**
 * Central query-key registry.
 *
 * Every hook derives its key from here so that:
 *  - identical requests anywhere in the tree share ONE cache entry / network call
 *  - invalidation after a mutation can target a whole resource with one call
 *    (`queryClient.invalidateQueries({ queryKey: qk.products.all })`)
 *
 * Filter objects are part of the key — `qk.products.list({ search: "a" })` and
 * `qk.products.list({ search: "ab" })` are different cache entries, which is
 * exactly what we want for search/pagination.
 */

export type ListParams = Record<string, unknown> & {
  page?: number;
  limit?: number;
  search?: string;
};

export const qk = {
  products: {
    all: ["products"] as const,
    list: (params: ListParams = {}) => ["products", "list", params] as const,
    detail: (id: string) => ["products", "detail", id] as const,
    bestSelling: ["products", "best-selling"] as const,
  },
  customers: {
    all: ["customers"] as const,
    list: (params: ListParams = {}) => ["customers", "list", params] as const,
    detail: (id: string) => ["customers", "detail", id] as const,
    purchases: (id: string) => ["customers", id, "purchases"] as const,
    ledger: (id: string) => ["customers", id, "ledger"] as const,
  },
  suppliers: {
    all: ["suppliers"] as const,
    list: (params: ListParams = {}) => ["suppliers", "list", params] as const,
    detail: (id: string) => ["suppliers", "detail", id] as const,
    purchases: (id: string) => ["suppliers", id, "purchases"] as const,
    ledger: (id: string) => ["suppliers", id, "ledger"] as const,
  },
  categories: {
    all: ["categories"] as const,
    list: (params: ListParams = {}) => ["categories", "list", params] as const,
  },
  branches: {
    all: ["branches"] as const,
    list: (params: ListParams = {}) => ["branches", "list", params] as const,
    detail: (id: string) => ["branches", "detail", id] as const,
  },
  orders: {
    all: ["orders"] as const,
    list: (params: ListParams = {}) => ["orders", "list", params] as const,
    detail: (id: string) => ["orders", "detail", id] as const,
  },
  dashboard: {
    stats: ["dashboard", "stats"] as const,
    recentSales: (params: ListParams = {}) => ["dashboard", "recent-sales", params] as const,
  },
  brands: {
    all: ["brands"] as const,
    list: (params: ListParams = {}) => ["brands", "list", params] as const,
  },
  colors: {
    all: ["colors"] as const,
    list: (params: ListParams = {}) => ["colors", "list", params] as const,
  },
  sizes: {
    all: ["sizes"] as const,
    list: (params: ListParams = {}) => ["sizes", "list", params] as const,
  },
  units: {
    all: ["units"] as const,
    list: (params: ListParams = {}) => ["units", "list", params] as const,
  },
  subcategories: {
    all: ["subcategories"] as const,
    list: (params: ListParams = {}) => ["subcategories", "list", params] as const,
  },
} as const;

/**
 * Query-key prefixes whose data is small and worth persisting to localStorage
 * so a reload / offline start is instant. Big lists (products, customers, sales)
 * are deliberately excluded — they live in the Dexie offline layer instead.
 */
export const PERSISTED_KEY_PREFIXES = ["categories", "branches"] as const;
