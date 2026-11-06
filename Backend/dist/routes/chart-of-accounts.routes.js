"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const chart_of_accounts_controller_1 = require("../controllers/chart-of-accounts.controller");
const chart_of_accounts_validation_1 = require("../validations/chart-of-accounts.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const canView = (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']);
const canManage = (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']);
// Anyone signed in can pick an expense head when raising an expense.
router.get('/expense-accounts', chart_of_accounts_controller_1.getExpenseAccountOptions);
router.get('/expense-groups', chart_of_accounts_controller_1.getExpenseGroupOptions);
router.get('/money-accounts', chart_of_accounts_controller_1.getMoneyAccountOptions);
// Which account card / transfer / wallet / cheque money lands in.
router.get('/payment-routing', chart_of_accounts_controller_1.getPaymentRoutingSetting);
router.put('/payment-routing', canManage, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.paymentRoutingSchema), chart_of_accounts_controller_1.updatePaymentRoutingSetting);
// Expense accounts can be added while raising an expense (like categories);
// creating a brand-new group is checked for admins in the controller.
router.post('/expense-accounts', (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.createExpenseAccountSchema), chart_of_accounts_controller_1.createExpenseAccount);
router.get('/', canView, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.reportQuerySchema), chart_of_accounts_controller_1.getTree);
router.get('/expense-breakdown', canView, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.reportQuerySchema), chart_of_accounts_controller_1.getExpenseBreakdown);
router.get('/trial-balance', canView, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.reportQuerySchema), chart_of_accounts_controller_1.getTrialBalance);
router.get('/money-flow', canView, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.reportQuerySchema), chart_of_accounts_controller_1.getMoneyFlow);
router.get('/next-code', canView, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.nextCodeSchema), chart_of_accounts_controller_1.getNextCodes);
router.post('/sync', canManage, chart_of_accounts_controller_1.syncAccounts);
router.post('/sub-types', canManage, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.createSubTypeSchema), chart_of_accounts_controller_1.createSubType);
router.patch('/sub-types/:id', canManage, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.updateSubTypeSchema), chart_of_accounts_controller_1.updateSubType);
router.delete('/sub-types/:id', canManage, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.idParamSchema), chart_of_accounts_controller_1.deleteSubType);
router.post('/controls', canManage, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.createControlSchema), chart_of_accounts_controller_1.createControl);
router.patch('/controls/:id', canManage, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.updateControlSchema), chart_of_accounts_controller_1.updateControl);
router.delete('/controls/:id', canManage, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.idParamSchema), chart_of_accounts_controller_1.deleteControl);
router.get('/accounts', canView, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.listAccountsSchema), chart_of_accounts_controller_1.listAccounts);
router.post('/accounts', canManage, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.createAccountSchema), chart_of_accounts_controller_1.createAccount);
router.get('/accounts/:id', canView, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.idParamSchema), chart_of_accounts_controller_1.getAccount);
router.get('/accounts/:id/ledger', canView, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.ledgerSchema), chart_of_accounts_controller_1.getLedger);
router.patch('/accounts/:id', canManage, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.updateAccountSchema), chart_of_accounts_controller_1.updateAccount);
router.delete('/accounts/:id', canManage, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.idParamSchema), chart_of_accounts_controller_1.deleteAccount);
router.get('/vouchers', canView, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.listVouchersSchema), chart_of_accounts_controller_1.listVouchers);
router.post('/vouchers', canManage, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.createVoucherSchema), chart_of_accounts_controller_1.createVoucher);
router.get('/vouchers/:id', canView, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.idParamSchema), chart_of_accounts_controller_1.getVoucher);
router.patch('/vouchers/:id', canManage, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.updateVoucherSchema), chart_of_accounts_controller_1.updateVoucher);
router.delete('/vouchers/:id', canManage, (0, validation_middleware_1.validate)(chart_of_accounts_validation_1.idParamSchema), chart_of_accounts_controller_1.deleteVoucher);
exports.default = router;
//# sourceMappingURL=chart-of-accounts.routes.js.map