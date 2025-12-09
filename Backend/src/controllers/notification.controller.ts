import { Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';
import { NotificationType, NotificationPriority } from '@prisma/client';

const notificationService = new NotificationService();

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  // If user is SUPER_ADMIN or ADMIN, don't filter by branch (get all notifications)
  // Otherwise, filter by user's branch
  const isAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
  const branchId = isAdmin ? undefined : (req.user?.branch_id || req.query.branchId as string | undefined);
  const userId = req.user?.id || req.query.userId as string | undefined;
  const type = req.query.type as NotificationType | undefined;
  const isRead = req.query.isRead === 'true' ? true : req.query.isRead === 'false' ? false : undefined;
  const priority = req.query.priority as NotificationPriority | undefined;
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;

  const result = await notificationService.getNotifications({
    branchId,
    userId,
    type,
    isRead,
    priority,
    limit,
    offset,
  });

  new ApiResponse(result, 'Notifications fetched successfully').send(res);
});

export const getNotificationById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const notification = await notificationService.getNotificationById(id);
  new ApiResponse(notification, 'Notification fetched successfully').send(res);
});

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const notification = await notificationService.markAsRead(id);
  new ApiResponse(notification, 'Notification marked as read').send(res);
});

export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  // If user is SUPER_ADMIN or ADMIN, don't filter by branch (mark all notifications)
  // Otherwise, filter by user's branch
  const isAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
  const branchId = isAdmin ? undefined : (req.user?.branch_id || req.body.branchId);
  const userId = req.user?.id || req.body.userId;

  const result = await notificationService.markAllAsRead({ branchId, userId });
  new ApiResponse(result, 'All notifications marked as read').send(res);
});

export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  await notificationService.deleteNotification(id);
  new ApiResponse(null, 'Notification deleted successfully').send(res);
});

export const getStats = asyncHandler(async (req: Request, res: Response) => {
  // If user is SUPER_ADMIN or ADMIN, don't filter by branch (get all notifications)
  // Otherwise, filter by user's branch
  const isAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
  const branchId = isAdmin ? undefined : (req.user?.branch_id || req.query.branchId as string | undefined);
  const userId = req.user?.id || req.query.userId as string | undefined;

  const stats = await notificationService.getStats({ branchId, userId });
  new ApiResponse(stats, 'Notification statistics fetched successfully').send(res);
});

