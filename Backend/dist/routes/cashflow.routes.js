"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cashflow_controller_1 = require("../controllers/cashflow.controller");
const cashflow_validation_1 = require("../validations/cashflow.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.post('/', (0, validation_middleware_1.validate)(cashflow_validation_1.createCashFlowSchema), cashflow_controller_1.createCashFlow);
router.get('/', (0, validation_middleware_1.validate)(cashflow_validation_1.listCashFlowsSchema), cashflow_controller_1.listCashFlows);
exports.default = router;
//# sourceMappingURL=cashflow.routes.js.map