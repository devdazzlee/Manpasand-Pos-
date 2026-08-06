"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markSalaryPaidSchema = exports.salaryIdParamSchema = exports.listSalariesSchema = exports.updateSalarySchema = exports.createSalarySchema = void 0;
const zod_1 = require("zod");
exports.createSalarySchema = zod_1.z.object({
    body: zod_1.z.object({
        employee_id: zod_1.z.string().uuid(),
        month: zod_1.z.coerce.number().min(1).max(12),
        year: zod_1.z.coerce.number().min(2020),
        amount: zod_1.z.coerce.number().positive('Amount must be greater than 0'),
        is_paid: zod_1.z.boolean().optional(),
        paid_date: zod_1.z.string().datetime().optional(),
        notes: zod_1.z.string().optional(),
    }),
});
exports.updateSalarySchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
    body: zod_1.z.object({
        employee_id: zod_1.z.string().uuid().optional(),
        month: zod_1.z.coerce.number().min(1).max(12).optional(),
        year: zod_1.z.coerce.number().min(2020).optional(),
        amount: zod_1.z.coerce.number().positive('Amount must be greater than 0').optional(),
        is_paid: zod_1.z.boolean().optional(),
        paid_date: zod_1.z.string().datetime().nullable().optional(),
        notes: zod_1.z.string().nullable().optional(),
    }),
});
exports.listSalariesSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().optional(),
        limit: zod_1.z.coerce.number().optional(),
        employee_id: zod_1.z.string().uuid().optional(),
        month: zod_1.z.coerce.number().min(1).max(12).optional(),
        year: zod_1.z.coerce.number().min(2020).optional(),
        is_paid: zod_1.z.enum(['true', 'false']).optional(),
        search: zod_1.z.string().optional(),
        fetch_all: zod_1.z.enum(['true', 'false']).optional(),
    }),
});
exports.salaryIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
});
exports.markSalaryPaidSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
    body: zod_1.z
        .object({
        paid_date: zod_1.z.string().datetime().optional(),
    })
        .optional(),
});
//# sourceMappingURL=salary.validation.js.map