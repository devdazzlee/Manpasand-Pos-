import express from 'express';
import {
  createOpening,
  addExpense,
  addClosing,
  getCashFlowByDate,
  listCashFlows,
} from '../controllers/cashflow.controller';

import {
  createOpeningSchema,
  createExpenseSchema,
  addClosingSchema,
  listCashFlowsSchema,
  getCashFlowByDateSchema,
} from '../validations/cashflow.validation';

import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));
router.get('/by-date', validate(getCashFlowByDateSchema), getCashFlowByDate);
router.post('/opening', validate(createOpeningSchema), createOpening);
router.post('/expense', validate(createExpenseSchema), addExpense);
router.post('/closing', validate(addClosingSchema), addClosing);
router.get('/', validate(listCashFlowsSchema), listCashFlows);

export default router;
