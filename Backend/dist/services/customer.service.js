"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app_1 = require("../config/app");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
class CustomerService {
    generateToken(cusId, email) {
        const token = jsonwebtoken_1.default.sign({
            email: email,
            id: cusId
        }, app_1.config.jwtSecret);
        return token;
    }
    async verifyCustomerExistance(email) {
        const customer = await client_1.prisma.customer.findFirst({
            where: {
                email: email,
            },
        });
        if (customer)
            return true;
        return false;
    }
    async createCustomer(data) {
        const customerExists = await this.verifyCustomerExistance(data.email);
        if (customerExists) {
            throw new apiError_1.AppError(400, 'Customer already exists');
        }
        // Ensure password is hashed before storing
        const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
        const customer = await client_1.prisma.customer.create({
            data: {
                ...data,
                password: hashedPassword,
            },
        });
        const token = this.generateToken(customer.id, customer.email);
        return {
            email: customer.email,
            token,
        };
    }
    async createShopCustomer(data) {
        const email = this.resolveCustomerEmail(data.email, data.phone_number);
        const customerExists = await this.verifyCustomerExistance(email);
        if (customerExists) {
            throw new apiError_1.AppError(400, 'Customer already exists');
        }
        const customer = await client_1.prisma.customer.create({
            data: {
                name: data.name,
                phone_number: data.phone_number,
                email,
                address: data.address,
                billing_address: data.billing_address,
                is_active: data.is_active ?? true,
                credit_limit: data.credit_limit ?? null,
                previous_credit_balance: data.previous_credit_balance ?? 0,
            },
        });
        return {
            customer,
        };
    }
    resolveCustomerEmail(email, phone_number) {
        const trimmed = email?.trim();
        if (trimmed)
            return trimmed;
        const digits = (phone_number || '').replace(/\D/g, '') || Date.now().toString();
        return `customer_${digits}_${Math.random().toString(36).slice(2, 8)}@pos.local`;
    }
    async loginCustomer(email, password) {
        const customer = await client_1.prisma.customer.findFirst({
            where: { email },
        });
        if (!customer || !customer.password) {
            throw new apiError_1.AppError(401, 'Invalid credentials');
        }
        const isPasswordValid = await bcryptjs_1.default.compare(password, customer.password);
        if (!isPasswordValid) {
            throw new apiError_1.AppError(401, 'Invalid credentials');
        }
        const token = this.generateToken(customer.id, customer.email);
        return {
            email: customer.email,
            token,
        };
    }
    async getCustomerById(customerId) {
        const customer = await client_1.prisma.customer.findUnique({
            where: { id: customerId },
        });
        if (!customer) {
            throw new apiError_1.AppError(404, 'Customer not found');
        }
        return customer;
    }
    async getCustomers(search) {
        const customers = await client_1.prisma.customer.findMany({
            where: search
                ? {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                        { phone_number: { contains: search } },
                    ],
                }
                : undefined,
            orderBy: { created_at: 'desc' },
        });
        if (customers.length === 0) {
            return [];
        }
        const customerIds = customers.map((customer) => customer.id);
        const saleAggregates = await client_1.prisma.sale.groupBy({
            by: ['customer_id'],
            where: {
                customer_id: { in: customerIds },
                status: 'COMPLETED',
            },
            _sum: { total_amount: true },
            _count: { id: true },
            _max: { sale_date: true },
        });
        const statsByCustomerId = new Map(saleAggregates
            .filter((row) => row.customer_id)
            .map((row) => [
            row.customer_id,
            {
                total_sale_amount: Number(row._sum.total_amount ?? 0),
                sale_count: row._count.id,
                last_sale_date: row._max.sale_date,
            },
        ]));
        return customers.map((customer) => {
            const stats = statsByCustomerId.get(customer.id);
            return {
                ...customer,
                total_sale_amount: stats?.total_sale_amount ?? 0,
                sale_count: stats?.sale_count ?? 0,
                last_sale_date: stats?.last_sale_date ?? null,
            };
        });
    }
    async updateCustomer(customerId, updateData) {
        const existingCustomer = await client_1.prisma.customer.findUnique({
            where: { id: customerId },
        });
        if (!existingCustomer) {
            throw new apiError_1.AppError(404, 'Customer not found');
        }
        if (updateData.password) {
            updateData.password = await bcryptjs_1.default.hash(updateData.password, 10);
        }
        const data = { ...updateData };
        if (data.email !== undefined) {
            const trimmed = data.email?.trim();
            data.email = trimmed
                ? trimmed
                : this.resolveCustomerEmail(null, data.phone_number ?? existingCustomer.phone_number);
        }
        if (data.credit_limit === undefined) {
            delete data.credit_limit;
        }
        const updatedCustomer = await client_1.prisma.customer.update({
            where: { id: customerId },
            data,
        });
        return updatedCustomer;
    }
    async deleteCustomer(customerId) {
        const existingCustomer = await client_1.prisma.customer.findUnique({
            where: { id: customerId },
        });
        if (!existingCustomer) {
            throw new apiError_1.AppError(404, 'Customer not found');
        }
        await client_1.prisma.$transaction(async (tx) => {
            await tx.sale.updateMany({
                where: { original_sale: { customer_id: customerId } },
                data: { original_sale_id: null },
            });
            await tx.saleItem.deleteMany({
                where: { sale: { customer_id: customerId } },
            });
            await tx.sale.deleteMany({ where: { customer_id: customerId } });
            await tx.orderItem.deleteMany({
                where: { order: { customer_id: customerId } },
            });
            await tx.order.deleteMany({ where: { customer_id: customerId } });
            await tx.holdSale.deleteMany({ where: { customer_id: customerId } });
            await tx.deviceIdentity.deleteMany({ where: { customer_id: customerId } });
            await tx.customer.delete({ where: { id: customerId } });
        }, {
            maxWait: 30000,
            timeout: 120000,
        });
        return { message: 'Customer deleted successfully' };
    }
    // No server-side session to invalidate — the token is the session and is
    // discarded by the client. Method kept so the existing /customer/logout
    // route stays valid.
    async logoutCustomer(_customerId) {
        return { message: 'Logged out successfully' };
    }
}
exports.default = CustomerService;
//# sourceMappingURL=customer.service.js.map