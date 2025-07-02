"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const stock_controller_1 = require("../controllers/stock.controller");
const stock_validation_1 = require("../validations/stock.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(["SUPER_ADMIN", "ADMIN"]));
router.post("/", (0, validation_middleware_1.validate)(stock_validation_1.createStockSchema), stock_controller_1.createStockController);
router.patch("/adjust", (0, validation_middleware_1.validate)(stock_validation_1.adjustStockSchema), stock_controller_1.adjustStockController);
router.get("/", stock_controller_1.getStocksController);
router.get("/history", stock_controller_1.getStockMovementsController);
exports.default = router;
//# sourceMappingURL=stock.routes.js.map