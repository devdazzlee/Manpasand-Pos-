import { z } from 'zod';

const phoneRegex = /^[0-9+\-\s]+$/;

const optionalEmail = z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, {
        message: 'Invalid email address',
    });

const optionalMoney = z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z
        .number({ invalid_type_error: 'Must be a valid number' })
        .nonnegative('Amount cannot be negative')
        .optional(),
);

// Customer self-registration — only email is required (the password is
// generated / sent separately in the existing flow).
const cusRegisterationSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address'),
    }),
});

const customerLoginSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(6, 'Password must be at least 6 characters long'),
    }),
});

// Admin / staff creating a customer from the POS Customers screen.
const customerCreateByAdminSchema = z.object({
    body: z.object({
        name: z.string().trim().min(1, 'Name is required'),
        phone_number: z
            .string()
            .trim()
            .min(1, 'Phone number is required')
            .min(7, 'Phone number must be at least 7 digits')
            .max(20, 'Phone number is too long')
            .regex(phoneRegex, 'Phone number must contain only digits, +, -, or spaces'),
        email: optionalEmail,
        address: z.string().trim().optional(),
        billing_address: z.string().trim().optional(),
        credit_limit: optionalMoney,
        previous_credit_balance: optionalMoney,
        is_active: z.boolean().optional(),
    }),
});

const customerUpdateSchema = z.object({
    body: z.object({
        name: z.string().trim().min(1, 'Name is required').nullable().optional(),
        phone_number: z
            .string()
            .trim()
            .min(7, 'Phone number must be at least 7 digits')
            .max(20, 'Phone number is too long')
            .regex(phoneRegex, 'Phone number must contain only digits, +, -, or spaces')
            .nullable()
            .optional(),
        email: z
            .union([
                z.string().trim().email('Invalid email address'),
                z.literal(''),
                z.null(),
            ])
            .optional(),
        address: z.string().trim().nullable().optional(),
        billing_address: z.string().trim().nullable().optional(),
        credit_limit: z.number().nonnegative('Credit limit cannot be negative').nullable().optional(),
        previous_credit_balance: z
            .number()
            .nonnegative('Previous credit balance cannot be negative')
            .nullable()
            .optional(),
        is_active: z.boolean().optional(),
    }),
});

export {
    cusRegisterationSchema,
    customerLoginSchema,
    customerCreateByAdminSchema,
    customerUpdateSchema,
};
