"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const customer_controller_1 = require("../controllers/customer.controller");
const validation_middleware_1 = require("../middleware/validation.middleware");
const customer_validation_1 = require("../validations/customer.validation");
const auth_middleware_1 = require("../middleware/auth.middleware");
const customerAuth_middleware_1 = require("../middleware/customerAuth.middleware");
const router = express_1.default.Router();
router.post('/register', (0, validation_middleware_1.validate)(customer_validation_1.customerLoginSchema), customer_controller_1.createCustomer);
router.post('/login', (0, validation_middleware_1.validate)(customer_validation_1.customerLoginSchema), customer_controller_1.loginCustomer);
router.put('/', customerAuth_middleware_1.authenticateCustomer, (0, validation_middleware_1.validate)(customer_validation_1.customerUpdateSchema), customer_controller_1.updateCustomer);
router.post('/logout', customerAuth_middleware_1.authenticateCustomer, customer_controller_1.logoutCustomer);
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.post('/', (0, validation_middleware_1.validate)(customer_validation_1.cusRegisterationSchema), customer_controller_1.createShopCustomer);
router.get('/', customer_controller_1.getCustomers);
router.put('/:customerId', (0, validation_middleware_1.validate)(customer_validation_1.customerUpdateSchema), customer_controller_1.updateCustomerByAdmin);
router.delete('/:customerId', customer_controller_1.deleteCustomer);
router.get('/:customerId', customer_controller_1.getCustomerById);
exports.default = router;
//# sourceMappingURL=customer.routes.js.map