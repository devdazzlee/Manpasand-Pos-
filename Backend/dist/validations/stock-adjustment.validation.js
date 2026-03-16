"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAdjustmentsSchema = exports.createAdjustmentSchema = void 0;
const zod_1 = require("zod");
exports.createAdjustmentSchema = zod_1.z.object({
    body: zod_1.z.object({
        productId: zod_1.z.string().min(1, 'Product is required'),
        branchId: zod_1.z.string().min(1, 'Branch is required'),
        systemQuantity: zod_1.z.number().min(0, 'System quantity must be >= 0'),
        physicalCount: zod_1.z.number().min(0, 'Physical count must be >= 0'),
        reason: zod_1.z.string().optional(),
    }),
});
exports.listAdjustmentsSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('20'),
        productId: zod_1.z.string().optional(),
        branchId: zod_1.z.string().optional(),
        startDate: zod_1.z.string().optional(),
        endDate: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=stock-adjustment.validation.js.map