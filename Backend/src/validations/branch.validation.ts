import { z } from 'zod';

const branchBaseSchema = {
  name: z.string().min(1, 'Name is required').max(100),
  address: z.string().optional().nullable(),
  branch_type: z.enum(['WAREHOUSE', 'BRANCH']).optional().default('BRANCH'),
  allow_neg_pos_stock: z.boolean().optional().default(false),
  allow_neg_stock_grrn: z.boolean().optional().default(false),
  allow_neg_transferout: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
};

export const createBranchSchema = z.object({
  body: z.object(branchBaseSchema),
});

export const updateBranchSchema = z.object({
  body: z.object({
    ...branchBaseSchema,
    name: branchBaseSchema.name.optional(),
  }),
  params: z.object({
    id: z.string().min(1, 'Branch ID is required'),
  }),
});

export const getBranchSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Branch ID is required'),
  }),
});

export const listBranchesSchema = z.object({
  query: z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional().default('10'),
    search: z.string().optional(),
    is_active: z.string().optional(),
    fetch_all: z.string().optional(),
  }),
});

export const branchCredentialsSchema = z.object({
  body: z
    .object({
      email: z.string().email('Invalid email address').optional(),
      password: z.string().min(6, 'Password must be at least 6 characters').optional(),
    })
    .refine((data) => data.email || data.password, {
      message: 'Provide an email and/or password to update',
    }),
  params: z.object({
    id: z.string().min(1, 'Branch ID is required'),
  }),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>['body'];
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>['body'];
export type BranchCredentialsInput = z.infer<typeof branchCredentialsSchema>['body'];
