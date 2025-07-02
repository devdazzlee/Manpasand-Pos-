import express from 'express';
import {
    createProduct,
    getProduct,
    updateProduct,
    toggleProductStatus,
    listProducts,
} from '../controllers/product.controller';
import {
    createProductSchema,
    updateProductSchema,
    getProductSchema,
    listProductsSchema,
} from '../validations/product.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import upload from '../utils/multer';
import { parseFormData } from '../middleware/parse-formdata.middleware';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

router.post('/', upload.array('images', 10), parseFormData, validate(createProductSchema), createProduct);
router.get('/', validate(listProductsSchema), listProducts);
router.get('/:id', validate(getProductSchema), getProduct);
router.patch('/:id', validate(updateProductSchema), updateProduct);
router.patch('/:id/toggle-status', validate(getProductSchema), toggleProductStatus);

export default router;