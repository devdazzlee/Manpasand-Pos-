import { z } from 'zod';

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
export const supplierParamSchema = z.object({ params: z.object({ supplierId: z.string().uuid() }) });

export const createPurchaseInvoiceSchema = z.object({
    body: z.object({
        supplier_id: z.string().uuid(),
        branch_id: z.string().uuid().nullable().optional(),
        purchase_order_id: z.string().uuid().nullable().optional(),
        invoice_number: z.string().trim().min(1, 'Invoice number is required').max(80),
        invoice_date: z.string().optional(),
        due_date: z.string().nullable().optional(),
        tax_amount: z.coerce.number().nonnegative().optional(),
        discount_amount: z.coerce.number().nonnegative().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
        purchase_ids: z.array(z.string().uuid()).min(1, 'Select at least one delivery'),
    }),
});

export const updatePurchaseInvoiceSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
        invoice_number: z.string().trim().min(1).max(80).optional(),
        invoice_date: z.string().optional(),
        due_date: z.string().nullable().optional(),
        tax_amount: z.coerce.number().nonnegative().optional(),
        discount_amount: z.coerce.number().nonnegative().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
        purchase_ids: z.array(z.string().uuid()).min(1).optional(),
    }),
});

export const listPurchaseInvoicesSchema = z.object({
    query: z.object({
        page: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        supplier_id: z.string().uuid().optional(),
        branch_id: z.string().uuid().optional(),
        status: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID']).optional(),
        overdue: z.enum(['true', 'false']).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
    }),
});
