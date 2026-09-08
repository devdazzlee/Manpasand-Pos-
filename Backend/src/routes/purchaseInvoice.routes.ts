import express from 'express';
import {
    listPurchaseInvoices,
    getPurchaseInvoice,
    getUninvoicedPurchases,
    createPurchaseInvoice,
    updatePurchaseInvoice,
    deletePurchaseInvoice,
} from '../controllers/purchaseInvoice.controller';
import {
    createPurchaseInvoiceSchema,
    updatePurchaseInvoiceSchema,
    listPurchaseInvoicesSchema,
    idParamSchema,
    supplierParamSchema,
} from '../validations/purchaseInvoice.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(
    authenticate,
    authorize(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']),
);

router.get('/', validate(listPurchaseInvoicesSchema), listPurchaseInvoices);
router.post('/', validate(createPurchaseInvoiceSchema), createPurchaseInvoice);
router.get('/uninvoiced/:supplierId', validate(supplierParamSchema), getUninvoicedPurchases);
router.get('/:id', validate(idParamSchema), getPurchaseInvoice);
router.patch('/:id', validate(updatePurchaseInvoiceSchema), updatePurchaseInvoice);
router.delete('/:id', validate(idParamSchema), deletePurchaseInvoice);

export default router;
