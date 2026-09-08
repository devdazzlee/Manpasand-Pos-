import { z } from 'zod';

const PO_STATUSES = [
    'PENDING',
    'APPROVED',
    'ORDERED',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'CANCELLED',
] as const;

const poItem = z.object({
    product_id: z.string().uuid(),
    ordered_quantity: z.coerce.number().positive(),
    unit_cost: z.coerce.number().nonnegative(),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

export const createPurchaseOrderSchema = z.object({
    body: z.object({
        supplier_id: z.string().uuid(),
        branch_id: z.string().uuid(),
        order_date: z.string().optional(),
        expected_delivery: z.string().nullable().optional(),
        tax_amount: z.coerce.number().nonnegative().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
        items: z.array(poItem).min(1, 'Add at least one line'),
    }),
});

export const updatePurchaseOrderSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
        order_date: z.string().optional(),
        expected_delivery: z.string().nullable().optional(),
        tax_amount: z.coerce.number().nonnegative().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
        items: z.array(poItem).min(1).optional(),
    }),
});

export const purchaseOrderStatusSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ status: z.enum(PO_STATUSES) }),
});

export const receivePurchaseOrderSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
        invoice_ref: z.string().trim().max(120).optional(),
        notes: z.string().trim().max(500).optional(),
        lines: z
            .array(
                z.object({
                    item_id: z.string().uuid(),
                    quantity: z.coerce.number().positive(),
                    sale_price: z.coerce.number().nonnegative().optional(),
                }),
            )
            .min(1, 'Nothing to receive'),
    }),
});

export const listPurchaseOrdersSchema = z.object({
    query: z.object({
        page: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        search: z.string().trim().optional(),
        supplier_id: z.string().uuid().optional(),
        branch_id: z.string().uuid().optional(),
        status: z.enum(PO_STATUSES).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
    }),
});
