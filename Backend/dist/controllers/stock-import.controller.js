"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupStockProduct = exports.listStockImportLines = exports.getStockImport = exports.listStockImports = exports.reverseStockImport = exports.processStockImport = exports.createStockImport = exports.previewStockImport = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const stock_import_service_1 = require("../services/stock-import.service");
const service = new stock_import_service_1.StockImportService();
exports.previewStockImport = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.preview(req.body.rows, req.body.options);
    new apiResponse_1.ApiResponse(result, 'Preview ready').send(res);
});
exports.createStockImport = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.create({ ...req.body, userId: req.user.id });
    new apiResponse_1.ApiResponse(result, 'Import started', 201).send(res);
});
exports.processStockImport = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.process(req.params.id, req.user.id);
    new apiResponse_1.ApiResponse(result, result.done ? 'Import finished' : 'Chunk applied').send(res);
});
exports.reverseStockImport = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.reverse(req.params.id, req.user.id);
    new apiResponse_1.ApiResponse(result, 'Import undone').send(res);
});
exports.listStockImports = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.list(req.query);
    new apiResponse_1.ApiResponse(result.data, 'Imports retrieved', 200, true, result.meta).send(res);
});
exports.getStockImport = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.progress(req.params.id);
    new apiResponse_1.ApiResponse(result, 'Import retrieved').send(res);
});
exports.listStockImportLines = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.lines(req.params.id, req.query);
    new apiResponse_1.ApiResponse(result.data, 'Lines retrieved', 200, true, result.meta).send(res);
});
exports.lookupStockProduct = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.lookup(String(req.query.code), req.query.branchId ? String(req.query.branchId) : undefined);
    new apiResponse_1.ApiResponse(result, 'Product found').send(res);
});
//# sourceMappingURL=stock-import.controller.js.map