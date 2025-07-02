"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app_controller_1 = require("../controllers/app.controller");
const router = (0, express_1.Router)();
router.get("/", app_controller_1.getHomeData);
router.get("/products", app_controller_1.searchProducts);
exports.default = router;
//# sourceMappingURL=app.routes.js.map