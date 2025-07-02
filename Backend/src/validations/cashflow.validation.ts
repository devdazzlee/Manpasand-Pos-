import { z } from 'zod';

export const createCashFlowSchema = z.object({
  body: z.object({
    opening: z.number(),
    sales: z.number(),
    closing: z.number(),
    expenseIds: z.array(z.string().uuid()),
  }),
});

export const listCashFlowsSchema = z.object({
  query: z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  }),
});

export type CreateCashFlowInput = z.infer<typeof createCashFlowSchema>['body'];
