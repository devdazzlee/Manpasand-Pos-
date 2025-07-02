"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStockMovementsController = exports.getStocksController = exports.adjustStockController = exports.createStockController = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const stock_service_1 = require("../services/stock.service");
const stockService = new stock_service_1.StockService();
const createStockController = (0, asyncHandler_1.default)(async (req, res) => {
    console.log("User ID:", req.user?.id, req.user?.role);
    const stock = await stockService.createStock({ ...req.body, createdBy: req.user.id });
    new apiResponse_1.ApiResponse(stock, "Stock added successfully", 201).send(res);
});
exports.createStockController = createStockController;
const adjustStockController = (0, asyncHandler_1.default)(async (req, res) => {
    const stock = await stockService.adjustStock({ ...req.body, createdBy: req.user.id });
    new apiResponse_1.ApiResponse(stock, "Stock adjusted successfully").send(res);
});
exports.adjustStockController = adjustStockController;
const getStocksController = (0, asyncHandler_1.default)(async (req, res) => {
    const stocks = await stockService.getStockByBranch(req.query.branchId);
    new apiResponse_1.ApiResponse(stocks, "Stocks retrieved successfully").send(res);
});
exports.getStocksController = getStocksController;
const getStockMovementsController = (0, asyncHandler_1.default)(async (req, res) => {
    const movements = await stockService.getStockMovements(req.query.branchId);
    new apiResponse_1.ApiResponse(movements, "Stock movement history retrieved").send(res);
});
exports.getStockMovementsController = getStockMovementsController;
//# sourceMappingURL=stock.controller.js.map