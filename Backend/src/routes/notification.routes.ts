import { Router } from 'express';
import {
  getNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getStats,
} from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get notifications with filters
router.get('/', getNotifications);

// Get notification statistics
router.get('/stats', getStats);

// Get notification by ID
router.get('/:id', getNotificationById);

// Mark notification as read
router.patch('/:id/read', markAsRead);

// Mark all notifications as read
router.patch('/read-all', markAllAsRead);

// Delete notification
router.delete('/:id', deleteNotification);

export default router;











