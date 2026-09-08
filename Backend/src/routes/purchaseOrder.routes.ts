import express from 'express';
import {
    listPurchaseOrders,
    getPurchaseOrder,
    createPurchaseOrder,
    updatePurchaseOrder,
    setPurchaseOrderStatus,
    receivePurchaseOrder,
    cancelPurchaseOrder,
    deletePurchaseOrder,
} from '../controllers/purchaseOrder.controller';
import {
    createPurchaseOrderSchema,
    updatePurchaseOrderSchema,
    purchaseOrderStatusSchema,
    receivePurchaseOrderSchema,
    listPurchaseOrdersSchema,
    idParamSchema,
} from '../validations/purchaseOrder.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(
    authenticate,
    authorize(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']),
);

router.get('/', validate(listPurchaseOrdersSchema), listPurchaseOrders);
router.post('/', validate(createPurchaseOrderSchema), createPurchaseOrder);
router.get('/:id', validate(idParamSchema), getPurchaseOrder);
router.patch('/:id', validate(updatePurchaseOrderSchema), updatePurchaseOrder);
router.patch('/:id/status', validate(purchaseOrderStatusSchema), setPurchaseOrderStatus);
router.post('/:id/receive', validate(receivePurchaseOrderSchema), receivePurchaseOrder);
router.post('/:id/cancel', validate(idParamSchema), cancelPurchaseOrder);
router.delete('/:id', validate(idParamSchema), deletePurchaseOrder);

export default router;
