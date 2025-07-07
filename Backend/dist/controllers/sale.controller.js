"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentSaleItemProductNameAndPrice = exports.getTodaySalesController = exports.refundSaleController = exports.createSaleController = exports.getSaleByIdController = exports.getSalesController = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const sales_service_1 = require("../services/sales.service");
const apiResponse_1 = require("../utils/apiResponse");
const saleService = new sales_service_1.SaleService();
const getSalesController = (0, asyncHandler_1.default)(async (req, res) => {
    const sales = await saleService.getSales({ branchId: req.user?.branch_id });
    new apiResponse_1.ApiResponse(sales, "Sales fetched successfully").send(res);
});
exports.getSalesController = getSalesController;
const getSaleByIdController = (0, asyncHandler_1.default)(async (req, res) => {
    const sale = await saleService.getSaleById(req.params.saleId);
    new apiResponse_1.ApiResponse(sale, "Sale details fetched").send(res);
});
exports.getSaleByIdController = getSaleByIdController;
const createSaleController = (0, asyncHandler_1.default)(async (req, res) => {
    const sale = await saleService.createSale({
        ...req.body,
        branchId: req.user?.branch_id,
        createdBy: req.user.id
    });
    new apiResponse_1.ApiResponse(sale, "Sale created successfully", 201).send(res);
});
exports.createSaleController = createSaleController;
const refundSaleController = (0, asyncHandler_1.default)(async (req, res) => {
    const { customerId, returnedItems = [], exchangedItems = [] } = req.body;
    const originalSaleId = req.params.saleId;
    const createdBy = req.user.id;
    const branchId = req.user?.branch_id;
    const sale = await saleService.createExchangeOrReturnSale({
        originalSaleId,
        branchId,
        customerId,
        returnedItems,
        exchangedItems,
        createdBy,
    });
    new apiResponse_1.ApiResponse(sale, "Sale refunded/exchanged successfully").send(res);
});
exports.refundSaleController = refundSaleController;
const getTodaySalesController = (0, asyncHandler_1.default)(async (req, res) => {
    const sales = await saleService.getTodaySales({ branchId: req.user?.branch_id });
    new apiResponse_1.ApiResponse(sales, "Today's sales fetched successfully").send(res);
});
exports.getTodaySalesController = getTodaySalesController;
const getRecentSaleItemProductNameAndPrice = (0, asyncHandler_1.default)(async (req, res) => {
    const branchId = req.user?.branch_id;
    const recentSaleItem = await saleService.getRecentSaleItemsProductNameAndPrice(branchId);
    new apiResponse_1.ApiResponse(recentSaleItem, "Recent sale item product name and price fetched successfully").send(res);
});
exports.getRecentSaleItemProductNameAndPrice = getRecentSaleItemProductNameAndPrice;
//# sourceMappingURL=sale.controller.js.map