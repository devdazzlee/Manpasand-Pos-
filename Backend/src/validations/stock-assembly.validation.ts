import { z } from 'zod';

export const createAssemblySchema = z.object({
  body: z.object({
    branchId: z.string().min(1, 'Branch is required'),
    finishedProductId: z.string().min(1, 'Finished product is required'),
    finishedQuantity: z.number().positive('Finished quantity must be greater than 0'),
    notes: z.string().max(500).optional(),
    referenceNo: z.string().max(100).optional(),
    components: z
      .array(
        z.object({
          productId: z.string().min(1, 'Component product is required'),
          quantity: z.number().positive('Component quantity must be greater than 0'),
        }),
      )
      .min(1, 'Add at least one component product')
      .max(100, 'Too many components in one assembly'),
  }),
});

export const listAssembliesSchema = z.object({
  query: z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional().default('20'),
    branchId: z.string().optional(),
    productId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    search: z.string().optional(),
  }),
});

export const getAssemblySchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});
