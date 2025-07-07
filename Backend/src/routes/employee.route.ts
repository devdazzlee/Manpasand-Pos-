import express from 'express';
import { createEmployee, listEmployees } from '../controllers/employee.controller';
import { createEmployeeSchema, createEmployeeTypeSchema, listEmployeeSchema, updateEmployeeTypeSchema } from '../validations/employee.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { createEmployeeType, deleteEmployeeType, getEmployeeTypeById, getEmployeeTypes, updateEmployeeType } from '../controllers/expense.controller';

const router = express.Router();

router.use(authenticate, authorize(['ADMIN', 'SUPER_ADMIN']));

router.post('/', validate(createEmployeeSchema), createEmployee);
router.get('/', validate(listEmployeeSchema), listEmployees);

router.post('/type', validate(createEmployeeTypeSchema), createEmployeeType);
router.get('/types', getEmployeeTypes);
router.get('/type/:id', getEmployeeTypeById);
router.put('/type/:id', validate(updateEmployeeTypeSchema), updateEmployeeType);
router.delete('/type/:id', deleteEmployeeType);

export default router;
