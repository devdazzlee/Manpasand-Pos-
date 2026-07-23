import express from 'express';
import { getCurrentUser, login, logout, register, registerAdmin, changePassword } from '../controllers/auth.controller';
import { validate } from '../middleware/validation.middleware';
import { loginSchema, registerSchema, changePasswordSchema } from '../validations/auth.validation';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.post('/register', validate(registerSchema), register);
// Register endpoint for admins
router.post('/login', validate(loginSchema), login);
router.post('/logout', authenticate, logout);
// Self-service password change — any authenticated role (branch users included).
router.patch('/change-password', authenticate, validate(changePasswordSchema), changePassword);

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));
router.post('/register/admin', validate(registerSchema), registerAdmin);
router.get('/me', getCurrentUser);

export default router;
