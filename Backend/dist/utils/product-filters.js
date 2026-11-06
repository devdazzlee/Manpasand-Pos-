"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productMatchesFilters = exports.productFilterSql = exports.productFilterWhere = exports.hasProductFilters = exports.parseProductFilters = void 0;
const client_1 = require("@prisma/client");
const STITCH_TYPES = new Set(Object.values(client_1.StitchType));
/** Accepts `a,b`, repeated keys (`?x=a&x=b`) or a single value. */
const listParam = (...values) => {
    const out = new Set();
    for (const value of values) {
        const parts = Array.isArray(value) ? value : [value];
        for (const part of parts) {
            if (typeof part !== 'string')
                continue;
            for (const piece of part.split(',')) {
                const trimmed = piece.trim();
                if (trimmed)
                    out.add(trimmed);
            }
        }
    }
    return [...out];
};
/** Reads the filters from a request query; legacy single-id keys still work. */
const parseProductFilters = (query) => ({
    categoryIds: listParam(query.categoryIds, query.categoryId),
    subcategoryIds: listParam(query.subcategoryIds, query.subcategoryId),
    supplierIds: listParam(query.supplierIds, query.vendorIds),
    stitchTypes: listParam(query.stitchTypes, query.stitchType)
        .map((value) => value.toUpperCase())
        .filter((value) => STITCH_TYPES.has(value)),
});
exports.parseProductFilters = parseProductFilters;
const hasProductFilters = (f) => Boolean(f && (f.categoryIds.length || f.subcategoryIds.length || f.supplierIds.length || f.stitchTypes.length));
exports.hasProductFilters = hasProductFilters;
const productFilterWhere = (f) => {
    if (!(0, exports.hasProductFilters)(f))
        return {};
    return {
        ...(f.categoryIds.length ? { category_id: { in: f.categoryIds } } : {}),
        ...(f.subcategoryIds.length ? { subcategory_id: { in: f.subcategoryIds } } : {}),
        ...(f.supplierIds.length ? { supplier_id: { in: f.supplierIds } } : {}),
        ...(f.stitchTypes.length ? { stitch_type: { in: f.stitchTypes } } : {}),
    };
};
exports.productFilterWhere = productFilterWhere;
/** Same filters as raw SQL `AND ...` clauses against a Product alias. */
const productFilterSql = (f, alias = 'p') => {
    if (!(0, exports.hasProductFilters)(f))
        return client_1.Prisma.empty;
    const col = (name) => client_1.Prisma.raw(`${alias}."${name}"`);
    const clauses = [];
    if (f.categoryIds.length)
        clauses.push(client_1.Prisma.sql `AND ${col('category_id')} IN (${client_1.Prisma.join(f.categoryIds)})`);
    if (f.subcategoryIds.length)
        clauses.push(client_1.Prisma.sql `AND ${col('subcategory_id')} IN (${client_1.Prisma.join(f.subcategoryIds)})`);
    if (f.supplierIds.length)
        clauses.push(client_1.Prisma.sql `AND ${col('supplier_id')} IN (${client_1.Prisma.join(f.supplierIds)})`);
    if (f.stitchTypes.length) {
        clauses.push(client_1.Prisma.sql `AND ${col('stitch_type')}::text IN (${client_1.Prisma.join(f.stitchTypes)})`);
    }
    return client_1.Prisma.join(clauses, ' ');
};
exports.productFilterSql = productFilterSql;
/** In-memory version of the same filters, for rows already loaded. */
const productMatchesFilters = (f, p) => {
    if (!(0, exports.hasProductFilters)(f))
        return true;
    if (f.categoryIds.length && !f.categoryIds.includes(p.category_id))
        return false;
    if (f.subcategoryIds.length && !(p.subcategory_id && f.subcategoryIds.includes(p.subcategory_id)))
        return false;
    if (f.supplierIds.length && !(p.supplier_id && f.supplierIds.includes(p.supplier_id)))
        return false;
    if (f.stitchTypes.length && !(p.stitch_type && f.stitchTypes.includes(p.stitch_type)))
        return false;
    return true;
};
exports.productMatchesFilters = productMatchesFilters;
//# sourceMappingURL=product-filters.js.map