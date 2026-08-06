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
const helpers_1 = require("../utils/helpers");
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
        const [saleAggregates, completedSales, paymentAggregates] = await Promise.all([
            client_1.prisma.sale.groupBy({
                by: ['customer_id'],
                where: {
                    customer_id: { in: customerIds },
                    status: 'COMPLETED',
                },
                _sum: { total_amount: true },
                _count: { id: true },
                _max: { sale_date: true },
            }),
            client_1.prisma.sale.findMany({
                where: {
                    customer_id: { in: customerIds },
                    status: 'COMPLETED',
                    original_sale_id: null,
                },
                select: {
                    customer_id: true,
                    total_amount: true,
                    payment_received: true,
                },
            }),
            client_1.prisma.customerPayment.groupBy({
                by: ['customer_id'],
                where: { customer_id: { in: customerIds } },
                _sum: { amount: true },
            }),
        ]);
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
        const unpaidByCustomerId = new Map();
        for (const sale of completedSales) {
            if (!sale.customer_id)
                continue;
            const unpaid = Math.max(0, (0, helpers_1.asNumber)(sale.total_amount) - (0, helpers_1.asNumber)(sale.payment_received));
            unpaidByCustomerId.set(sale.customer_id, (unpaidByCustomerId.get(sale.customer_id) ?? 0) + unpaid);
        }
        const paymentsByCustomerId = new Map(paymentAggregates.map((row) => [
            row.customer_id,
            (0, helpers_1.asNumber)(row._sum.amount),
        ]));
        return customers.map((customer) => {
            const stats = statsByCustomerId.get(customer.id);
            const opening = (0, helpers_1.asNumber)(customer.previous_credit_balance);
            const unpaid = unpaidByCustomerId.get(customer.id) ?? 0;
            const payments = paymentsByCustomerId.get(customer.id) ?? 0;
            const balance_due = Math.max(0, opening + unpaid - payments);
            return {
                ...customer,
                total_sale_amount: stats?.total_sale_amount ?? 0,
                sale_count: stats?.sale_count ?? 0,
                last_sale_date: stats?.last_sale_date ?? null,
                balance_due,
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
            await tx.customerPayment.deleteMany({
                where: { customer_id: customerId },
            });
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
    async getCustomerPurchases(customerId) {
        await this.getCustomerById(customerId);
        const sales = await client_1.prisma.sale.findMany({
            where: {
                customer_id: customerId,
                status: { in: ['COMPLETED', 'REFUNDED', 'EXCHANGED'] },
                original_sale_id: null,
            },
            include: {
                sale_items: {
                    include: {
                        product: { select: { id: true, name: true, sku: true } },
                    },
                },
                branch: { select: { id: true, name: true } },
            },
            orderBy: { sale_date: 'desc' },
        });
        const productMap = new Map();
        let totalQuantity = 0;
        let totalValue = 0;
        const orders = sales.map((sale) => {
            const items = sale.sale_items.map((item) => {
                const qty = (0, helpers_1.asNumber)(item.quantity);
                const lineTotal = (0, helpers_1.asNumber)(item.line_total);
                totalQuantity += qty;
                totalValue += lineTotal;
                const pid = item.product_id;
                const existing = productMap.get(pid);
                if (existing) {
                    existing.totalQty += qty;
                    existing.totalValue += lineTotal;
                    existing.orderCount += 1;
                }
                else {
                    productMap.set(pid, {
                        productId: pid,
                        productName: item.product?.name || 'Unknown',
                        sku: item.product?.sku || null,
                        totalQty: qty,
                        totalValue: lineTotal,
                        orderCount: 1,
                    });
                }
                return {
                    id: item.id,
                    product_id: item.product_id,
                    quantity: qty,
                    unit_price: (0, helpers_1.asNumber)(item.unit_price),
                    discount_amount: (0, helpers_1.asNumber)(item.discount_amount),
                    tax_amount: (0, helpers_1.asNumber)(item.tax_amount),
                    line_total: lineTotal,
                    item_type: item.item_type,
                    product: item.product,
                };
            });
            return {
                id: sale.id,
                sale_number: sale.sale_number,
                invoice_number: sale.invoice_number,
                sale_date: sale.sale_date,
                status: sale.status,
                payment_method: sale.payment_method,
                payment_status: sale.payment_status,
                subtotal: (0, helpers_1.asNumber)(sale.subtotal),
                tax_amount: (0, helpers_1.asNumber)(sale.tax_amount),
                discount_amount: (0, helpers_1.asNumber)(sale.discount_amount),
                total_amount: (0, helpers_1.asNumber)(sale.total_amount),
                payment_received: (0, helpers_1.asNumber)(sale.payment_received),
                notes: sale.notes,
                branch: sale.branch,
                items,
            };
        });
        return {
            orders,
            productSummary: Array.from(productMap.values()).sort((a, b) => b.totalValue - a.totalValue),
            summary: {
                orderCount: orders.length,
                productCount: productMap.size,
                totalQuantity,
                totalValue,
            },
        };
    }
    async getCustomerLedger(customerId) {
        const customer = await this.getCustomerById(customerId);
        const [sales, payments] = await Promise.all([
            client_1.prisma.sale.findMany({
                where: {
                    customer_id: customerId,
                    status: 'COMPLETED',
                    original_sale_id: null,
                },
                orderBy: { sale_date: 'asc' },
            }),
            client_1.prisma.customerPayment.findMany({
                where: { customer_id: customerId },
                include: { user: { select: { email: true } } },
                orderBy: { payment_date: 'asc' },
            }),
        ]);
        const typeOrder = {
            OPENING: 0,
            SALE: 1,
            SALE_PAYMENT: 2,
            PAYMENT: 3,
        };
        const raw = [];
        const opening = (0, helpers_1.asNumber)(customer.previous_credit_balance);
        if (opening > 0) {
            raw.push({
                id: `opening-${customer.id}`,
                date: customer.created_at,
                type: 'OPENING',
                description: 'Opening credit balance',
                reference: null,
                debit: opening,
                credit: 0,
                meta: { previous_credit_balance: opening },
            });
        }
        for (const sale of sales) {
            const total = (0, helpers_1.asNumber)(sale.total_amount);
            const received = (0, helpers_1.asNumber)(sale.payment_received);
            raw.push({
                id: `sale-${sale.id}`,
                date: sale.sale_date,
                type: 'SALE',
                description: `Sale · ${sale.invoice_number || sale.sale_number}`,
                reference: sale.invoice_number || sale.sale_number,
                debit: total,
                credit: 0,
                meta: {
                    saleId: sale.id,
                    saleNumber: sale.sale_number,
                    invoiceNumber: sale.invoice_number,
                },
            });
            if (received > 0) {
                raw.push({
                    id: `sale-payment-${sale.id}`,
                    date: sale.sale_date,
                    type: 'SALE_PAYMENT',
                    description: `Sale payment · ${sale.invoice_number || sale.sale_number}`,
                    reference: sale.invoice_number || sale.sale_number,
                    debit: 0,
                    credit: received,
                    meta: {
                        saleId: sale.id,
                        paymentMethod: sale.payment_method,
                    },
                });
            }
        }
        for (const pay of payments) {
            raw.push({
                id: `payment-${pay.id}`,
                date: pay.payment_date,
                type: 'PAYMENT',
                description: `Payment · ${pay.method}${pay.notes ? ` · ${pay.notes}` : ''}`,
                reference: pay.reference,
                debit: 0,
                credit: (0, helpers_1.asNumber)(pay.amount),
                meta: {
                    paymentId: pay.id,
                    method: pay.method,
                    createdBy: pay.user?.email || null,
                },
            });
        }
        raw.sort((a, b) => {
            const d = a.date.getTime() - b.date.getTime();
            if (d !== 0)
                return d;
            return typeOrder[a.type] - typeOrder[b.type];
        });
        let running = 0;
        const entries = raw.map((e) => {
            running += e.debit - e.credit;
            return { ...e, balance: running };
        });
        const totalPaid = entries.reduce((acc, e) => acc + e.credit, 0);
        const balanceDue = Math.max(0, running);
        const creditLimit = customer.credit_limit === null || customer.credit_limit === undefined
            ? null
            : (0, helpers_1.asNumber)(customer.credit_limit);
        const creditAvailable = creditLimit === null ? null : Math.max(0, creditLimit - balanceDue);
        return {
            summary: {
                totalPaid,
                balanceDue,
                creditLimit,
                creditAvailable,
                openingBalance: opening,
                saleCount: sales.length,
                paymentCount: payments.length,
            },
            entries: entries.reverse(),
            payments: payments
                .map((p) => ({
                id: p.id,
                amount: (0, helpers_1.asNumber)(p.amount),
                payment_date: p.payment_date,
                method: p.method,
                reference: p.reference,
                notes: p.notes,
                created_at: p.created_at,
                user: p.user,
            }))
                .reverse(),
        };
    }
    async createCustomerPayment(customerId, data, createdBy) {
        await this.getCustomerById(customerId);
        const payment = await client_1.prisma.customerPayment.create({
            data: {
                customer_id: customerId,
                amount: data.amount,
                payment_date: data.paymentDate
                    ? new Date(data.paymentDate)
                    : new Date(),
                method: data.method || 'CASH',
                reference: data.reference || null,
                notes: data.notes || null,
                created_by: createdBy,
            },
            include: { user: { select: { email: true } } },
        });
        return {
            id: payment.id,
            amount: (0, helpers_1.asNumber)(payment.amount),
            payment_date: payment.payment_date,
            method: payment.method,
            reference: payment.reference,
            notes: payment.notes,
            created_at: payment.created_at,
            user: payment.user,
        };
    }
    async deleteCustomerPayment(customerId, paymentId) {
        const payment = await client_1.prisma.customerPayment.findFirst({
            where: { id: paymentId, customer_id: customerId },
        });
        if (!payment)
            throw new apiError_1.AppError(404, 'Payment not found');
        await client_1.prisma.customerPayment.delete({ where: { id: paymentId } });
        return { message: 'Payment deleted successfully' };
    }
}
exports.default = CustomerService;
//# sourceMappingURL=customer.service.js.map