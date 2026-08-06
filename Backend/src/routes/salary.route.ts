import express from 'express';
import {
  createSalary,
  deleteSalary,
  getSalaryById,
  listSalaries,
  markSalaryPaid,
  markSalaryUnpaid,
  updateSalary,
} from '../controllers/salary.controller';
import {
  createSalarySchema,
  listSalariesSchema,
  markSalaryPaidSchema,
  salaryIdParamSchema,
  updateSalarySchema,
} from '../validations/salary.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

router.post('/', validate(createSalarySchema), createSalary);
router.get('/', validate(listSalariesSchema), listSalaries);
router.get('/:id', validate(salaryIdParamSchema), getSalaryById);
router.put('/:id', validate(updateSalarySchema), updateSalary);
router.patch('/:id/mark-paid', validate(markSalaryPaidSchema), markSalaryPaid);
router.patch('/:id/mark-unpaid', validate(salaryIdParamSchema), markSalaryUnpaid);
router.delete('/:id', validate(salaryIdParamSchema), deleteSalary);

export default router;
