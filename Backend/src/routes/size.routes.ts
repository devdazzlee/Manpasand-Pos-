import express from 'express';
import {
    createSize,
    getSize,
    updateSize,
    listSizes,
    deleteSize,
} from '../controllers/size.controller';
import {
    createSizeSchema,
    updateSizeSchema,
    getSizeSchema,
    listSizesSchema,
} from '../validations/size.validation';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';

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

router.get('/', authenticate, catalogReaders, validate(listSizesSchema), listSizes);
router.get('/:id', authenticate, catalogReaders, validate(getSizeSchema), getSize);

router.post('/', authenticate, catalogWriters, validate(createSizeSchema), createSize);
router.patch('/:id', authenticate, catalogWriters, validate(updateSizeSchema), updateSize);
router.delete('/:id', authenticate, catalogWriters, validate(getSizeSchema), deleteSize);

export default router;
