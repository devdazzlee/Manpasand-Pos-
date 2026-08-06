"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSupplierPayment = exports.createSupplierPayment = exports.getSupplierLedger = exports.getSupplierPurchases = exports.listSuppliers = exports.deleteSupplier = exports.toggleSupplierStatus = exports.updateSupplier = exports.getSupplier = exports.createSupplier = void 0;
const supplier_service_1 = require("../services/supplier.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const supplierService = new supplier_service_1.SupplierService();
exports.createSupplier = (0, asyncHandler_1.default)(async (req, res) => {
    const supplier = await supplierService.createSupplier(req.body);
    new apiResponse_1.ApiResponse(supplier, 'Supplier created successfully', 201).send(res);
});
exports.getSupplier = (0, asyncHandler_1.default)(async (req, res) => {
    const supplier = await supplierService.getSupplierById(req.params.id);
    new apiResponse_1.ApiResponse(supplier, 'Supplier retrieved successfully').send(res);
});
exports.updateSupplier = (0, asyncHandler_1.default)(async (req, res) => {
    const supplier = await supplierService.updateSupplier(req.params.id, req.body);
    new apiResponse_1.ApiResponse(supplier, 'Supplier updated successfully').send(res);
});
exports.toggleSupplierStatus = (0, asyncHandler_1.default)(async (req, res) => {
    await supplierService.toggleSupplierStatus(req.params.id);
    new apiResponse_1.ApiResponse(null, 'Supplier status changed successfully').send(res);
});
exports.deleteSupplier = (0, asyncHandler_1.default)(async (req, res) => {
    await supplierService.deleteSupplier(req.params.id);
    new apiResponse_1.ApiResponse(null, 'Supplier deleted successfully').send(res);
});
const parseOptionalBoolean = (value) => {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    if (value === 'true' || value === true) {
        return true;
    }
    if (value === 'false' || value === false) {
        return false;
    }
    return undefined;
};
exports.listSuppliers = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10, search, fetch_all } = req.query;
    const result = await supplierService.listSuppliers({
        page: Number(page),
        limit: Number(limit),
        search: search,
        is_active: parseOptionalBoolean(req.query.is_active),
        display_on_pos: parseOptionalBoolean(req.query.display_on_pos),
        fetch_all: String(fetch_all) === 'true',
    });
    new apiResponse_1.ApiResponse(result.data, 'Suppliers retrieved successfully', 200, true, result.meta).send(res);
});
exports.getSupplierPurchases = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await supplierService.getSupplierPurchases(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Supplier purchases retrieved').send(res);
});
exports.getSupplierLedger = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await supplierService.getSupplierLedger(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Supplier ledger retrieved').send(res);
});
exports.createSupplierPayment = (0, asyncHandler_1.default)(async (req, res) => {
    const payment = await supplierService.createSupplierPayment(req.params.id, req.body, req.user.id);
    new apiResponse_1.ApiResponse(payment, 'Payment recorded successfully', 201).send(res);
});
exports.deleteSupplierPayment = (0, asyncHandler_1.default)(async (req, res) => {
    await supplierService.deleteSupplierPayment(req.params.id, req.params.paymentId);
    new apiResponse_1.ApiResponse(null, 'Payment deleted successfully').send(res);
});
//# sourceMappingURL=supplier.controller.js.map