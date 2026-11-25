import { Router } from 'express';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';
import {
  createAssembly,
  listAssemblies,
  getAssembly,
} from '../controllers/stock-assembly.controller';
import {
  createAssemblySchema,
  listAssembliesSchema,
  getAssemblySchema,
} from '../validations/stock-assembly.validation';

const router = Router();

router.use(
  authenticate,
  authorize([
    'SUPER_ADMIN',
    'ADMIN',
    'BRANCH_MANAGER',
    'SUPERVISOR',
    'CASHIER',
    'WAREHOUSE_MANAGER',
    'PURCHASE_MANAGER',
    'INVENTORY_VIEWER',
  ]),
);

router.post('/', validate(createAssemblySchema), requirePermission('inventory.assemble'), createAssembly);
router.get('/', validate(listAssembliesSchema), listAssemblies);
router.get('/:id', validate(getAssemblySchema), getAssembly);

export default router;
