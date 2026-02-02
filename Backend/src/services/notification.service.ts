import { Prisma, NotificationType, NotificationPriority } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';

interface CreateNotificationParams {
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  category?: string;
  branchId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

class NotificationService {
  /**
   * Create a new notification
   */
  async createNotification(params: CreateNotificationParams) {
    return prisma.notification.create({
      data: {
        type: params.type,
        priority: params.priority || NotificationPriority.MEDIUM,
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
  async getNotifications({
    branchId,
    userId,
    type,
    isRead,
    priority,
    limit = 100,
    offset = 0,
  }: {
    branchId?: string;
    userId?: string;
    type?: NotificationType;
    isRead?: boolean;
    priority?: NotificationPriority;
    limit?: number;
    offset?: number;
  }) {
    const where: Prisma.NotificationWhereInput = {};

    // IMPORTANT: Exclude SALE type notifications per client requirement (Konain Bhai 1/5/2026)
    // Cash Counter sale notifications should NOT appear in notifications panel
    // Only important notifications (Inventory Low, Website Orders, etc.) should be shown
    where.type = {
      notIn: [NotificationType.SALE],
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

    if (type) {
      // Override exclusion if specific type is requested
      where.type = type;
    }

    if (isRead !== undefined) {
      where.is_read = isRead;
    }

    if (priority) {
      where.priority = priority;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
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
      prisma.notification.count({ where }),
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
  async getNotificationById(id: string) {
    const notification = await prisma.notification.findUnique({
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
      throw new AppError(404, 'Notification not found');
    }

    return notification;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: string) {
    return prisma.notification.update({
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
  async markAllAsRead({ branchId, userId }: { branchId?: string; userId?: string }) {
    const where: Prisma.NotificationWhereInput = {
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

    return prisma.notification.updateMany({
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
  async deleteNotification(id: string) {
    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new AppError(404, 'Notification not found');
    }

    return prisma.notification.delete({
      where: { id },
    });
  }

  /**
   * Get notification statistics
   */
  async getStats({ branchId, userId }: { branchId?: string; userId?: string }) {
    const where: Prisma.NotificationWhereInput = {};

    // IMPORTANT: Exclude SALE type notifications per client requirement (Konain Bhai 1/5/2026)
    // Cash Counter sale notifications should NOT appear in notifications panel
    // Only important notifications (Inventory Low, Website Orders, etc.) should be shown
    where.type = {
      notIn: [NotificationType.SALE],
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

    const [total, unread, highPriority, today] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { ...where, is_read: false },
      }),
      prisma.notification.count({
        where: {
          ...where,
          priority: NotificationPriority.HIGH,
        },
      }),
      prisma.notification.count({
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
  async notifySaleCreated({
    saleId,
    saleNumber,
    totalAmount,
    branchId,
    userId,
  }: {
    saleId: string;
    saleNumber: string;
    totalAmount: number;
    branchId: string;
    userId?: string;
  }) {
    return this.createNotification({
      type: NotificationType.SALE,
      priority: NotificationPriority.MEDIUM,
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
  async notifyLowStock({
    productId,
    productName,
    currentStock,
    minStock,
    branchId,
  }: {
    productId: string;
    productName: string;
    currentStock: number;
    minStock: number;
    branchId: string;
  }) {
    return this.createNotification({
      type: NotificationType.STOCK,
      priority: currentStock === 0 ? NotificationPriority.CRITICAL : NotificationPriority.HIGH,
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
  async notifyReturnProcessed({
    returnId,
    saleNumber,
    returnAmount,
    branchId,
    userId,
  }: {
    returnId: string;
    saleNumber: string;
    returnAmount: number;
    branchId: string;
    userId?: string;
  }) {
    return this.createNotification({
      type: NotificationType.RETURN,
      priority: NotificationPriority.MEDIUM,
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
  async notifyExchangeProcessed({
    exchangeId,
    saleNumber,
    branchId,
    userId,
  }: {
    exchangeId: string;
    saleNumber: string;
    branchId: string;
    userId?: string;
  }) {
    return this.createNotification({
      type: NotificationType.EXCHANGE,
      priority: NotificationPriority.MEDIUM,
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
  async notifyOrderCreated({
    orderId,
    orderNumber,
    totalAmount,
    branchId,
    userId,
  }: {
    orderId: string;
    orderNumber: string;
    totalAmount: number;
    branchId?: string;
    userId?: string;
  }) {
    return this.createNotification({
      type: NotificationType.ORDER,
      priority: NotificationPriority.MEDIUM,
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
  async notifyPurchaseOrderCreated({
    poId,
    poNumber,
    supplierName,
    branchId,
    userId,
  }: {
    poId: string;
    poNumber: string;
    supplierName: string;
    branchId: string;
    userId?: string;
  }) {
    return this.createNotification({
      type: NotificationType.PURCHASE_ORDER,
      priority: NotificationPriority.MEDIUM,
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
  async notifyPaymentFailed({
    saleId,
    saleNumber,
    amount,
    reason,
    branchId,
    userId,
  }: {
    saleId: string;
    saleNumber: string;
    amount: number;
    reason: string;
    branchId: string;
    userId?: string;
  }) {
    return this.createNotification({
      type: NotificationType.PAYMENT,
      priority: NotificationPriority.HIGH,
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
  async notifySystemEvent({
    title,
    message,
    priority = NotificationPriority.MEDIUM,
    branchId,
    userId,
    metadata,
  }: {
    title: string;
    message: string;
    priority?: NotificationPriority;
    branchId?: string;
    userId?: string;
    metadata?: Record<string, any>;
  }) {
    return this.createNotification({
      type: NotificationType.SYSTEM,
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

export { NotificationService };

