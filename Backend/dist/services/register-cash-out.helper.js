"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordCashPayOnOpenRegister = recordCashPayOnOpenRegister;
exports.reverseCashPayOnRegisterByPaymentRefs = reverseCashPayOnRegisterByPaymentRefs;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
/**
 * When salary / commission / similar is paid in CASH while a register is open,
 * record it as an approved expense on that drawer so Expected cash drops.
 * Paid from any account other than Cash in Hand (e.g. the bank) never touches
 * the drawer, whatever method was picked.
 */
async function recordCashPayOnOpenRegister(opts) {
    const amount = Math.round((Number(opts.amount) + Number.EPSILON) * 100) / 100;
    if (!(amount > 0.005))
        return null;
    const method = 'CASH';
    let paidFrom = opts.paidFromAccountId;
    if (paidFrom === undefined && opts.reference) {
        const pay = await client_2.prisma.supplierPayment
            .findUnique({ where: { id: opts.reference }, select: { paid_from_account_id: true } })
            .catch(() => null);
        paidFrom = pay?.paid_from_account_id;
    }
    if (paidFrom) {
        const account = await client_2.prisma.transactionalAccount.findUnique({ where: { id: paidFrom }, select: { system_key: true } });
        if (account && account.system_key !== 'CASH')
            return null;
    }
    const open = await client_2.prisma.cashFlow.findMany({
        where: {
            status: 'OPEN',
            ...(opts.branchId ? { branch_id: opts.branchId } : {}),
        },
        select: { id: true, branch_id: true },
        take: 2,
    });
    if (open.length !== 1)
        return null;
    return client_2.prisma.expense.create({
        data: {
            particular: opts.particular.trim(),
            amount: new client_1.Prisma.Decimal(amount),
            payment_method: method,
            reference: opts.reference?.trim() || null,
            notes: opts.notes?.trim() || null,
            expense_date: new Date(),
            branch_id: opts.branchId ?? open[0].branch_id,
            cashflow_id: open[0].id,
            status: 'APPROVED',
            approved_by: opts.userId ?? null,
            approved_at: new Date(),
            created_by: opts.userId ?? null,
        },
        select: { id: true, cashflow_id: true },
    });
}
/**
 * Reverse drawer cash-outs that were recorded for supplier payment IDs
 * (Stock In edit cash ↔ credit / payment amount changes).
 */
async function reverseCashPayOnRegisterByPaymentRefs(paymentIds) {
    const ids = [...new Set(paymentIds.map((id) => String(id || '').trim()).filter(Boolean))];
    if (ids.length === 0)
        return 0;
    const result = await client_2.prisma.expense.deleteMany({
        where: {
            reference: { in: ids },
            particular: { startsWith: 'Purchase payment' },
            cashflow_id: { not: null },
        },
    });
    return result.count;
}
//# sourceMappingURL=register-cash-out.helper.js.map