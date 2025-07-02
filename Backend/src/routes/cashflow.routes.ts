import express from 'express';
import {
    createCashFlow,
    listCashFlows,
} from '../controllers/cashflow.controller';
import {
    createCashFlowSchema,
    listCashFlowsSchema,
} from '../validations/cashflow.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

router.post('/', validate(createCashFlowSchema), createCashFlow);
router.get('/', validate(listCashFlowsSchema), listCashFlows);

export default router;
