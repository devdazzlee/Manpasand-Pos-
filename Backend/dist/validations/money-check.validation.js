"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawerSourceSchema = exports.paidFromSchema = exports.editClosingSchema = exports.closeRegisterSchema = exports.dismissSchema = exports.sessionParamSchema = exports.voucherParamSchema = exports.moveSchema = exports.reconcileSchema = exports.dateQuerySchema = void 0;
const zod_1 = require("zod");
const ymd = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use a date like 2026-10-28');
const money = zod_1.z.coerce.number().finite();
const note = zod_1.z.string().max(300).nullish();
const methodRows = zod_1.z
    .array(zod_1.z.object({ method: zod_1.z.enum(['CARD', 'BANK_TRANSFER', 'MOBILE_MONEY']), actual: money.min(0, 'Amount cannot be negative') }))
    .max(5)
    .optional();
exports.dateQuerySchema = zod_1.z.object({ query: zod_1.z.object({ date: ymd.optional() }) });
exports.reconcileSchema = zod_1.z.object({
    body: zod_1.z.object({
        accountId: zod_1.z.string().uuid(),
        actual: money,
        date: ymd.optional(),
        reason: zod_1.z.enum(['OWNER_TOOK', 'OWNER_ADDED', 'TRANSFER', 'BANK_CHARGES', 'UNKNOWN']),
        otherAccountId: zod_1.z.string().uuid().nullish(),
        note,
    }),
});
exports.moveSchema = zod_1.z.object({
    body: zod_1.z.object({
        type: zod_1.z.enum(['CASH_TO_BANK', 'BANK_TO_CASH', 'OWNER_TOOK', 'OWNER_ADDED', 'BANK_CHARGES']),
        amount: money.positive('Amount must be more than zero'),
        date: ymd.optional(),
        fromAccountId: zod_1.z.string().uuid().nullish(),
        toAccountId: zod_1.z.string().uuid().nullish(),
        note,
    }),
});
exports.voucherParamSchema = zod_1.z.object({ params: zod_1.z.object({ voucherId: zod_1.z.string().uuid() }) });
exports.sessionParamSchema = zod_1.z.object({ params: zod_1.z.object({ id: zod_1.z.string().uuid() }) });
exports.dismissSchema = zod_1.z.object({ body: zod_1.z.object({ issueId: zod_1.z.string().min(3).max(200) }) });
exports.closeRegisterSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: zod_1.z.object({
        closing: money.min(0, 'Cash counted cannot be negative'),
        reconciliations: methodRows,
        closedAt: zod_1.z.string().datetime({ offset: true }).nullish(),
        note,
    }),
});
exports.editClosingSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: zod_1.z.object({
        closing: money.min(0, 'Cash counted cannot be negative').nullish(),
        reconciliations: methodRows,
        note,
    }),
});
exports.paidFromSchema = zod_1.z.object({
    body: zod_1.z.object({
        entity: zod_1.z.enum(['EXPENSE', 'SUPPLIER_PAYMENT']),
        id: zod_1.z.string().uuid(),
        accountId: zod_1.z.string().uuid(),
    }),
});
exports.drawerSourceSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: zod_1.z.object({ fromDrawer: zod_1.z.boolean() }),
});
//# sourceMappingURL=money-check.validation.js.map