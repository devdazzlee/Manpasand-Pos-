"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const permission_middleware_1 = require("../middleware/permission.middleware");
const stock_import_controller_1 = require("../controllers/stock-import.controller");
const stock_import_validation_1 = require("../validations/stock-import.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']));
// Barcode stock count — read-only lookup used by the scan screen.
router.get('/lookup', (0, validation_middleware_1.validate)(stock_import_validation_1.stockLookupSchema), stock_import_controller_1.lookupStockProduct);
router.get('/', stock_import_controller_1.listStockImports);
router.post('/preview', (0, validation_middleware_1.validate)(stock_import_validation_1.previewStockImportSchema), stock_import_controller_1.previewStockImport);
router.post('/', (0, validation_middleware_1.validate)(stock_import_validation_1.createStockImportSchema), (0, permission_middleware_1.requirePermission)('inventory.import'), stock_import_controller_1.createStockImport);
router.get('/:id', (0, validation_middleware_1.validate)(stock_import_validation_1.stockImportIdSchema), stock_import_controller_1.getStockImport);
router.get('/:id/lines', (0, validation_middleware_1.validate)(stock_import_validation_1.stockImportIdSchema), stock_import_controller_1.listStockImportLines);
router.post('/:id/process', (0, validation_middleware_1.validate)(stock_import_validation_1.stockImportIdSchema), (0, permission_middleware_1.requirePermission)('inventory.import'), stock_import_controller_1.processStockImport);
router.post('/:id/reverse', (0, validation_middleware_1.validate)(stock_import_validation_1.stockImportIdSchema), (0, permission_middleware_1.requirePermission)('inventory.import'), stock_import_controller_1.reverseStockImport);
exports.default = router;
//# sourceMappingURL=stock-import.routes.js.map