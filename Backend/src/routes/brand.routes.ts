import express from 'express';
import {
    createBrand,
    getBrand,
    updateBrand,
    toggleBrandDisplay,
    listBrands,
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

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

router.post('/', validate(createBrandSchema), createBrand);
router.get('/', validate(listBrandsSchema), listBrands);
router.get('/:id', validate(getBrandSchema), getBrand);
router.patch('/:id', validate(updateBrandSchema), updateBrand);
router.patch('/:id/toggle-display', validate(getBrandSchema), toggleBrandDisplay);

export default router;