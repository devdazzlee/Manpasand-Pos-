"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.REGISTER_PAYMENT_COPY = void 0;
exports.drawerDate = drawerDate;
exports.recordCashPayOnOpenRegister = recordCashPayOnOpenRegister;
exports.refreshClosedRegister = refreshClosedRegister;
exports.syncSupplierPaymentDrawerCopy = syncSupplierPaymentDrawerCopy;
exports.reverseCashPayOnRegisterByPaymentRefs = reverseCashPayOnRegisterByPaymentRefs;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const timezone_1 = require("../utils/timezone");
/**
 * When money left a register drawer, for the books: now — or, when the register
 * was opened on an earlier business day (entered after midnight before closing),
 * the last moment of that day, so it lands on the register's day.
 */
function drawerDate(openedAt, at = new Date()) {
    const day = (0, timezone_1.toBusinessYmd)(openedAt);
    return (0, timezone_1.toBusinessYmd)(at) === day ? at : (0, timezone_1.localRange)(day, day).end;
}
/**
 * The drawer copies recordCashPayOnOpenRegister writes for a supplier payment,
 * salary or commission paid in cash. They only make the drawer balance — the
 * payment itself is the real record, so reports and the Expenses list must
 * leave these out (use as `NOT: REGISTER_PAYMENT_COPY`) or the money counts twice.
 */
exports.REGISTER_PAYMENT_COPY = {
    cashflow_id: { not: null },
    reference: { not: null },
    OR: ['Purchase payment ·', 'Salary ·', 'Commission ·'].map((prefix) => ({ particular: { startsWith: prefix } })),
};
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
        select: { id: true, branch_id: true, opened_at: true },
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
            expense_date: drawerDate(open[0].opened_at),
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
/** A closed register's expected cash and its Cash in Hand / Bank entries follow a changed drawer entry. */
async function refreshClosedRegister(cashflowId) {
    if (!cashflowId)
        return;
    const session = await client_2.prisma.cashFlow.findUnique({ where: { id: cashflowId }, select: { status: true } });
    if (session?.status !== 'CLOSED')
        return;
    const { CashRegisterService } = await Promise.resolve().then(() => __importStar(require('./cash-register.service')));
    await new CashRegisterService().recalculateClosed(cashflowId).catch((err) => console.error('[register] recalculation failed', cashflowId, err.message));
}
/**
 * Keep a supplier payment's drawer copy in step with the payment: same amount
 * while it is still cash from Cash in Hand, gone once it is edited to the bank
 * or deleted. Closed registers are recalculated.
 */
async function syncSupplierPaymentDrawerCopy(paymentId, keep) {
    const copies = await client_2.prisma.expense.findMany({
        where: { reference: paymentId, particular: { startsWith: 'Purchase payment' }, cashflow_id: { not: null } },
        select: { id: true, cashflow_id: true },
    });
    if (!copies.length)
        return;
    const ids = copies.map((c) => c.id);
    if (keep)
        await client_2.prisma.expense.updateMany({ where: { id: { in: ids } }, data: { amount: new client_1.Prisma.Decimal(keep.amount) } });
    else
        await client_2.prisma.expense.deleteMany({ where: { id: { in: ids } } });
    for (const id of new Set(copies.map((c) => c.cashflow_id)))
        await refreshClosedRegister(id);
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