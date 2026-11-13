import express from 'express';
import {
    createColor,
    getColor,
    updateColor,
    listColors,
    deleteColor,
} from '../controllers/color.controller';
import {
    createColorSchema,
    updateColorSchema,
    getColorSchema,
    listColorsSchema,
} from '../validations/color.validation';
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

router.get('/', authenticate, catalogReaders, validate(listColorsSchema), listColors);
router.get('/:id', authenticate, catalogReaders, validate(getColorSchema), getColor);

router.post('/', authenticate, catalogWriters, validate(createColorSchema), createColor);
router.patch('/:id', authenticate, catalogWriters, validate(updateColorSchema), updateColor);
router.delete('/:id', authenticate, catalogWriters, validate(getColorSchema), deleteColor);

export default router;
