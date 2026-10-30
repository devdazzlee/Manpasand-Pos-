import { Router } from 'express';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getDashboardStats,
  getLowStockProducts,
  getStockMovements,
  getStockByLocation,
  getReports,
} from '../controllers/inventory.controller';
import {
  listMovementsSchema,
  reportsSchema,
} from '../validations/inventory.validation';

const router = Router();

const allInventoryRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'PURCHASE_MANAGER',
  'WAREHOUSE_MANAGER',
  'BRANCH_MANAGER',
];

// Cashier History on Stock Quantity Report needs this GET only — not the rest of inventory.
router.get(
  '/movements',
  authenticate,
  authorize([...allInventoryRoles, 'CASHIER']),
  validate(listMovementsSchema),
  getStockMovements,
);

router.use(authenticate, authorize(allInventoryRoles));

router.get('/dashboard', getDashboardStats);
router.get('/low-stock', getLowStockProducts);
router.get('/stock-by-location', getStockByLocation);
router.get('/reports', validate(reportsSchema), getReports);

export default router;
