import { Router } from 'express';
import {
  createGuestOrder,
  getGuestOrders,
  getGuestOrderById,
  trackGuestOrder,
} from '../controllers/guestOrder.controller';
import { validate } from '../middleware/validation.middleware';
import {
  createGuestOrderSchema,
  trackGuestOrderSchema,
} from '../validations/guestOrder.validation';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Public — guest checkout
router.post('/', validate(createGuestOrderSchema), createGuestOrder);

// Public — customer order status (order number + email or phone)
router.post('/track', validate(trackGuestOrderSchema), trackGuestOrder);

// Staff — list / detail
router.get('/', authenticate, getGuestOrders);
router.get('/:id', authenticate, getGuestOrderById);

export default router;
