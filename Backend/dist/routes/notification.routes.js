"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notification_controller_1 = require("../controllers/notification.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(auth_middleware_1.authenticate);
// Get notifications with filters
router.get('/', notification_controller_1.getNotifications);
// Get notification statistics
router.get('/stats', notification_controller_1.getStats);
// Get notification by ID
router.get('/:id', notification_controller_1.getNotificationById);
// Mark notification as read
router.patch('/:id/read', notification_controller_1.markAsRead);
// Mark all notifications as read
router.patch('/read-all', notification_controller_1.markAllAsRead);
// Delete notification
router.delete('/:id', notification_controller_1.deleteNotification);
exports.default = router;
//# sourceMappingURL=notification.routes.js.map