import { z } from 'zod';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use a date like 2026-10-28');
const money = z.coerce.number().finite();
const note = z.string().max(300).nullish();
const methodRows = z
  .array(z.object({ method: z.enum(['CARD', 'BANK_TRANSFER', 'MOBILE_MONEY']), actual: money.min(0, 'Amount cannot be negative') }))
  .max(5)
  .optional();

export const dateQuerySchema = z.object({ query: z.object({ date: ymd.optional() }) });

export const reconcileSchema = z.object({
  body: z.object({
    accountId: z.string().uuid(),
    actual: money,
    date: ymd.optional(),
    reason: z.enum(['OWNER_TOOK', 'OWNER_ADDED', 'TRANSFER', 'BANK_CHARGES', 'UNKNOWN']),
    otherAccountId: z.string().uuid().nullish(),
    note,
  }),
});

export const moveSchema = z.object({
  body: z.object({
    type: z.enum(['CASH_TO_BANK', 'BANK_TO_CASH', 'OWNER_TOOK', 'OWNER_ADDED', 'BANK_CHARGES']),
    amount: money.positive('Amount must be more than zero'),
    date: ymd.optional(),
    fromAccountId: z.string().uuid().nullish(),
    toAccountId: z.string().uuid().nullish(),
    note,
  }),
});

export const voucherParamSchema = z.object({ params: z.object({ voucherId: z.string().uuid() }) });
export const sessionParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

export const dismissSchema = z.object({ body: z.object({ issueId: z.string().min(3).max(200) }) });

export const closeRegisterSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    closing: money.min(0, 'Cash counted cannot be negative'),
    reconciliations: methodRows,
    closedAt: z.string().datetime({ offset: true }).nullish(),
    note,
  }),
});

export const editClosingSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    closing: money.min(0, 'Cash counted cannot be negative').nullish(),
    reconciliations: methodRows,
    note,
  }),
});

export const paidFromSchema = z.object({
  body: z.object({
    entity: z.enum(['EXPENSE', 'SUPPLIER_PAYMENT']),
    id: z.string().uuid(),
    accountId: z.string().uuid(),
  }),
});

export const drawerSourceSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ fromDrawer: z.boolean() }),
});
