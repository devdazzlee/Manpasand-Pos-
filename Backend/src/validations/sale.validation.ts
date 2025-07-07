import { z } from "zod";

const saleItemSchema = z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
    price: z.number().nonnegative(),
});

const createSaleSchema = z.object({
    body: z.object({
        customerId: z.string().optional(),
        paymentMethod: z.enum(["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "CREDIT"]),
        items: z.array(saleItemSchema).min(1),
    }),
});

const refundSaleSchema = z.object({
    body: z.object({
        customerId: z.string().optional(),
        returnedItems: z
            .array(
                z.object({
                    productId: z.string().min(1),
                    quantity: z.number().int().positive(),
                })
            )
            .optional()
            .default([]),
        exchangedItems: z
            .array(
                z.object({
                    productId: z.string().min(1),
                    quantity: z.number().int().positive(),
                    price: z.number().nonnegative(),
                })
            )
            .optional()
            .default([]),
    }),
});

export { createSaleSchema, refundSaleSchema };