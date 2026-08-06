import { z } from 'zod';

export const assignShiftSchema = z.object({
  body: z.object({
    employee_id: z.string().uuid(),
    shift_time: z.string().min(1),
    start_date: z.string().datetime(),
    end_date: z.string().datetime().optional().nullable(),
    break_time: z.string().optional().nullable(),
    sales: z.coerce.number().min(0).optional(),
  }),
});

export const updateShiftAssignmentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    shift_time: z.string().min(1).optional(),
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional().nullable(),
    break_time: z.string().optional().nullable(),
    sales: z.coerce.number().min(0).optional(),
  }),
});

export const employeeIdParamSchema = z.object({
  params: z.object({
    employee_id: z.string().uuid(),
  }),
});

export const shiftAssignmentIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const endShiftBodySchema = z.object({
  params: z.object({
    employee_id: z.string().uuid(),
  }),
  body: z
    .object({
      sales: z.coerce.number().min(0).optional(),
    })
    .optional(),
});

export const endShiftByIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z
    .object({
      sales: z.coerce.number().min(0).optional(),
    })
    .optional(),
});

export const listShiftAssignmentsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
    fetch_all: z
      .union([z.literal('true'), z.literal('false'), z.boolean()])
      .optional()
      .transform((v) => v === true || v === 'true'),
    search: z.string().optional(),
    employee_id: z.string().uuid().optional(),
    status: z.enum(['all', 'active', 'scheduled', 'completed']).optional(),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    period: z.enum(['all', 'today', 'week', 'month']).optional(),
  }),
});

export type AssignShiftInput = z.infer<typeof assignShiftSchema>['body'];
export type UpdateShiftAssignmentInput = z.infer<
  typeof updateShiftAssignmentSchema
>['body'];
