import express from 'express';
import {
    createSupplier,
    getSupplier,
    updateSupplier,
    toggleSupplierStatus,
    listSuppliers,
} from '../controllers/supplier.controller';
import {
    createSupplierSchema,
    updateSupplierSchema,
    getSupplierSchema,
    listSuppliersSchema,
} from '../validations/supplier.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

router.post('/', validate(createSupplierSchema), createSupplier);
router.get('/', validate(listSuppliersSchema), listSuppliers);
router.get('/:id', validate(getSupplierSchema), getSupplier);
router.put('/:id', validate(updateSupplierSchema), updateSupplier);
router.patch('/:id/toggle-status', validate(getSupplierSchema), toggleSupplierStatus);

export default router;