"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = void 0;
const client_1 = require("../prisma/client");
const connectDB = async () => {
    try {
        await client_1.prisma.$connect();
        console.log('PostgreSQL Connected...');
    }
    catch (err) {
        console.error('Database connection error:', err);
        process.exit(1);
    }
};
exports.connectDB = connectDB;
//# sourceMappingURL=db.js.map