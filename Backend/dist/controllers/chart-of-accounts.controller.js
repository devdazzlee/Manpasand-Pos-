"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteVoucher = exports.updateVoucher = exports.createVoucher = exports.getVoucher = exports.listVouchers = exports.deleteAccount = exports.updateAccount = exports.createAccount = exports.getAccount = exports.listAccounts = exports.deleteControl = exports.updateControl = exports.createControl = exports.deleteSubType = exports.updateSubType = exports.createSubType = exports.createExpenseAccount = exports.getMoneyAccountOptions = exports.getExpenseGroupOptions = exports.getExpenseAccountOptions = exports.getNextCodes = exports.syncAccounts = exports.getMoneyFlow = exports.updatePaymentRoutingSetting = exports.getPaymentRoutingSetting = exports.getTrialBalance = exports.getExpenseBreakdown = exports.getLedger = exports.getTree = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const chart_of_accounts_service_1 = require("../services/chart-of-accounts.service");
const apiError_1 = require("../utils/apiError");
const payment_accounts_service_1 = require("../services/payment-accounts.service");
const chart_of_accounts_validation_1 = require("../validations/chart-of-accounts.validation");
const service = new chart_of_accounts_service_1.ChartOfAccountsService();
// `validate` only checks the request; parse again here to get coerced values.
const body = (schema, req) => schema.shape.body.parse(req.body);
const reportParams = (req) => ({
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    branchId: req.query.branchId ? String(req.query.branchId) : undefined,
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
});
/* ---------------------------- reports ---------------------------- */
exports.getTree = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.tree({ ...reportParams(req), includeInactive: req.query.includeInactive === 'true' });
    new apiResponse_1.ApiResponse(data, 'Chart of accounts retrieved').send(res);
});
exports.getLedger = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.ledger(req.params.id, reportParams(req));
    new apiResponse_1.ApiResponse(data, 'Account ledger retrieved').send(res);
});
exports.getExpenseBreakdown = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.expenseBreakdown(reportParams(req));
    new apiResponse_1.ApiResponse(data, 'Expense breakdown retrieved').send(res);
});
exports.getTrialBalance = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.trialBalance(reportParams(req));
    new apiResponse_1.ApiResponse(data, 'Trial balance retrieved').send(res);
});
exports.getPaymentRoutingSetting = (0, asyncHandler_1.default)(async (_req, res) => {
    new apiResponse_1.ApiResponse(await (0, payment_accounts_service_1.getPaymentRouting)(), 'Payment accounts retrieved').send(res);
});
exports.updatePaymentRoutingSetting = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await (0, payment_accounts_service_1.setPaymentRouting)(req.body || {}, req.user?.id);
    new apiResponse_1.ApiResponse(data, 'Payment accounts saved').send(res);
});
exports.getMoneyFlow = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.moneyFlow(reportParams(req));
    new apiResponse_1.ApiResponse(data, 'Money flow retrieved').send(res);
});
exports.syncAccounts = (0, asyncHandler_1.default)(async (_req, res) => {
    const data = await service.syncLinkedAccounts();
    new apiResponse_1.ApiResponse(data, 'Linked accounts synchronised').send(res);
});
exports.getNextCodes = (0, asyncHandler_1.default)(async (req, res) => {
    const q = chart_of_accounts_validation_1.nextCodeSchema.shape.query.parse(req.query);
    const data = await service.nextCodes(q);
    new apiResponse_1.ApiResponse(data, 'Next codes').send(res);
});
exports.getExpenseAccountOptions = (0, asyncHandler_1.default)(async (_req, res) => {
    const data = await service.expenseAccountOptions();
    new apiResponse_1.ApiResponse(data, 'Expense accounts retrieved').send(res);
});
exports.getExpenseGroupOptions = (0, asyncHandler_1.default)(async (_req, res) => {
    const data = await service.expenseGroupOptions();
    new apiResponse_1.ApiResponse(data, 'Expense groups retrieved').send(res);
});
exports.getMoneyAccountOptions = (0, asyncHandler_1.default)(async (_req, res) => {
    const data = await service.moneyAccountOptions();
    new apiResponse_1.ApiResponse(data, 'Cash and bank accounts retrieved').send(res);
});
exports.createExpenseAccount = (0, asyncHandler_1.default)(async (req, res) => {
    const input = body(chart_of_accounts_validation_1.createExpenseAccountSchema, req);
    if (input.new_group_name && !['SUPER_ADMIN', 'ADMIN'].includes(String(req.user?.role))) {
        throw new apiError_1.AppError(403, 'Only an admin can create a new expense group — pick an existing group');
    }
    const data = await service.createExpenseAccount(input);
    new apiResponse_1.ApiResponse(data, 'Expense account created', 201).send(res);
});
/* ---------------------------- sub types ---------------------------- */
exports.createSubType = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.createSubType(body(chart_of_accounts_validation_1.createSubTypeSchema, req));
    new apiResponse_1.ApiResponse(data, 'Sub type created', 201).send(res);
});
exports.updateSubType = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.updateSubType(req.params.id, body(chart_of_accounts_validation_1.updateSubTypeSchema, req));
    new apiResponse_1.ApiResponse(data, 'Sub type updated').send(res);
});
exports.deleteSubType = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.deleteSubType(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Sub type deleted').send(res);
});
/* ---------------------------- controls ---------------------------- */
exports.createControl = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.createControl(body(chart_of_accounts_validation_1.createControlSchema, req));
    new apiResponse_1.ApiResponse(data, 'Control account created', 201).send(res);
});
exports.updateControl = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.updateControl(req.params.id, body(chart_of_accounts_validation_1.updateControlSchema, req));
    new apiResponse_1.ApiResponse(data, 'Control account updated').send(res);
});
exports.deleteControl = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.deleteControl(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Control account deleted').send(res);
});
/* ------------------------- transactional ------------------------- */
exports.listAccounts = (0, asyncHandler_1.default)(async (req, res) => {
    const q = chart_of_accounts_validation_1.listAccountsSchema.shape.query.parse(req.query);
    const data = await service.listAccounts({
        search: q.search,
        type_code: q.type_code,
        control_id: q.control_id,
        active: q.active === undefined ? undefined : q.active === 'true',
    });
    new apiResponse_1.ApiResponse(data, 'Accounts retrieved').send(res);
});
exports.getAccount = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.getAccount(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Account retrieved').send(res);
});
exports.createAccount = (0, asyncHandler_1.default)(async (req, res) => {
    const input = body(chart_of_accounts_validation_1.createAccountSchema, req);
    const data = await service.createAccount({ ...input, email: input.email || null });
    new apiResponse_1.ApiResponse(data, 'Account created', 201).send(res);
});
exports.updateAccount = (0, asyncHandler_1.default)(async (req, res) => {
    const input = body(chart_of_accounts_validation_1.updateAccountSchema, req);
    const data = await service.updateAccount(req.params.id, {
        ...input,
        ...(input.email !== undefined ? { email: input.email || null } : {}),
    });
    new apiResponse_1.ApiResponse(data, 'Account updated').send(res);
});
exports.deleteAccount = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.deleteAccount(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Account deleted').send(res);
});
/* ------------------------- journal vouchers ------------------------- */
exports.listVouchers = (0, asyncHandler_1.default)(async (req, res) => {
    const q = chart_of_accounts_validation_1.listVouchersSchema.shape.query.parse(req.query);
    const result = await service.listVouchers(q);
    new apiResponse_1.ApiResponse(result.data, 'Journal vouchers retrieved', 200, true, result.meta).send(res);
});
exports.getVoucher = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.getVoucher(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Journal voucher retrieved').send(res);
});
exports.createVoucher = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.createVoucher(body(chart_of_accounts_validation_1.createVoucherSchema, req), req.user?.id);
    new apiResponse_1.ApiResponse(data, 'Journal voucher posted', 201).send(res);
});
exports.updateVoucher = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.updateVoucher(req.params.id, body(chart_of_accounts_validation_1.updateVoucherSchema, req));
    new apiResponse_1.ApiResponse(data, 'Journal voucher updated').send(res);
});
exports.deleteVoucher = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.deleteVoucher(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Journal voucher deleted').send(res);
});
//# sourceMappingURL=chart-of-accounts.controller.js.map