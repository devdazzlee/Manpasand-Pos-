import { prisma } from '../prisma/client';
import { requirePermission } from '../middleware/permission.middleware';
import express, { Request } from 'express';
import {
  createProduct,
  getProduct,
  updateProduct,
  toggleProductStatus,
  listProducts,
  exportProductsToExcel,
  getFeaturedProducts,
  getBestSellingProducts,
  bulkUploadProducts,
  importProductRow,
  deleteAllProducts,
  deleteProduct,
  uploadProductImage,
  getPosCatalog,
  getProductCostHistory,
  getProductPriceHistory,
} from '../controllers/product.controller';
import {
  createProductSchema,
  updateProductSchema,
  getProductSchema,
  listProductsSchema,
} from '../validations/product.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import upload from '../utils/multer';
import { parseFormData } from '../middleware/parse-formdata.middleware';
import uploadBulk from '../utils/uploadBulk';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { barcodeAvailability } from '../services/barcode-availability.service';

const router = express.Router();

// router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

const productWriters = authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER']);

/** Only edits that actually change cost / sale price / discount need the price permission. */
const priceChangeCheck = async (req: Request) => {
  const fields = ['purchase_rate', 'sales_rate_exc_dis_and_tax', 'sales_rate_inc_dis_and_tax', 'discount_amount'] as const;
  if (!fields.some((f) => req.body?.[f] !== undefined)) return null;
  const current = await prisma.product.findUnique({ where: { id: req.params.id }, select: { purchase_rate: true, sales_rate_exc_dis_and_tax: true, sales_rate_inc_dis_and_tax: true, discount_amount: true } });
  if (!current) return null;
  const changed = fields.some((f) => req.body?.[f] !== undefined && Math.abs(Number(req.body[f]) - Number(current[f] ?? 0)) > 0.0001);
  return changed ? 'products.price_change' : null;
};

router.post(
  '/',
  authenticate,
  productWriters,
  upload.array('images', 10),
  parseFormData,
  validate(createProductSchema),
  createProduct,
);
router.post('/upload-image', authenticate, productWriters, upload.single('image'), uploadProductImage);
router.post('/bulk-upload', authenticate, productWriters, uploadBulk.single('file'), bulkUploadProducts);
router.post('/import-row', authenticate, productWriters, importProductRow);
router.delete('/all', authenticate, authorize(['SUPER_ADMIN']), deleteAllProducts);
router.get('/', validate(listProductsSchema), listProducts);
router.get('/pos-catalog', authenticate, getPosCatalog);
// Options for the report filter bar, readable by every signed-in role.
router.get(
  '/catalog-filter-options',
  authenticate,
  asyncHandler(async (_req, res) => {
    const named = { select: { id: true, name: true }, orderBy: { name: 'asc' as const } };
    const [suppliers, categories, subcategories, links] = await Promise.all([
      prisma.supplier.findMany(named),
      prisma.category.findMany(named),
      prisma.subcategory.findMany(named),
      // Subcategories carry no category of their own; a link is any product using the pair.
      prisma.product.findMany({
        where: { subcategory_id: { not: null } },
        select: { category_id: true, subcategory_id: true },
        distinct: ['category_id', 'subcategory_id'],
      }),
    ]);
    new ApiResponse(
      {
        suppliers,
        categories,
        subcategories,
        links: links.map((l) => ({ categoryId: l.category_id, subcategoryId: l.subcategory_id as string })),
      },
      'Catalog filter options',
    ).send(res);
  }),
);
// Live check for the product form: is this custom barcode free? (+ next free suggestion)
router.get(
  '/barcode-availability',
  authenticate,
  asyncHandler(async (req: Request, res) => {
    const code = String(req.query.code || '').trim();
    if (!code) return new ApiResponse({ code, available: false, usedBy: null, suggestion: null }, 'Enter a code').send(res);
    const excludeId = req.query.excludeId ? String(req.query.excludeId) : null;
    new ApiResponse(await barcodeAvailability(code, excludeId), 'Barcode availability').send(res);
  }),
);
router.get('/export/excel', exportProductsToExcel);
router.get('/featured', getFeaturedProducts);
router.get('/best-selling', authenticate, getBestSellingProducts);
router.get('/:id/cost-history', validate(getProductSchema), getProductCostHistory);
router.get('/:id/price-history', validate(getProductSchema), getProductPriceHistory);
router.get('/:id', validate(getProductSchema), getProduct);
router.patch('/:id', authenticate, productWriters, validate(updateProductSchema), requirePermission(priceChangeCheck), updateProduct);
router.patch('/:id/toggle-status', authenticate, productWriters, validate(getProductSchema), toggleProductStatus);
router.delete('/:id', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), validate(getProductSchema), deleteProduct);

export default router;
