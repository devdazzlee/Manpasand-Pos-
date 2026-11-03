import { Router } from 'express';
import { validate } from '../middleware/validation.middleware';
import { branchOwnershipParam } from '../middleware/branch-ownership.middleware';
import { prisma } from '../prisma/client';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  createTransfer,
  updateTransferStatus,
  listTransfers,
  getTransferById,
  getPendingTransfers,
} from '../controllers/transfer.controller';
import {
  createTransferSchema,
  updateTransferStatusSchema,
  listTransfersSchema,
} from '../validations/transfer.validation';

const router = Router();

router.use(
  authenticate,
  authorize(['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER'])
);

// A branch user may only see / act on transfers into or out of their branch.
router.param(
  'id',
  branchOwnershipParam((id) =>
    prisma.transfer
      .findUnique({ where: { id }, select: { from_branch_id: true, to_branch_id: true } })
      .then((t) => t && [t.from_branch_id, t.to_branch_id]),
  ),
);
router.post('/', validate(createTransferSchema), createTransfer);
router.patch('/:id/status', validate(updateTransferStatusSchema), updateTransferStatus);
router.get('/pending', getPendingTransfers);
router.get('/', validate(listTransfersSchema), listTransfers);
router.get('/:id', getTransferById);

export default router;
