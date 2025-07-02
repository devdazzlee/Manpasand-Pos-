"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCashFlowsSchema = exports.createCashFlowSchema = void 0;
const zod_1 = require("zod");
exports.createCashFlowSchema = zod_1.z.object({
    body: zod_1.z.object({
        opening: zod_1.z.number(),
        sales: zod_1.z.number(),
        closing: zod_1.z.number(),
        expenseIds: zod_1.z.array(zod_1.z.string().uuid()),
    }),
});
exports.listCashFlowsSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().optional(),
        limit: zod_1.z.coerce.number().optional(),
    }),
});
//# sourceMappingURL=cashflow.validation.js.map