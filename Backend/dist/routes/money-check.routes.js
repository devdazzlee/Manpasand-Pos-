"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const money_check_controller_1 = require("../controllers/money-check.controller");
const money_check_validation_1 = require("../validations/money-check.validation");
const router = (0, express_1.Router)();
// Owner / admin only: these correct the books.
const owner = (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']);
router.use(auth_middleware_1.authenticate, owner);
router.get('/summary', (0, validation_middleware_1.validate)(money_check_validation_1.dateQuerySchema), money_check_controller_1.getSummary);
router.post('/reconcile', (0, validation_middleware_1.validate)(money_check_validation_1.reconcileSchema), money_check_controller_1.reconcile);
router.post('/move', (0, validation_middleware_1.validate)(money_check_validation_1.moveSchema), money_check_controller_1.move);
router.delete('/entries/:voucherId', (0, validation_middleware_1.validate)(money_check_validation_1.voucherParamSchema), money_check_controller_1.undo);
router.get('/issues', money_check_controller_1.getIssues);
router.post('/issues/dismiss', (0, validation_middleware_1.validate)(money_check_validation_1.dismissSchema), money_check_controller_1.dismissIssue);
router.get('/registers/:id', (0, validation_middleware_1.validate)(money_check_validation_1.sessionParamSchema), money_check_controller_1.getRegisterForm);
router.post('/registers/:id/close', (0, validation_middleware_1.validate)(money_check_validation_1.closeRegisterSchema), money_check_controller_1.closeRegister);
router.patch('/registers/:id/closing', (0, validation_middleware_1.validate)(money_check_validation_1.editClosingSchema), money_check_controller_1.editClosing);
router.post('/paid-from', (0, validation_middleware_1.validate)(money_check_validation_1.paidFromSchema), money_check_controller_1.setPaidFrom);
router.post('/supplier-payments/:id/drawer', (0, validation_middleware_1.validate)(money_check_validation_1.drawerSourceSchema), money_check_controller_1.setDrawerSource);
router.get('/day', (0, validation_middleware_1.validate)(money_check_validation_1.dateQuerySchema), money_check_controller_1.getDayBook);
router.get('/history', money_check_controller_1.getHistory);
exports.default = router;
//# sourceMappingURL=money-check.routes.js.map