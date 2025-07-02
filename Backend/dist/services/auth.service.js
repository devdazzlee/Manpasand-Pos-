"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("../prisma/client");
const redis_1 = require("../config/redis");
const app_1 = require("../config/app");
const apiError_1 = require("../utils/apiError");
const client_2 = require("@prisma/client");
const convertToSeconds_1 = require("../utils/convertToSeconds");
class AuthService {
    async register(data) {
        const existingUser = await client_1.prisma.user.findUnique({
            where: { email: data.email },
        });
        if (existingUser) {
            throw new apiError_1.AppError(400, 'Email already in use');
        }
        const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
        const user = await client_1.prisma.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                role: data.role || client_2.Role.ADMIN, // Use Role.USER instead of string
            },
            select: {
                id: true,
                email: true,
                role: true,
                created_at: true,
            },
        });
        return user;
    }
    async login(email, password) {
        const user = await client_1.prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                password: true,
                role: true,
            },
        });
        if (!user || !(await bcryptjs_1.default.compare(password, user.password))) {
            throw new apiError_1.AppError(400, 'Invalid email or password');
        }
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            role: user.role,
        }, app_1.config.jwtSecret, {
            expiresIn: typeof app_1.config.jwtExpiresIn === 'string'
                ? (0, convertToSeconds_1.convertToSeconds)(app_1.config.jwtExpiresIn)
                : app_1.config.jwtExpiresIn,
        });
        // Store session in Redis with proper expiration
        const expiresInSeconds = (0, convertToSeconds_1.convertToSeconds)(app_1.config.jwtExpiresIn);
        await redis_1.redis.set(`session:${user.id}`, token, 'EX', expiresInSeconds);
        // Omit password from returned user object
        const { id: undefined, password: _, ...userWithoutPassword } = user;
        return {
            user: userWithoutPassword,
            token,
        };
    }
    async logout(userId) {
        // await redis.del(`session:${userId}`);
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.service.js.map