import express from 'express';
import {
    listPurchaseReturns,
    listReturnableBills,
    listDirectReturnProducts,
    getPurchaseReturn,
    createPurchaseReturn,
    cancelPurchaseReturn,
} from '../controllers/purchaseReturn.controller';
import {
    createPurchaseReturnSchema,
    listPurchaseReturnsSchema,
    returnableBillsSchema,
    directReturnProductsSchema,
    idParamSchema,
} from '../validations/purchaseReturn.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(
    authenticate,
    authorize(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']),
);

router.get('/', validate(listPurchaseReturnsSchema), listPurchaseReturns);
router.get('/returnable-bills', validate(returnableBillsSchema), listReturnableBills);
// Return without a bill: stock that came in directly (no supplier bill)
router.get('/direct-products', validate(directReturnProductsSchema), listDirectReturnProducts);
router.post('/', validate(createPurchaseReturnSchema), createPurchaseReturn);
router.get('/:id', validate(idParamSchema), getPurchaseReturn);
router.post('/:id/cancel', validate(idParamSchema), cancelPurchaseReturn);

export default router;
