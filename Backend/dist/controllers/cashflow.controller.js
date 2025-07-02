"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCashFlows = exports.createCashFlow = void 0;
const cashflow_service_1 = require("../services/cashflow.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const cashFlowService = new cashflow_service_1.CashFlowService();
exports.createCashFlow = (0, asyncHandler_1.default)(async (req, res) => {
    const cashFlow = await cashFlowService.createCashFlow(req.body);
    new apiResponse_1.ApiResponse(cashFlow, 'Cash flow created successfully', 201).send(res);
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