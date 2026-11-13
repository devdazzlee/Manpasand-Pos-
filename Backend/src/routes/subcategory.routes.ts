import express from 'express';
import {
    createSubcategory,
    getSubcategory,
    updateSubcategory,
    toggleSubcategoryStatus,
    deleteSubcategory,
    listSubcategories,
} from '../controllers/subcategory.controller';
import {
    createSubcategorySchema,
    updateSubcategorySchema,
    getSubcategorySchema,
    listSubcategoriesSchema,
} from '../validations/subcategory.validation';
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

router.get('/', authenticate, catalogReaders, validate(listSubcategoriesSchema), listSubcategories);
router.get('/:id', authenticate, catalogReaders, validate(getSubcategorySchema), getSubcategory);

router.post('/', authenticate, catalogWriters, validate(createSubcategorySchema), createSubcategory);
router.patch('/:id', authenticate, catalogWriters, validate(updateSubcategorySchema), updateSubcategory);
router.patch('/:id/toggle-status', authenticate, catalogWriters, validate(getSubcategorySchema), toggleSubcategoryStatus);
router.delete('/:id', authenticate, catalogWriters, validate(getSubcategorySchema), deleteSubcategory);

export default router;
