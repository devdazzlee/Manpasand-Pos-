import { z } from 'zod';

const categoryBaseSchema = {
  name: z.string().min(1, 'Name is required').max(100),
  slug: z.string().min(1, 'Slug is required').max(100),
  display_on_branches: z.array(z.string()).optional(),
  get_tax_from_item: z.boolean().optional().default(false),
  editable_sale_rate: z.boolean().optional().default(false),
  display_on_pos: z.boolean().optional().default(true),
  branch_id: z.string().optional(),
};

const categoryImageFields = {
  image_url: z.string().url().optional(),
  remove_image: z.boolean().optional(),
};

export const createCategorySchema = z.object({
  body: z.object({
    ...categoryBaseSchema,
    ...categoryImageFields,
  }),
});

export const updateCategorySchema = z.object({
  body: z.object({
    ...categoryBaseSchema,
    ...categoryImageFields,
    name: categoryBaseSchema.name.optional(),
    slug: categoryBaseSchema.slug.optional(),
  }),
  params: z.object({
    id: z.string().min(1, 'Category ID is required'),
  }),
});

export const getCategorySchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Category ID is required'),
  }),
});

export const listCategoriesSchema = z.object({
  query: z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional(),
    search: z.string().optional(),
    is_active: z.string().optional(),
    branch_id: z.string().optional(),
  }),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>['body'];
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>['body'];