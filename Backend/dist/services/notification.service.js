"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
class NotificationService {
    /**
     * Create a new notification
     */
    async createNotification(params) {
        return client_2.prisma.notification.create({
            data: {
                type: params.type,
                priority: params.priority || client_1.NotificationPriority.MEDIUM,
                title: params.title,
                message: params.message,
                category: params.category || null,
                branch_id: params.branchId || null,
                user_id: params.userId || null,
                metadata: params.metadata ? params.metadata : undefined,
            },
        });
    }
    /**
     * Get notifications with filters
     */
    async getNotifications({ branchId, userId, type, isRead, priority, limit = 100, offset = 0, }) {
        const where = {};
        if (branchId) {
            where.branch_id = branchId;
        }
        // If userId is specified, get only that user's notifications
        // If userId is not specified, get all notifications (both user-specific and general)
        if (userId) {
            where.user_id = userId;
        }
        // If userId is not provided, don't filter by user_id (get all notifications)
        if (type) {
            where.type = type;
        }
        if (isRead !== undefined) {
            where.is_read = isRead;
        }
        if (priority) {
            where.priority = priority;
        }
        const [notifications, total] = await Promise.all([
            client_2.prisma.notification.findMany({
                where,
                include: {
                    branch: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    user: {
                        select: {
                            id: true,
                            email: true,
                        },
                    },
                },
                orderBy: { created_at: 'desc' },
                take: limit,
                skip: offset,
            }),
            client_2.prisma.notification.count({ where }),
        ]);
        return {
            notifications,
            total,
            limit,
            offset,
        };
    }
    /**
     * Get notification by ID
     */
    async getNotificationById(id) {
        const notification = await client_2.prisma.notification.findUnique({
            where: { id },
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                user: {
                    select: {
                        id: true,
                        email: true,
                    },
                },
            },
        });
        if (!notification) {
            throw new apiError_1.AppError(404, 'Notification not found');
        }
        return notification;
    }
    /**
     * Mark notification as read
     */
    async markAsRead(id) {
        return client_2.prisma.notification.update({
            where: { id },
            data: {
                is_read: true,
                read_at: new Date(),
            },
        });
    }
    /**
     * Mark all notifications as read
     */
    async markAllAsRead({ branchId, userId }) {
        const where = {
            is_read: false,
        };
        if (branchId) {
            where.branch_id = branchId;
        }
        // If userId is specified, get only that user's notifications
        // If userId is not specified, get all notifications (both user-specific and general)
        if (userId) {
            where.user_id = userId;
        }
        // If userId is not provided, don't filter by user_id (get all notifications)
        return client_2.prisma.notification.updateMany({
            where,
            data: {
                is_read: true,
                read_at: new Date(),
            },
        });
    }
    /**
     * Delete notification
     */
    async deleteNotification(id) {
        const notification = await client_2.prisma.notification.findUnique({
            where: { id },
        });
        if (!notification) {
            throw new apiError_1.AppError(404, 'Notification not found');
        }
        return client_2.prisma.notification.delete({
            where: { id },
        });
    }
    /**
     * Get notification statistics
     */
    async getStats({ branchId, userId }) {
        const where = {};
        if (branchId) {
            where.branch_id = branchId;
        }
        // If userId is specified, get only that user's notifications
        // If userId is not specified, get all notifications (both user-specific and general)
        if (userId) {
            where.user_id = userId;
        }
        // If userId is not provided, don't filter by user_id (get all notifications)
        const [total, unread, highPriority, today] = await Promise.all([
            client_2.prisma.notification.count({ where }),
            client_2.prisma.notification.count({
                where: { ...where, is_read: false },
            }),
            client_2.prisma.notification.count({
                where: {
                    ...where,
                    priority: client_1.NotificationPriority.HIGH,
                },
            }),
            client_2.prisma.notification.count({
                where: {
                    ...where,
                    created_at: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0)),
                    },
                },
            }),
        ]);
        return {
            total,
            unread,
            highPriority,
            today,
        };
    }
    // ========== Helper methods for creating specific notification types ==========
    /**
     * Create sale notification
     */
    async notifySaleCreated({ saleId, saleNumber, totalAmount, branchId, userId, }) {
        return this.createNotification({
            type: client_1.NotificationType.SALE,
            priority: client_1.NotificationPriority.MEDIUM,
            title: 'New Sale Completed',
            message: `Sale #${saleNumber} completed for Rs ${totalAmount.toFixed(2)}`,
            category: 'sales',
            branchId,
            userId,
            metadata: {
                saleId,
                saleNumber,
                totalAmount,
            },
        });
    }
    /**
     * Create stock low notification
     */
    async notifyLowStock({ productId, productName, currentStock, minStock, branchId, }) {
        return this.createNotification({
            type: client_1.NotificationType.STOCK,
            priority: currentStock === 0 ? client_1.NotificationPriority.CRITICAL : client_1.NotificationPriority.HIGH,
            title: currentStock === 0 ? 'Product Out of Stock' : 'Low Stock Alert',
            message: `${productName} is ${currentStock === 0 ? 'out of stock' : `running low (${currentStock} units remaining, minimum: ${minStock})`}`,
            category: 'inventory',
            branchId,
            metadata: {
                productId,
                productName,
                currentStock,
                minStock,
            },
        });
    }
    /**
     * Create return notification
     */
    async notifyReturnProcessed({ returnId, saleNumber, returnAmount, branchId, userId, }) {
        return this.createNotification({
            type: client_1.NotificationType.RETURN,
            priority: client_1.NotificationPriority.MEDIUM,
            title: 'Return Processed',
            message: `Return processed for Sale #${saleNumber}, amount: Rs ${returnAmount.toFixed(2)}`,
            category: 'returns',
            branchId,
            userId,
            metadata: {
                returnId,
                saleNumber,
                returnAmount,
            },
        });
    }
    /**
     * Create exchange notification
     */
    async notifyExchangeProcessed({ exchangeId, saleNumber, branchId, userId, }) {
        return this.createNotification({
            type: client_1.NotificationType.EXCHANGE,
            priority: client_1.NotificationPriority.MEDIUM,
            title: 'Exchange Processed',
            message: `Exchange processed for Sale #${saleNumber}`,
            category: 'exchanges',
            branchId,
            userId,
            metadata: {
                exchangeId,
                saleNumber,
            },
        });
    }
    /**
     * Create order notification
     */
    async notifyOrderCreated({ orderId, orderNumber, totalAmount, branchId, userId, }) {
        return this.createNotification({
            type: client_1.NotificationType.ORDER,
            priority: client_1.NotificationPriority.MEDIUM,
            title: 'New Order Created',
            message: `Order #${orderNumber} created with total amount Rs ${totalAmount.toFixed(2)}`,
            category: 'orders',
            branchId,
            userId,
            metadata: {
                orderId,
                orderNumber,
                totalAmount,
            },
        });
    }
    /**
     * Create purchase order notification
     */
    async notifyPurchaseOrderCreated({ poId, poNumber, supplierName, branchId, userId, }) {
        return this.createNotification({
            type: client_1.NotificationType.PURCHASE_ORDER,
            priority: client_1.NotificationPriority.MEDIUM,
            title: 'New Purchase Order',
            message: `Purchase Order #${poNumber} created for supplier ${supplierName}`,
            category: 'purchase_orders',
            branchId,
            userId,
            metadata: {
                poId,
                poNumber,
                supplierName,
            },
        });
    }
    /**
     * Create payment notification
     */
    async notifyPaymentFailed({ saleId, saleNumber, amount, reason, branchId, userId, }) {
        return this.createNotification({
            type: client_1.NotificationType.PAYMENT,
            priority: client_1.NotificationPriority.HIGH,
            title: 'Payment Failed',
            message: `Payment failed for Sale #${saleNumber} (Rs ${amount.toFixed(2)}): ${reason}`,
            category: 'payments',
            branchId,
            userId,
            metadata: {
                saleId,
                saleNumber,
                amount,
                reason,
            },
        });
    }
    /**
     * Create system notification
     */
    async notifySystemEvent({ title, message, priority = client_1.NotificationPriority.MEDIUM, branchId, userId, metadata, }) {
        return this.createNotification({
            type: client_1.NotificationType.SYSTEM,
            priority,
            title,
            message,
            category: 'system',
            branchId,
            userId,
            metadata,
        });
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notification.service.js.map