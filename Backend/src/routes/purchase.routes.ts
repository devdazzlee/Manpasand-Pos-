import { Router } from 'express';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  createPurchase,
  createBulkPurchase,
  listPurchases,
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
router.post('/bulk', validate(createBulkPurchaseSchema), createBulkPurchase);
router.get('/', validate(listPurchasesSchema), listPurchases);
router.get('/stats', getMonthlyStats);

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
