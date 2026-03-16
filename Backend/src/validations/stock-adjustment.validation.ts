import { z } from 'zod';

export const createAdjustmentSchema = z.object({
  body: z.object({
    productId: z.string().min(1, 'Product is required'),
    branchId: z.string().min(1, 'Branch is required'),
    systemQuantity: z.number().min(0, 'System quantity must be >= 0'),
    physicalCount: z.number().min(0, 'Physical count must be >= 0'),
    reason: z.string().optional(),
  }),
});

export const listAdjustmentsSchema = z.object({
  query: z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional().default('20'),
    productId: z.string().optional(),
    branchId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});
