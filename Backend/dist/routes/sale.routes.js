"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const sale_controller_1 = require("../controllers/sale.controller");
const sale_validation_1 = require("../validations/sale.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(["SUPER_ADMIN", "ADMIN"]));
router.get("/", sale_controller_1.getSalesController);
router.get("/:saleId", sale_controller_1.getSaleByIdController);
router.post("/", (0, validation_middleware_1.validate)(sale_validation_1.createSaleSchema), sale_controller_1.createSaleController);
router.patch("/:saleId/refund", (0, validation_middleware_1.validate)(sale_validation_1.refundSaleSchema), sale_controller_1.refundSaleController);
exports.default = router;
//# sourceMappingURL=sale.routes.js.map