/** Default page size for list APIs. Keep small so catalogs can grow. */
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function parsePagination(input: {
  page?: unknown;
  limit?: unknown;
}): { page: number; limit: number; skip: number } {
  const pageNum = Number(input.page);
  const limitNum = Number(input.limit);
  const page = Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : DEFAULT_PAGE;
  const rawLimit = Number.isFinite(limitNum) && limitNum > 0 ? Math.floor(limitNum) : DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function paginationMeta(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / Math.max(limit, 1)) || 1),
  };
}
