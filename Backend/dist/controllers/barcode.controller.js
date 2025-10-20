"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.printBarcodes = exports.testPrinter = exports.getPrinters = void 0;
const barcode_service_1 = require("../services/barcode.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const barcodeService = new barcode_service_1.BarcodeService();
// Get available printers
const getPrinters = (0, asyncHandler_1.default)(async (req, res) => {
    const printers = await barcodeService.getAvailablePrinters();
    new apiResponse_1.ApiResponse(printers, 'Printers fetched successfully').send(res);
});
exports.getPrinters = getPrinters;
// Test printer connection
const testPrinter = (0, asyncHandler_1.default)(async (req, res) => {
    console.log('Test printer request body:', JSON.stringify(req.body, null, 2));
    const { printerName } = req.body;
    const result = await barcodeService.testPrinterConnection(printerName);
    new apiResponse_1.ApiResponse(result, 'Printer test completed').send(res);
});
exports.testPrinter = testPrinter;
// Print barcodes
const printBarcodes = (0, asyncHandler_1.default)(async (req, res) => {
    console.log('Print request body:', JSON.stringify(req.body, null, 2));
    const { products, printerName, settings } = req.body;
    const result = await barcodeService.printBarcodes(products, printerName, settings);
    new apiResponse_1.ApiResponse(result, 'Barcodes sent to printer successfully').send(res);
});
exports.printBarcodes = printBarcodes;
//# sourceMappingURL=barcode.controller.js.map