import express from 'express';
import {
  assignShift,
  getCurrentShift,
  getShiftHistory,
  endCurrentShift,
  endShiftById,
  getAllShifts,
  updateShift,
  deleteShift,
} from '../controllers/shiftAssignment.controller';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  assignShiftSchema,
  employeeIdParamSchema,
  listShiftAssignmentsSchema,
  updateShiftAssignmentSchema,
  endShiftBodySchema,
  endShiftByIdSchema,
  shiftAssignmentIdParamSchema,
} from '../validations/shiftAssignment.validation';

const router = express.Router();

router.use(authenticate, authorize(['ADMIN', 'SUPER_ADMIN']));

router.post('/', validate(assignShiftSchema), assignShift);
router.get('/', validate(listShiftAssignmentsSchema), getAllShifts);
router.get(
  '/current/:employee_id',
  validate(employeeIdParamSchema),
  getCurrentShift,
);
router.get(
  '/history/:employee_id',
  validate(employeeIdParamSchema),
  getShiftHistory,
);
router.patch(
  '/end/:employee_id',
  validate(endShiftBodySchema),
  endCurrentShift,
);
router.patch('/:id/end', validate(endShiftByIdSchema), endShiftById);
router.patch('/:id', validate(updateShiftAssignmentSchema), updateShift);
router.delete('/:id', validate(shiftAssignmentIdParamSchema), deleteShift);

export default router;
