import express from 'express';
import {
    createUnit,
    getUnit,
    updateUnit,
    listUnits,
    deleteUnit,
} from '../controllers/unit.controller';
import {
    createUnitSchema,
    updateUnitSchema,
    getUnitSchema,
    listUnitsSchema,
} from '../validations/unit.validation';
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

router.get('/', authenticate, catalogReaders, validate(listUnitsSchema), listUnits);
router.get('/:id', authenticate, catalogReaders, validate(getUnitSchema), getUnit);

router.post('/', authenticate, catalogWriters, validate(createUnitSchema), createUnit);
router.patch('/:id', authenticate, catalogWriters, validate(updateUnitSchema), updateUnit);
router.delete('/:id', authenticate, catalogWriters, validate(getUnitSchema), deleteUnit);

export default router;
