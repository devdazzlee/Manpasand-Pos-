import { Router } from 'express';
import {
  getOrders,
  getOrder,
  updateOrderStatus,
  cancelOrderByAdmin,
} from '../controllers/order.controller';
import { validate } from '../middleware/validation.middleware';
import { updateOrderStatusSchema } from '../validations/order.validation';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// 🛡 ADMIN ROUTES
router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

router.get('/', getOrders);
router.get('/:orderId', getOrder);
router.patch('/:orderId/status', validate(updateOrderStatusSchema), updateOrderStatus);
router.delete('/:orderId', cancelOrderByAdmin);

export default router;
