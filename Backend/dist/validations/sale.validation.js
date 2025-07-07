"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundSaleSchema = exports.createSaleSchema = void 0;
const zod_1 = require("zod");
const saleItemSchema = zod_1.z.object({
    productId: zod_1.z.string(),
    quantity: zod_1.z.number().int().min(1),
    price: zod_1.z.number().nonnegative(),
});
const createSaleSchema = zod_1.z.object({
    body: zod_1.z.object({
        customerId: zod_1.z.string().optional(),
        paymentMethod: zod_1.z.enum(["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "CREDIT"]),
        items: zod_1.z.array(saleItemSchema).min(1),
    }),
});
exports.createSaleSchema = createSaleSchema;
const refundSaleSchema = zod_1.z.object({
    body: zod_1.z.object({
        customerId: zod_1.z.string().optional(),
        returnedItems: zod_1.z
            .array(zod_1.z.object({
            productId: zod_1.z.string().min(1),
            quantity: zod_1.z.number().int().positive(),
        }))
            .optional()
            .default([]),
        exchangedItems: zod_1.z
            .array(zod_1.z.object({
            productId: zod_1.z.string().min(1),
            quantity: zod_1.z.number().int().positive(),
            price: zod_1.z.number().nonnegative(),
        }))
            .optional()
            .default([]),
    }),
});
exports.refundSaleSchema = refundSaleSchema;
//# sourceMappingURL=sale.validation.js.map