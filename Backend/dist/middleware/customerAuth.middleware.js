"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateCustomer = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const redis_1 = require("../config/redis");
const app_1 = require("../config/app");
const apiError_1 = require("../utils/apiError");
const authenticateCustomer = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            throw new apiError_1.AppError(401, 'Authentication required');
        }
        const decoded = jsonwebtoken_1.default.verify(token, app_1.config.jwtSecret);
        // Verify token against Redis
        const storedToken = await redis_1.redis.get(`session:customer:${decoded.id}`);
        if (!storedToken || storedToken !== token) {
            throw new apiError_1.AppError(401, 'Invalid or expired session');
        }
        req.customer = decoded;
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.authenticateCustomer = authenticateCustomer;
//# sourceMappingURL=customerAuth.middleware.js.map