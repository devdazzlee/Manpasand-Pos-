import express from 'express';
import {
    createBrand,
    getBrand,
    updateBrand,
    toggleBrandDisplay,
    listBrands,
    deleteBrand,
} from '../controllers/brand.controller';
import {
    createBrandSchema,
    updateBrandSchema,
    getBrandSchema,
    listBrandsSchema,
} from '../validations/brand.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

/** Add Product / stock dropdowns — warehouse accounts were 403'd when this was ADMIN-only. */
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

router.get('/', authenticate, catalogReaders, validate(listBrandsSchema), listBrands);
router.get('/:id', authenticate, catalogReaders, validate(getBrandSchema), getBrand);

router.post('/', authenticate, catalogWriters, validate(createBrandSchema), createBrand);
router.patch('/:id', authenticate, catalogWriters, validate(updateBrandSchema), updateBrand);
router.delete('/:id', authenticate, catalogWriters, validate(getBrandSchema), deleteBrand);
router.patch('/:id/toggle-display', authenticate, catalogWriters, validate(getBrandSchema), toggleBrandDisplay);

export default router;
