"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validation_middleware_1 = require("../middleware/validation.middleware");
const branch_ownership_middleware_1 = require("../middleware/branch-ownership.middleware");
const client_1 = require("../prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const transfer_controller_1 = require("../controllers/transfer.controller");
const transfer_validation_1 = require("../validations/transfer.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']));
// A branch user may only see / act on transfers into or out of their branch.
router.param('id', (0, branch_ownership_middleware_1.branchOwnershipParam)((id) => client_1.prisma.transfer
    .findUnique({ where: { id }, select: { from_branch_id: true, to_branch_id: true } })
    .then((t) => t && [t.from_branch_id, t.to_branch_id])));
router.post('/', (0, validation_middleware_1.validate)(transfer_validation_1.createTransferSchema), transfer_controller_1.createTransfer);
router.patch('/:id/status', (0, validation_middleware_1.validate)(transfer_validation_1.updateTransferStatusSchema), transfer_controller_1.updateTransferStatus);
router.get('/pending', transfer_controller_1.getPendingTransfers);
router.get('/', (0, validation_middleware_1.validate)(transfer_validation_1.listTransfersSchema), transfer_controller_1.listTransfers);
router.get('/:id', transfer_controller_1.getTransferById);
exports.default = router;
//# sourceMappingURL=transfer.routes.js.map