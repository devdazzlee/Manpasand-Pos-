import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  closeRegister,
  dismissIssue,
  editClosing,
  getDayBook,
  getHistory,
  getIssues,
  getRegisterForm,
  getSummary,
  move,
  reconcile,
  setDrawerSource,
  setPaidFrom,
  undo,
} from '../controllers/money-check.controller';
import {
  closeRegisterSchema,
  dateQuerySchema,
  dismissSchema,
  drawerSourceSchema,
  editClosingSchema,
  moveSchema,
  paidFromSchema,
  reconcileSchema,
  sessionParamSchema,
  voucherParamSchema,
} from '../validations/money-check.validation';

const router = Router();
// Owner / admin only: these correct the books.
const owner = authorize(['SUPER_ADMIN', 'ADMIN']);
router.use(authenticate, owner);

router.get('/summary', validate(dateQuerySchema), getSummary);
router.post('/reconcile', validate(reconcileSchema), reconcile);
router.post('/move', validate(moveSchema), move);
router.delete('/entries/:voucherId', validate(voucherParamSchema), undo);

router.get('/issues', getIssues);
router.post('/issues/dismiss', validate(dismissSchema), dismissIssue);
router.get('/registers/:id', validate(sessionParamSchema), getRegisterForm);
router.post('/registers/:id/close', validate(closeRegisterSchema), closeRegister);
router.patch('/registers/:id/closing', validate(editClosingSchema), editClosing);
router.post('/paid-from', validate(paidFromSchema), setPaidFrom);
router.post('/supplier-payments/:id/drawer', validate(drawerSourceSchema), setDrawerSource);

router.get('/day', validate(dateQuerySchema), getDayBook);
router.get('/history', getHistory);

export default router;
