"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundSaleController = exports.createSaleController = exports.getSaleByIdController = exports.getSalesController = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const sales_service_1 = require("../services/sales.service");
const apiResponse_1 = require("../utils/apiResponse");
const saleService = new sales_service_1.SaleService();
const getSalesController = (0, asyncHandler_1.default)(async (req, res) => {
    const sales = await saleService.getSales({ branchId: req.query.branchId });
    new apiResponse_1.ApiResponse(sales, "Sales fetched successfully").send(res);
});
exports.getSalesController = getSalesController;
const getSaleByIdController = (0, asyncHandler_1.default)(async (req, res) => {
    const sale = await saleService.getSaleById(req.params.saleId);
    new apiResponse_1.ApiResponse(sale, "Sale details fetched").send(res);
});
exports.getSaleByIdController = getSaleByIdController;
const createSaleController = (0, asyncHandler_1.default)(async (req, res) => {
    const sale = await saleService.createSale(req.body);
    new apiResponse_1.ApiResponse(sale, "Sale created successfully", 201).send(res);
});
exports.createSaleController = createSaleController;
const refundSaleController = (0, asyncHandler_1.default)(async (req, res) => {
    const sale = await saleService.refundSale(req.params.saleId, req.user.id);
    new apiResponse_1.ApiResponse(sale, "Sale refunded successfully").send(res);
});
exports.refundSaleController = refundSaleController;
//# sourceMappingURL=sale.controller.js.map