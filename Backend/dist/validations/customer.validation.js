"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomerParamsSchema = exports.deleteCustomerPaymentSchema = exports.createCustomerPaymentSchema = exports.customerUpdateSchema = exports.customerCreateByAdminSchema = exports.customerLoginSchema = exports.cusRegisterationSchema = void 0;
const zod_1 = require("zod");
const phoneRegex = /^[0-9+\-\s]+$/;
const optionalEmail = zod_1.z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || zod_1.z.string().email().safeParse(v).success, {
    message: 'Invalid email address',
});
const optionalMoney = zod_1.z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), zod_1.z
    .number({ invalid_type_error: 'Must be a valid number' })
    .nonnegative('Amount cannot be negative')
    .optional());
// Customer self-registration — only email is required (the password is
// generated / sent separately in the existing flow).
const cusRegisterationSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email address'),
    }),
});
exports.cusRegisterationSchema = cusRegisterationSchema;
const customerLoginSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email address'),
        password: zod_1.z.string().min(6, 'Password must be at least 6 characters long'),
    }),
});
exports.customerLoginSchema = customerLoginSchema;
// Admin / staff creating a customer from the POS Customers screen.
const customerCreateByAdminSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().trim().min(1, 'Name is required'),
        phone_number: zod_1.z
            .string()
            .trim()
            .min(1, 'Phone number is required')
            .min(7, 'Phone number must be at least 7 digits')
            .max(20, 'Phone number is too long')
            .regex(phoneRegex, 'Phone number must contain only digits, +, -, or spaces'),
        email: optionalEmail,
        address: zod_1.z.string().trim().optional(),
        billing_address: zod_1.z.string().trim().optional(),
        credit_limit: optionalMoney,
        previous_credit_balance: optionalMoney,
        is_active: zod_1.z.boolean().optional(),
    }),
});
exports.customerCreateByAdminSchema = customerCreateByAdminSchema;
const customerUpdateSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().trim().min(1, 'Name is required').nullable().optional(),
        phone_number: zod_1.z
            .string()
            .trim()
            .min(7, 'Phone number must be at least 7 digits')
            .max(20, 'Phone number is too long')
            .regex(phoneRegex, 'Phone number must contain only digits, +, -, or spaces')
            .nullable()
            .optional(),
        email: zod_1.z
            .union([
            zod_1.z.string().trim().email('Invalid email address'),
            zod_1.z.literal(''),
            zod_1.z.null(),
        ])
            .optional(),
        address: zod_1.z.string().trim().nullable().optional(),
        billing_address: zod_1.z.string().trim().nullable().optional(),
        credit_limit: zod_1.z.number().nonnegative('Credit limit cannot be negative').nullable().optional(),
        previous_credit_balance: zod_1.z
            .number()
            .nonnegative('Previous credit balance cannot be negative')
            .nullable()
            .optional(),
        is_active: zod_1.z.boolean().optional(),
    }),
});
exports.customerUpdateSchema = customerUpdateSchema;
const getCustomerParamsSchema = zod_1.z.object({
    params: zod_1.z.object({
        customerId: zod_1.z.string().min(1, 'Customer ID is required'),
    }),
});
exports.getCustomerParamsSchema = getCustomerParamsSchema;
const createCustomerPaymentSchema = zod_1.z.object({
    params: zod_1.z.object({
        customerId: zod_1.z.string().min(1, 'Customer ID is required'),
    }),
    body: zod_1.z.object({
        amount: zod_1.z.coerce.number().positive('Amount must be greater than 0'),
        paymentDate: zod_1.z.string().optional(),
        method: zod_1.z
            .enum(['CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'OTHER'])
            .optional()
            .default('CASH'),
        reference: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    }),
});
exports.createCustomerPaymentSchema = createCustomerPaymentSchema;
const deleteCustomerPaymentSchema = zod_1.z.object({
    params: zod_1.z.object({
        customerId: zod_1.z.string().min(1, 'Customer ID is required'),
        paymentId: zod_1.z.string().min(1, 'Payment ID is required'),
    }),
});
exports.deleteCustomerPaymentSchema = deleteCustomerPaymentSchema;
//# sourceMappingURL=customer.validation.js.map