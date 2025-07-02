import express from 'express';
import {
  createCategory,
  getCategory,
  updateCategory,
  toggleCategoryStatus,
  listCategories,
} from '../controllers/category.controller';
import {
  createCategorySchema,
  updateCategorySchema,
  getCategorySchema,
  listCategoriesSchema,
} from '../validations/category.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import upload from '../utils/multer';
import { parseFormData } from '../middleware/parse-formdata.middleware';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

router.post('/', upload.array('images', 10), parseFormData, validate(createCategorySchema), createCategory);
router.get('/', validate(listCategoriesSchema), listCategories);
router.get('/:id', validate(getCategorySchema), getCategory);
router.patch('/:id', validate(updateCategorySchema), updateCategory);
router.patch('/:id/toggle-status', validate(getCategorySchema), toggleCategoryStatus);

export default router;