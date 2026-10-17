"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stockLookupSchema = exports.stockImportIdSchema = exports.createStockImportSchema = exports.previewStockImportSchema = void 0;
const zod_1 = require("zod");
const cell = zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).nullish();
const row = zod_1.z.object({
    rowNo: zod_1.z.number().int().min(1),
    branch: cell,
    sku: cell,
    name: cell,
    quantity: cell,
    unitCost: cell,
    salePrice: cell,
    category: cell,
    brand: cell,
    size: cell,
    color: cell,
    productId: zod_1.z.string().nullish(),
    skip: zod_1.z.boolean().optional(),
});
const options = zod_1.z.object({
    mode: zod_1.z.enum(['ADD', 'SET']),
    defaultBranchId: zod_1.z.string().nullish(),
    createMissing: zod_1.z.boolean().default(true),
    updateCost: zod_1.z.boolean().default(false),
    fileChecksum: zod_1.z.string().max(128).nullish(),
    sourceReference: zod_1.z.string().max(200).nullish(),
});
exports.previewStockImportSchema = zod_1.z.object({
    body: zod_1.z.object({
        rows: zod_1.z.array(row).min(1, 'The file has no rows').max(20000, 'At most 20,000 rows per import'),
        options,
    }),
});
exports.createStockImportSchema = zod_1.z.object({
    body: zod_1.z.object({
        rows: zod_1.z.array(row).min(1).max(20000),
        options,
        fileName: zod_1.z.string().max(255).nullish(),
        notes: zod_1.z.string().max(500).nullish(),
        stockDate: zod_1.z.string().nullish(),
        allowDuplicate: zod_1.z.boolean().optional(),
    }),
});
exports.stockImportIdSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().min(1) }),
});
exports.stockLookupSchema = zod_1.z.object({
    query: zod_1.z.object({ code: zod_1.z.string().min(1, 'Scan or type a code'), branchId: zod_1.z.string().optional() }),
});
//# sourceMappingURL=stock-import.validation.js.map