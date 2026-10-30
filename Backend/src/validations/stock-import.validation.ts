import { z } from 'zod';

const cell = z.union([z.string(), z.number()]).nullish();

const row = z.object({
  rowNo: z.number().int().min(1),
  branch: cell,
  sku: cell,
  name: cell,
  quantity: cell,
  unitCost: cell,
  salePrice: cell,
  category: cell,
  brand: cell,
  size: cell,
  color: cell,
  productId: z.string().nullish(),
  skip: z.boolean().optional(),
});

const options = z.object({
  mode: z.enum(['ADD', 'SET']),
  defaultBranchId: z.string().nullish(),
  createMissing: z.boolean().default(true),
  updateCost: z.boolean().default(false),
  fileChecksum: z.string().max(128).nullish(),
  sourceReference: z.string().max(200).nullish(),
});

export const previewStockImportSchema = z.object({
  body: z.object({
    rows: z.array(row).min(1, 'The file has no rows').max(20000, 'At most 20,000 rows per import'),
    options,
  }),
});

export const createStockImportSchema = z.object({
  body: z.object({
    rows: z.array(row).min(1).max(20000),
    options,
    fileName: z.string().max(255).nullish(),
    notes: z.string().max(500).nullish(),
    stockDate: z.string().nullish(),
    allowDuplicate: z.boolean().optional(),
  }),
});

export const stockImportIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const stockLookupSchema = z.object({
  query: z.object({ code: z.string().min(1, 'Scan or type a code'), branchId: z.string().optional() }),
});
