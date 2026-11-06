"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const inventory_controller_1 = require("../controllers/inventory.controller");
const inventory_validation_1 = require("../validations/inventory.validation");
const router = (0, express_1.Router)();
const allInventoryRoles = [
    'SUPER_ADMIN',
    'ADMIN',
    'PURCHASE_MANAGER',
    'WAREHOUSE_MANAGER',
    'BRANCH_MANAGER',
];
// Cashier History on Stock Quantity Report needs this GET only — not the rest of inventory.
router.get('/movements', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)([...allInventoryRoles, 'CASHIER']), (0, validation_middleware_1.validate)(inventory_validation_1.listMovementsSchema), inventory_controller_1.getStockMovements);
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(allInventoryRoles));
router.get('/dashboard', inventory_controller_1.getDashboardStats);
router.get('/low-stock', inventory_controller_1.getLowStockProducts);
router.get('/stock-by-location', inventory_controller_1.getStockByLocation);
router.get('/reports', (0, validation_middleware_1.validate)(inventory_validation_1.reportsSchema), inventory_controller_1.getReports);
exports.default = router;
//# sourceMappingURL=inventory.routes.js.map