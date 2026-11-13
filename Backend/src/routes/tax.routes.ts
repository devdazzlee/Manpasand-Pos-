import express from 'express';
import {
    createTax,
    getTax,
    updateTax,
    toggletaxestatus,
    listTaxes,
} from '../controllers/tax.controller';
import {
    createtaxeschema,
    updatetaxeschema,
    gettaxeschema,
    listTaxesSchema,
} from '../validations/tax.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

const catalogReaders = authorize([
  'SUPER_ADMIN',
  'ADMIN',
  'BRANCH_MANAGER',
  'WAREHOUSE_MANAGER',
  'PURCHASE_MANAGER',
  'CASHIER',
]);
const catalogWriters = authorize([
  'SUPER_ADMIN',
  'ADMIN',
  'WAREHOUSE_MANAGER',
  'PURCHASE_MANAGER',
]);

router.get('/', authenticate, catalogReaders, validate(listTaxesSchema), listTaxes);
router.get('/:id', authenticate, catalogReaders, validate(gettaxeschema), getTax);

router.post('/', authenticate, catalogWriters, validate(createtaxeschema), createTax);
router.patch('/:id', authenticate, catalogWriters, validate(updatetaxeschema), updateTax);
router.patch('/:id/toggle-status', authenticate, catalogWriters, validate(gettaxeschema), toggletaxestatus);

export default router;
