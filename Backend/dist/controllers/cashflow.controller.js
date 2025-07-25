"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCashFlows = exports.addClosing = exports.addExpense = exports.createOpening = exports.getCashFlowByDate = void 0;
const cashflow_service_1 = require("../services/cashflow.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const cashFlowService = new cashflow_service_1.CashFlowService();
exports.getCashFlowByDate = (0, asyncHandler_1.default)(async (req, res) => {
    const { date } = req.query;
    const result = await cashFlowService.getCashFlowByDate(date);
    if (!result.exists) {
        new apiResponse_1.ApiResponse({ exists: false, data: [] }, 'No cashflow found for date', 200).send(res);
    }
    else {
        new apiResponse_1.ApiResponse(result.data, 'Cashflow retrieved successfully', 200).send(res);
    }
});
exports.createOpening = (0, asyncHandler_1.default)(async (req, res) => {
    const cashFlow = await cashFlowService.createOpeningCashFlow(req.body);
    new apiResponse_1.ApiResponse(cashFlow, 'Opening added', 201).send(res);
});
exports.addExpense = (0, asyncHandler_1.default)(async (req, res) => {
    const expense = await cashFlowService.addExpense(req.body);
    new apiResponse_1.ApiResponse(expense, 'Expense added', 201).send(res);
});
exports.addClosing = (0, asyncHandler_1.default)(async (req, res) => {
    const { cashflow_id, closing } = req.body;
    const result = await cashFlowService.addClosing(cashflow_id, closing);
    new apiResponse_1.ApiResponse(result, 'Closing added', 200).send(res);
});
exports.listCashFlows = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const result = await cashFlowService.listCashFlows({
        page: Number(page),
        limit: Number(limit),
    });
    new apiResponse_1.ApiResponse(result.data, 'Cash flows retrieved successfully', 200).send(res);
});
//# sourceMappingURL=cashflow.controller.js.map