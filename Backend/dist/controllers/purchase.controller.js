"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteHoldPurchase = exports.retrieveHoldPurchase = exports.createHoldPurchase = exports.getHoldPurchases = exports.updateStockInBill = exports.appendBillLine = exports.deleteBill = exports.deletePurchase = exports.getMonthlyStats = exports.updatePurchase = exports.getPurchaseById = exports.listPurchases = exports.createBulkPurchase = exports.createPurchase = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const purchase_service_1 = require("../services/purchase.service");
const purchaseService = new purchase_service_1.PurchaseService();
exports.createPurchase = (0, asyncHandler_1.default)(async (req, res) => {
    const body = req.body;
    const purchaseDate = body.purchaseDate
        ? new Date(body.purchaseDate)
        : undefined;
    const purchase = await purchaseService.createPurchase({
        ...body,
        purchaseDate,
        createdBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(purchase, 'Purchase logged successfully', 201).send(res);
});
exports.createBulkPurchase = (0, asyncHandler_1.default)(async (req, res) => {
    const body = req.body;
    const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : undefined;
    const expiryDate = body.expiryDate ? new Date(body.expiryDate) : undefined;
    const result = await purchaseService.createBulkPurchase({
        ...body,
        purchaseDate,
        expiryDate,
        createdBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(result, 'Supplier bill saved successfully', 201).send(res);
});
exports.listPurchases = (0, asyncHandler_1.default)(async (req, res) => {
    const query = req.query;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const result = await purchaseService.listPurchases({
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 20,
        productId: query.productId,
        supplierId: query.supplierId,
        branchId: query.branchId,
        startDate,
        endDate,
        search: query.search ? String(query.search) : undefined,
        groupBy: query.groupBy === 'bill' ? 'bill' : 'line',
    });
    new apiResponse_1.ApiResponse(result.data, 'Purchases retrieved', 200, true, result.meta).send(res);
});
exports.getPurchaseById = (0, asyncHandler_1.default)(async (req, res) => {
    const purchase = await purchaseService.getPurchaseById(req.params.id);
    new apiResponse_1.ApiResponse(purchase, 'Purchase retrieved').send(res);
});
exports.updatePurchase = (0, asyncHandler_1.default)(async (req, res) => {
    const body = req.body;
    const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : undefined;
    const purchase = await purchaseService.updatePurchase(req.params.id, {
        quantity: body.quantity,
        costPrice: body.costPrice,
        salePrice: body.salePrice,
        purchaseDate,
        invoiceRef: body.invoiceRef,
        notes: body.notes,
        deliveryStatus: body.deliveryStatus,
        updatedBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(purchase, 'Purchase updated successfully').send(res);
});
exports.getMonthlyStats = (0, asyncHandler_1.default)(async (req, res) => {
    const stats = await purchaseService.getMonthlyStats(req.query.warehouseBranchId);
    new apiResponse_1.ApiResponse(stats, 'Monthly stats retrieved').send(res);
});
exports.deletePurchase = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await purchaseService.deletePurchaseLine(req.params.id, req.user.id);
    new apiResponse_1.ApiResponse(result, 'Purchase line removed').send(res);
});
exports.deleteBill = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await purchaseService.deleteBill(req.params.anchorId, req.user.id);
    new apiResponse_1.ApiResponse(result, 'Supplier bill removed').send(res);
});
exports.appendBillLine = (0, asyncHandler_1.default)(async (req, res) => {
    const body = req.body;
    const purchase = await purchaseService.appendBillLine(req.params.anchorId, {
        productId: body.productId,
        quantity: body.quantity,
        costPrice: body.costPrice,
        salePrice: body.salePrice,
        createdBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(purchase, 'Product added to bill', 201).send(res);
});
exports.updateStockInBill = (0, asyncHandler_1.default)(async (req, res) => {
    const body = req.body;
    const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : undefined;
    const expiryDate = body.expiryDate === null
        ? null
        : body.expiryDate
            ? new Date(body.expiryDate)
            : undefined;
    const purchase = await purchaseService.updateStockInBill(req.params.anchorId, {
        ...body,
        purchaseDate,
        expiryDate,
        updatedBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(purchase, 'Stock In bill updated · stock, ledger & cash synced').send(res);
});
exports.getHoldPurchases = (0, asyncHandler_1.default)(async (req, res) => {
    const branchId = req.query.branchId || undefined;
    const holds = await purchaseService.getHoldPurchases({ branchId });
    new apiResponse_1.ApiResponse(holds, 'Hold purchases retrieved').send(res);
});
exports.createHoldPurchase = (0, asyncHandler_1.default)(async (req, res) => {
    const body = req.body;
    const hold = await purchaseService.createHoldPurchase({
        branchId: body.branchId,
        supplierId: body.supplierId,
        label: body.label,
        payload: body.payload,
        createdBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(hold, 'Stock In held', 201).send(res);
});
exports.retrieveHoldPurchase = (0, asyncHandler_1.default)(async (req, res) => {
    const branchId = req.body?.branchId || req.query.branchId || undefined;
    const hold = await purchaseService.retrieveHoldPurchase({
        holdId: req.params.holdId,
        branchId,
    });
    new apiResponse_1.ApiResponse(hold, 'Hold purchase retrieved').send(res);
});
exports.deleteHoldPurchase = (0, asyncHandler_1.default)(async (req, res) => {
    const branchId = req.query.branchId || undefined;
    await purchaseService.deleteHoldPurchase({
        holdId: req.params.holdId,
        branchId,
    });
    new apiResponse_1.ApiResponse(null, 'Hold purchase deleted').send(res);
});
//# sourceMappingURL=purchase.controller.js.map