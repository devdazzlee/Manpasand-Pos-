"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHistory = exports.getRegisterForm = exports.getDayBook = exports.setDrawerSource = exports.setPaidFrom = exports.editClosing = exports.closeRegister = exports.dismissIssue = exports.getIssues = exports.undo = exports.move = exports.reconcile = exports.getSummary = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const money_check_service_1 = require("../services/money-check.service");
const audit_service_1 = require("../services/audit.service");
const service = new money_check_service_1.MoneyCheckService();
const rs = (n) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;
/** Every change made from Money Check lands in the audit trail (and its history list). */
const log = (req, action, summary, details, entityId) => (0, audit_service_1.auditFromRequest)(req, { action: `money_check.${action}`, category: 'accounts', entity: 'money_check', entityId: entityId ?? null, summary, details });
exports.getSummary = (0, asyncHandler_1.default)(async (req, res) => {
    new apiResponse_1.ApiResponse(await service.summary(req.query.date), 'Money check summary').send(res);
});
exports.reconcile = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.reconcile(req.body, req.user?.id);
    await log(req, 'reconcile', `Matched ${data.account} to the real balance: books ${rs(data.system)}, real ${rs(data.actual)} (${data.difference > 0 ? '+' : ''}${rs(data.difference)}) — ${req.body.reason}`, { ...req.body, ...data, voucherId: data.voucher?.id }, data.voucher?.id);
    new apiResponse_1.ApiResponse(data, 'Balance matched').send(res);
});
exports.move = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.move(req.body, req.user?.id);
    await log(req, 'move', `${data.voucher?.narration ?? req.body.type} — ${rs(Number(req.body.amount))}`, { ...req.body, voucherId: data.voucher?.id }, data.voucher?.id);
    new apiResponse_1.ApiResponse(data, 'Money moved').send(res);
});
exports.undo = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.undo(req.params.voucherId);
    await log(req, 'undo', `Undid ${data.voucher_no}: ${data.narration ?? ''} (${rs(data.amount)})`, { voucherId: req.params.voucherId, ...data });
    new apiResponse_1.ApiResponse(data, 'Entry undone').send(res);
});
exports.getIssues = (0, asyncHandler_1.default)(async (_req, res) => {
    new apiResponse_1.ApiResponse(await service.issues(), 'Problems found').send(res);
});
exports.dismissIssue = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.dismiss(req.body.issueId);
    await log(req, 'dismiss', `Marked as checked: ${req.body.issueId}`, req.body);
    new apiResponse_1.ApiResponse(data, 'Marked as checked').send(res);
});
exports.closeRegister = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.closeForgottenRegister(req.params.id, req.body, { userId: req.user?.id, role: req.user?.role, branchId: req.user?.branch_id ?? null });
    await log(req, 'close_register', `Closed a register left open: cash counted ${rs(Number(req.body.closing))}`, { sessionId: req.params.id, ...req.body }, req.params.id);
    new apiResponse_1.ApiResponse(data, 'Register closed').send(res);
});
exports.editClosing = (0, asyncHandler_1.default)(async (req, res) => {
    const before = await service.registerForm(req.params.id);
    const data = await service.editClosing(req.params.id, req.body, req.user?.id);
    await log(req, 'edit_closing', `Corrected the closing of ${before.day}${req.body.closing != null ? `: cash ${rs(before.closing ?? 0)} → ${rs(Number(req.body.closing))}` : ''}`, { sessionId: req.params.id, before: { closing: before.closing, rows: before.rows }, after: req.body }, req.params.id);
    new apiResponse_1.ApiResponse(data, 'Closing corrected').send(res);
});
exports.setPaidFrom = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.setPaidFrom(req.body);
    await log(req, 'paid_from', `${data.entity === 'EXPENSE' ? 'Expense' : 'Supplier payment'} ${rs(data.amount)} now taken from ${data.to}`, { ...req.body, ...data }, req.body.id);
    new apiResponse_1.ApiResponse(data, 'Paid from updated').send(res);
});
exports.setDrawerSource = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.setDrawerSource(req.params.id, req.body.fromDrawer, req.user?.id);
    await log(req, 'drawer_source', `Supplier cash payment marked as ${data.fromDrawer ? "taken from that day's drawer" : 'paid from cash already taken out'}`, { ...data }, req.params.id);
    new apiResponse_1.ApiResponse(data, 'Updated').send(res);
});
exports.getDayBook = (0, asyncHandler_1.default)(async (req, res) => {
    new apiResponse_1.ApiResponse(await service.dayBook(req.query.date), 'Day book').send(res);
});
exports.getRegisterForm = (0, asyncHandler_1.default)(async (req, res) => {
    new apiResponse_1.ApiResponse(await service.registerForm(req.params.id), 'Register').send(res);
});
exports.getHistory = (0, asyncHandler_1.default)(async (_req, res) => {
    new apiResponse_1.ApiResponse(await service.history(150), 'Money check history').send(res);
});
//# sourceMappingURL=money-check.controller.js.map