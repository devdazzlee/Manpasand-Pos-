"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
class OrderService {
    async cancelOrderTransactional(orderId) {
        return client_2.prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({
                where: { id: orderId },
                include: {
                    items: true,
                },
            });
            if (!order)
                throw new apiError_1.AppError(404, 'Order not found');
            if (order.status === 'CANCELLED')
                throw new apiError_1.AppError(400, 'Already cancelled');
            if (order.status === 'COMPLETED')
                throw new apiError_1.AppError(400, 'Cannot cancel completed');
            for (const item of order.items) {
                await tx.stock.update({
                    where: {
                        product_id_branch_id: {
                            product_id: item.product_id,
                            branch_id: order.branch_id,
                        },
                    },
                    data: {
                        current_quantity: {
                            increment: item.quantity,
                        },
                    },
                });
            }
            return tx.order.update({
                where: { id: orderId },
                data: { status: 'CANCELLED' },
            });
        });
    }
    async createOrder(data) {
        return client_2.prisma.$transaction(async (tx) => {
            const productIds = data.items.map(item => item.productId);
            const products = await tx.product.findMany({
                where: {
                    id: { in: productIds },
                    is_active: true,
                },
            });
            if (products.length !== data.items.length) {
                throw new apiError_1.AppError(400, 'One or more products not found or inactive');
            }
            const stockRecords = await tx.stock.findMany({
                where: {
                    product_id: { in: productIds },
                    current_quantity: { gte: 1 },
                },
            });
            let totalAmount = new client_1.Prisma.Decimal(0);
            const orderItems = [];
            const stockUpdates = [];
            const stockMovements = [];
            for (const item of data.items) {
                const product = products.find(p => p.id === item.productId);
                if (!product) {
                    throw new apiError_1.AppError(400, `Product not found: ${item.productId}`);
                }
                // Find stock record with sufficient quantity
                const stock = stockRecords.find(s => s.product_id === item.productId && s.current_quantity >= item.quantity);
                if (!stock) {
                    throw new apiError_1.AppError(400, `Insufficient stock for product ${product.name}`);
                }
                const itemTotal = new client_1.Prisma.Decimal(product.sales_rate_inc_dis_and_tax).times(item.quantity);
                totalAmount = totalAmount.plus(itemTotal);
                orderItems.push({
                    product: { connect: { id: product.id } },
                    quantity: item.quantity,
                    price: product.sales_rate_inc_dis_and_tax,
                    total_price: itemTotal,
                });
                // Decrement stock
                stockUpdates.push(tx.stock.update({
                    where: {
                        product_id_branch_id: {
                            product_id: product.id,
                            branch_id: stock.branch_id,
                        },
                    },
                    data: {
                        current_quantity: { decrement: item.quantity },
                    },
                }));
                // Record stock movement
                stockMovements.push(tx.stockMovement.create({
                    data: {
                        product: { connect: { id: product.id } },
                        branch: { connect: { id: stock.branch_id } },
                        movement_type: 'SALE',
                        quantity_change: -item.quantity,
                        previous_qty: stock.current_quantity,
                        new_qty: stock.current_quantity - item.quantity,
                    },
                }));
            }
            await Promise.all([...stockUpdates, ...stockMovements]);
            const order = await tx.order.create({
                data: {
                    order_number: `ORD-${Date.now()}`,
                    customer: { connect: { id: data.customerId } },
                    total_amount: totalAmount,
                    status: 'PENDING',
                    payment_method: data.paymentMethod || 'CASH',
                    items: { create: orderItems },
                },
                include: {
                    items: { include: { product: true } },
                },
            });
            const sale = await tx.sale.create({
                data: {
                    sale_number: `SALE-${Date.now()}`,
                    customer: { connect: { id: data.customerId } },
                    subtotal: totalAmount,
                    total_amount: totalAmount,
                    payment_method: data.paymentMethod || 'CASH',
                    payment_status: 'PAID',
                    status: 'COMPLETED',
                    sale_items: {
                        create: orderItems.map(item => ({
                            product: item.product,
                            quantity: item.quantity,
                            unit_price: item.price,
                            line_total: item.total_price,
                        })),
                    },
                },
            });
            return { order, sale };
        }, {
            maxWait: 10000,
            timeout: 15000,
        });
    }
    async getOrders(status, page = 1, pageSize = 10) {
        const where = {
            status: status ? status : undefined,
        };
        const [orders, total] = await Promise.all([
            client_2.prisma.order.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: {
                    items: {
                        include: {
                            product: true,
                        },
                    },
                },
            }),
            client_2.prisma.order.count({ where }),
        ]);
        return {
            data: orders,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }
    async getSpecificOrder(orderId) {
        const order = await client_2.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: {
                    include: {
                        product: true,
                    },
                },
            },
        });
        if (!order) {
            throw new apiError_1.AppError(404, 'Order not found');
        }
        return order;
    }
    async getCustomerOrders(customerId) {
        const orders = await client_2.prisma.order.findMany({
            where: { customer_id: customerId },
        });
        return orders;
    }
    async getCustomerOrderById(customerId, orderId) {
        const order = await client_2.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: {
                    include: {
                        product: true,
                    },
                },
            },
        });
        if (!order) {
            throw new apiError_1.AppError(404, 'Order not found');
        }
        if (order.customer_id !== customerId) {
            throw new apiError_1.AppError(403, 'Unauthorized to access this order');
        }
        return order;
    }
    async updateOrderStatus(orderId, status) {
        const order = await client_2.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: {
                    include: { product: true },
                },
            },
        });
        if (!order) {
            throw new apiError_1.AppError(404, 'Order not found');
        }
        if (order.status === 'CANCELLED') {
            throw new apiError_1.AppError(400, 'Cannot update a cancelled order');
        }
        return client_2.prisma.order.update({
            where: { id: orderId },
            data: { status },
            include: {
                items: {
                    include: { product: true },
                },
            },
        });
    }
    async cancelOrderByAdmin(orderId) {
        return this.cancelOrderTransactional(orderId);
    }
    async cancelOrderByCustomer(customerId, orderId) {
        const order = await client_2.prisma.order.findUnique({
            where: { id: orderId },
            select: { customer_id: true },
        });
        if (!order)
            throw new apiError_1.AppError(404, 'Order not found');
        if (order.customer_id !== customerId)
            throw new apiError_1.AppError(403, 'Unauthorized to cancel this order');
        return this.cancelOrderTransactional(orderId);
    }
}
exports.OrderService = OrderService;
//# sourceMappingURL=order.service.js.map