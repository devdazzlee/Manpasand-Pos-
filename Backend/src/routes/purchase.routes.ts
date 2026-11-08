import { Request, Router } from 'express';
import { requirePermission } from '../middleware/permission.middleware';
import { prisma } from '../prisma/client';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  createPurchase,
  createBulkPurchase,
  listPurchases,
  exportPurchases,
  getPurchaseById,
  updatePurchase,
  getMonthlyStats,
  deletePurchase,
  deleteBill,
  appendBillLine,
  updateStockInBill,
  getHoldPurchases,
  createHoldPurchase,
  retrieveHoldPurchase,
  deleteHoldPurchase,
} from '../controllers/purchase.controller';
import {
  createPurchaseSchema,
  createBulkPurchaseSchema,
  listPurchasesSchema,
  exportPurchasesSchema,
  updatePurchaseSchema,
  updateStockInBillSchema,
  appendBillLineSchema,
  billAnchorParamSchema,
  deletePurchaseParamSchema,
  createHoldPurchaseSchema,
  listHoldPurchasesSchema,
  holdPurchaseParamSchema,
} from '../validations/purchase.validation';

const router = Router();

router.use(
  authenticate,
  authorize(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER'])
);

router.post('/', validate(createPurchaseSchema), createPurchase);
// A Stock In line may carry a new selling price; changing a price needs
// "Change prices" (admin / purchase manager) or a manager's approval.
const stockInPriceCheck = async (req: Request) => {
  const lines: Array<{ productId?: string; salePrice?: number }> = Array.isArray(req.body?.lines) ? req.body.lines : [];
  const priced = lines.filter((l) => l.productId && l.salePrice !== undefined && l.salePrice !== null);
  if (!priced.length) return null;
  const products = await prisma.product.findMany({
    where: { id: { in: priced.map((l) => String(l.productId)) } },
    select: { id: true, sales_rate_inc_dis_and_tax: true },
  });
  const current = new Map(products.map((p) => [p.id, Number(p.sales_rate_inc_dis_and_tax)]));
  const changes = priced.some((l) => Math.abs((current.get(String(l.productId)) ?? 0) - Number(l.salePrice)) >= 0.005);
  return changes ? 'products.price_change' : null;
};
router.post('/bulk', validate(createBulkPurchaseSchema), requirePermission(stockInPriceCheck), createBulkPurchase);
router.get('/', validate(listPurchasesSchema), listPurchases);
router.get('/stats', getMonthlyStats);
router.get('/export', validate(exportPurchasesSchema), exportPurchases);

router.get('/hold', validate(listHoldPurchasesSchema), getHoldPurchases);
router.post('/hold', validate(createHoldPurchaseSchema), createHoldPurchase);
router.post('/hold/:holdId/retrieve', validate(holdPurchaseParamSchema), retrieveHoldPurchase);
router.delete('/hold/:holdId', validate(holdPurchaseParamSchema), deleteHoldPurchase);

router.post('/bills/:anchorId/lines', validate(appendBillLineSchema), appendBillLine);
router.patch('/bills/:anchorId', validate(updateStockInBillSchema), updateStockInBill);
router.delete('/bills/:anchorId', validate(billAnchorParamSchema), deleteBill);
router.get('/:id', getPurchaseById);
router.patch('/:id', validate(updatePurchaseSchema), updatePurchase);
router.delete('/:id', validate(deletePurchaseParamSchema), deletePurchase);

export default router;
