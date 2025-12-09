"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStats = exports.deleteNotification = exports.markAllAsRead = exports.markAsRead = exports.getNotificationById = exports.getNotifications = void 0;
const notification_service_1 = require("../services/notification.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const notificationService = new notification_service_1.NotificationService();
exports.getNotifications = (0, asyncHandler_1.default)(async (req, res) => {
    // If user is SUPER_ADMIN or ADMIN, don't filter by branch (get all notifications)
    // Otherwise, filter by user's branch
    const isAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
    const branchId = isAdmin ? undefined : (req.user?.branch_id || req.query.branchId);
    const userId = req.user?.id || req.query.userId;
    const type = req.query.type;
    const isRead = req.query.isRead === 'true' ? true : req.query.isRead === 'false' ? false : undefined;
    const priority = req.query.priority;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const result = await notificationService.getNotifications({
        branchId,
        userId,
        type,
        isRead,
        priority,
        limit,
        offset,
    });
    new apiResponse_1.ApiResponse(result, 'Notifications fetched successfully').send(res);
});
exports.getNotificationById = (0, asyncHandler_1.default)(async (req, res) => {
    const { id } = req.params;
    const notification = await notificationService.getNotificationById(id);
    new apiResponse_1.ApiResponse(notification, 'Notification fetched successfully').send(res);
});
exports.markAsRead = (0, asyncHandler_1.default)(async (req, res) => {
    const { id } = req.params;
    const notification = await notificationService.markAsRead(id);
    new apiResponse_1.ApiResponse(notification, 'Notification marked as read').send(res);
});
exports.markAllAsRead = (0, asyncHandler_1.default)(async (req, res) => {
    // If user is SUPER_ADMIN or ADMIN, don't filter by branch (mark all notifications)
    // Otherwise, filter by user's branch
    const isAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
    const branchId = isAdmin ? undefined : (req.user?.branch_id || req.body.branchId);
    const userId = req.user?.id || req.body.userId;
    const result = await notificationService.markAllAsRead({ branchId, userId });
    new apiResponse_1.ApiResponse(result, 'All notifications marked as read').send(res);
});
exports.deleteNotification = (0, asyncHandler_1.default)(async (req, res) => {
    const { id } = req.params;
    await notificationService.deleteNotification(id);
    new apiResponse_1.ApiResponse(null, 'Notification deleted successfully').send(res);
});
exports.getStats = (0, asyncHandler_1.default)(async (req, res) => {
    // If user is SUPER_ADMIN or ADMIN, don't filter by branch (get all notifications)
    // Otherwise, filter by user's branch
    const isAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
    const branchId = isAdmin ? undefined : (req.user?.branch_id || req.query.branchId);
    const userId = req.user?.id || req.query.userId;
    const stats = await notificationService.getStats({ branchId, userId });
    new apiResponse_1.ApiResponse(stats, 'Notification statistics fetched successfully').send(res);
});
//# sourceMappingURL=notification.controller.js.map