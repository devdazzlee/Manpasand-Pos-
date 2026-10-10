import { Router } from 'express';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';
import {
  previewStockImport,
  createStockImport,
  processStockImport,
  reverseStockImport,
  listStockImports,
  getStockImport,
  listStockImportLines,
  lookupStockProduct,
} from '../controllers/stock-import.controller';
import {
  previewStockImportSchema,
  createStockImportSchema,
  stockImportIdSchema,
  stockLookupSchema,
} from '../validations/stock-import.validation';

const router = Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']));

// Barcode stock count — read-only lookup used by the scan screen.
router.get('/lookup', validate(stockLookupSchema), lookupStockProduct);

router.get('/', listStockImports);
router.post('/preview', validate(previewStockImportSchema), previewStockImport);
router.post('/', validate(createStockImportSchema), requirePermission('inventory.import'), createStockImport);
router.get('/:id', validate(stockImportIdSchema), getStockImport);
router.get('/:id/lines', validate(stockImportIdSchema), listStockImportLines);
router.post('/:id/process', validate(stockImportIdSchema), requirePermission('inventory.import'), processStockImport);
router.post('/:id/reverse', validate(stockImportIdSchema), requirePermission('inventory.import'), reverseStockImport);

export default router;
