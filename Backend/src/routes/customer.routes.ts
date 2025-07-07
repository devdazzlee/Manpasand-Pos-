import express from 'express';
import { createCustomer, createShopCustomer, deleteCustomer, getCustomerById, getCustomers, loginCustomer, logoutCustomer, updateCustomer, updateCustomerByAdmin } from '../controllers/customer.controller';
import { validate } from '../middleware/validation.middleware';
import { cusRegisterationSchema, customerLoginSchema, customerUpdateSchema } from '../validations/customer.validation';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { authenticateCustomer } from '../middleware/customerAuth.middleware';

const router = express.Router();

router.post('/register', validate(customerLoginSchema), createCustomer);
router.post('/login', validate(customerLoginSchema), loginCustomer);
router.put('/', authenticateCustomer, validate(customerUpdateSchema), updateCustomer);
router.post('/logout', authenticateCustomer, logoutCustomer);

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));
router.post('/', validate(cusRegisterationSchema), createShopCustomer);
router.get('/', getCustomers);
router.put('/:customerId', validate(customerUpdateSchema), updateCustomerByAdmin);
router.delete('/:customerId', deleteCustomer);
router.get('/:customerId', getCustomerById);

export default router;