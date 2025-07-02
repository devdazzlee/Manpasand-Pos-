"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listExpenses = exports.createExpense = void 0;
const expense_service_1 = require("../services/expense.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const expenseService = new expense_service_1.ExpenseService();
exports.createExpense = (0, asyncHandler_1.default)(async (req, res) => {
    const expense = await expenseService.createExpense(req.body);
    new apiResponse_1.ApiResponse(expense, 'Expense created successfully', 201).send(res);
});
exports.listExpenses = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const result = await expenseService.listExpenses({
        page: Number(page),
        limit: Number(limit),
    });
    new apiResponse_1.ApiResponse(result.data, 'Expenses retrieved successfully', 200).send(res);
});
//# sourceMappingURL=expense.controller.js.map