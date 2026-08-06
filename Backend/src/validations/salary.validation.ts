import { z } from 'zod';

export const createSalarySchema = z.object({
  body: z.object({
    employee_id: z.string().uuid(),
    month: z.coerce.number().min(1).max(12),
    year: z.coerce.number().min(2020),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    is_paid: z.boolean().optional(),
    paid_date: z.string().datetime().optional(),
    notes: z.string().optional(),
  }),
});

export const updateSalarySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    employee_id: z.string().uuid().optional(),
    month: z.coerce.number().min(1).max(12).optional(),
    year: z.coerce.number().min(2020).optional(),
    amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
    is_paid: z.boolean().optional(),
    paid_date: z.string().datetime().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
});

export const listSalariesSchema = z.object({
  query: z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    employee_id: z.string().uuid().optional(),
    month: z.coerce.number().min(1).max(12).optional(),
    year: z.coerce.number().min(2020).optional(),
    is_paid: z.enum(['true', 'false']).optional(),
    search: z.string().optional(),
    fetch_all: z.enum(['true', 'false']).optional(),
  }),
});

export const salaryIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const markSalaryPaidSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z
    .object({
      paid_date: z.string().datetime().optional(),
    })
    .optional(),
});

export type CreateSalaryInput = z.infer<typeof createSalarySchema>['body'];
export type UpdateSalaryInput = z.infer<typeof updateSalarySchema>['body'];
