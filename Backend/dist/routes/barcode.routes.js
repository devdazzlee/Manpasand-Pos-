"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const barcode_controller_1 = require("../controllers/barcode.controller");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const barcode_validation_1 = require("../validations/barcode.validation");
const router = express_1.default.Router();
// Health check for barcode service (no auth required)
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Barcode service is running',
        timestamp: new Date().toISOString()
    });
});
// Test endpoint for debugging (no auth required)
router.post('/test-debug', (req, res) => {
    console.log('Test debug request body:', JSON.stringify(req.body, null, 2));
    res.json({
        success: true,
        message: 'Debug endpoint working',
        receivedData: req.body,
        timestamp: new Date().toISOString()
    });
});
// Apply authentication to all other routes
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
// Get available printers
router.get('/printers', barcode_controller_1.getPrinters);
// Test printer connection
router.post('/test-printer', (0, validation_middleware_1.validate)(barcode_validation_1.testPrinterSchema), barcode_controller_1.testPrinter);
// Print barcodes
router.post('/print', (0, validation_middleware_1.validate)(barcode_validation_1.printBarcodesSchema), barcode_controller_1.printBarcodes);
exports.default = router;
//# sourceMappingURL=barcode.routes.js.map