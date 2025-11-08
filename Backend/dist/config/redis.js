"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRedis = exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const app_1 = require("./app");
const redis = new ioredis_1.default(app_1.config.redisServiceUri, {
    tls: {
        rejectUnauthorized: false,
    },
});
exports.redis = redis;
const connectRedis = async () => {
    try {
        await redis.ping();
        console.log('Redis Connected...');
    }
    catch (err) {
        console.log('Redis connection error:', err);
        process.exit(1);
    }
};
exports.connectRedis = connectRedis;
//# sourceMappingURL=redis.js.map