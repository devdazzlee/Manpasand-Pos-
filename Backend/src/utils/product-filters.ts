import { Prisma, StitchType } from '@prisma/client';

/**
 * Catalog filters shared by every report: vendor (supplier), category,
 * subcategory and stitched/unstitched. Each accepts several values.
 */
export type ProductFilters = {
  categoryIds: string[];
  subcategoryIds: string[];
  supplierIds: string[];
  stitchTypes: StitchType[];
};

const STITCH_TYPES = new Set<string>(Object.values(StitchType));

/** Accepts `a,b`, repeated keys (`?x=a&x=b`) or a single value. */
const listParam = (...values: unknown[]): string[] => {
  const out = new Set<string>();
  for (const value of values) {
    const parts = Array.isArray(value) ? value : [value];
    for (const part of parts) {
      if (typeof part !== 'string') continue;
      for (const piece of part.split(',')) {
        const trimmed = piece.trim();
        if (trimmed) out.add(trimmed);
      }
    }
  }
  return [...out];
};

/** Reads the filters from a request query; legacy single-id keys still work. */
export const parseProductFilters = (query: Record<string, unknown>): ProductFilters => ({
  categoryIds: listParam(query.categoryIds, query.categoryId),
  subcategoryIds: listParam(query.subcategoryIds, query.subcategoryId),
  supplierIds: listParam(query.supplierIds, query.vendorIds),
  stitchTypes: listParam(query.stitchTypes, query.stitchType)
    .map((value) => value.toUpperCase())
    .filter((value): value is StitchType => STITCH_TYPES.has(value)),
});

export const hasProductFilters = (f?: ProductFilters | null): f is ProductFilters =>
  Boolean(f && (f.categoryIds.length || f.subcategoryIds.length || f.supplierIds.length || f.stitchTypes.length));

export const productFilterWhere = (f?: ProductFilters | null): Prisma.ProductWhereInput => {
  if (!hasProductFilters(f)) return {};
  return {
    ...(f.categoryIds.length ? { category_id: { in: f.categoryIds } } : {}),
    ...(f.subcategoryIds.length ? { subcategory_id: { in: f.subcategoryIds } } : {}),
    ...(f.supplierIds.length ? { supplier_id: { in: f.supplierIds } } : {}),
    ...(f.stitchTypes.length ? { stitch_type: { in: f.stitchTypes } } : {}),
  };
};

/** Same filters as raw SQL `AND ...` clauses against a Product alias. */
export const productFilterSql = (f: ProductFilters | null | undefined, alias = 'p'): Prisma.Sql => {
  if (!hasProductFilters(f)) return Prisma.empty;
  const col = (name: string) => Prisma.raw(`${alias}."${name}"`);
  const clauses: Prisma.Sql[] = [];
  if (f.categoryIds.length) clauses.push(Prisma.sql`AND ${col('category_id')} IN (${Prisma.join(f.categoryIds)})`);
  if (f.subcategoryIds.length) clauses.push(Prisma.sql`AND ${col('subcategory_id')} IN (${Prisma.join(f.subcategoryIds)})`);
  if (f.supplierIds.length) clauses.push(Prisma.sql`AND ${col('supplier_id')} IN (${Prisma.join(f.supplierIds)})`);
  if (f.stitchTypes.length) {
    clauses.push(Prisma.sql`AND ${col('stitch_type')}::text IN (${Prisma.join(f.stitchTypes)})`);
  }
  return Prisma.join(clauses, ' ');
};

/** In-memory version of the same filters, for rows already loaded. */
export const productMatchesFilters = (
  f: ProductFilters | null | undefined,
  p: { category_id: string; subcategory_id: string | null; supplier_id: string | null; stitch_type: StitchType | null },
): boolean => {
  if (!hasProductFilters(f)) return true;
  if (f.categoryIds.length && !f.categoryIds.includes(p.category_id)) return false;
  if (f.subcategoryIds.length && !(p.subcategory_id && f.subcategoryIds.includes(p.subcategory_id))) return false;
  if (f.supplierIds.length && !(p.supplier_id && f.supplierIds.includes(p.supplier_id))) return false;
  if (f.stitchTypes.length && !(p.stitch_type && f.stitchTypes.includes(p.stitch_type))) return false;
  return true;
};
