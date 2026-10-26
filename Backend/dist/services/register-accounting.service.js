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
exports.REGISTER_VOUCHER_PREFIX = void 0;
exports.postRegisterSession = postRegisterSession;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const payment_accounts_service_1 = require("./payment-accounts.service");
const register_cash_out_helper_1 = require("./register-cash-out.helper");
/**
 * "Cash in Hand" is all of the shop's cash — in the drawer or with the owner.
 * Opening the drawer with a float, or putting cash in, only moves cash inside
 * Cash in Hand, so neither posts anything. Each register session posts only:
 *
 *   CLOSE   counted ≠ expected → the difference goes to Cash Short & Over
 *           (short: Dr Short & Over / Cr Cash in Hand; extra: reverse).
 *   CLOSE:<method>  card / bank / wallet amount entered at closing ≠ sales by
 *           that method → the difference moves that method's bank account the
 *           same way, so the books show what was entered at closing.
 *
 * Idempotent: a session's vouchers are rebuilt from scratch every time.
 */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v) => Number(v ?? 0) || 0;
exports.REGISTER_VOUCHER_PREFIX = 'REGISTER:';
const ref = (sessionId, part) => `${exports.REGISTER_VOUCHER_PREFIX}${sessionId}:${part}`;
async function accountId(key) {
    const row = await client_2.prisma.transactionalAccount.findUnique({ where: { system_key: key }, select: { id: true, is_active: true } });
    if (!row)
        throw new apiError_1.AppError(500, `Chart of Accounts is missing system account ${key}`);
    return row.id;
}
async function nextVoucherNo(tx) {
    const last = await tx.journalVoucher.findFirst({
        where: { voucher_no: { startsWith: 'JV-' } },
        orderBy: { voucher_no: 'desc' },
        select: { voucher_no: true },
    });
    const n = last ? Number(last.voucher_no.slice(3)) || 0 : 0;
    return `JV-${String(n + 1).padStart(6, '0')}`;
}
async function post(p) {
    const amount = round2(Math.abs(p.amount));
    if (amount < 0.005)
        return null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await client_2.prisma.$transaction(async (tx) => tx.journalVoucher.create({
                data: {
                    voucher_no: await nextVoucherNo(tx),
                    voucher_date: p.date,
                    narration: p.narration,
                    reference: p.reference,
                    branch_id: p.branchId,
                    total: amount,
                    created_by: p.userId ?? null,
                    lines: {
                        create: [
                            { account_id: p.debitId, debit: amount, credit: 0, description: p.narration },
                            { account_id: p.creditId, debit: 0, credit: amount, description: p.narration },
                        ],
                    },
                },
                select: { id: true, voucher_no: true },
            }));
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 2)
                continue;
            throw error;
        }
    }
    return null;
}
/** Rebuild the vouchers of one register session from its current state. */
async function postRegisterSession(sessionId, userId) {
    const s = await client_2.prisma.cashFlow.findUnique({ where: { id: sessionId }, include: { branch: { select: { name: true } } } });
    if (!s)
        return null;
    await client_2.prisma.journalVoucher.deleteMany({ where: { reference: { startsWith: ref(sessionId, '') } } });
    // Creates Cash Short & Over on first use after a deploy.
    const { ChartOfAccountsService } = await Promise.resolve().then(() => __importStar(require('./chart-of-accounts.service')));
    await new ChartOfAccountsService().ensureSetup();
    const [cash, bank, overShort] = await Promise.all([accountId('CASH'), accountId('BANK'), accountId('CASH_OVER_SHORT')]);
    const where = s.branch?.name ? ` · ${s.branch.name}` : '';
    const posted = [];
    // CLOSE — counted vs expected.
    if (s.status === 'CLOSED' && s.variance != null && Math.abs(num(s.variance)) >= 0.005) {
        const short = num(s.variance) < 0;
        const v = await post({
            reference: ref(s.id, 'CLOSE'),
            date: (0, register_cash_out_helper_1.drawerDate)(s.opened_at, s.closed_at ?? new Date()),
            branchId: s.branch_id,
            narration: `${short ? 'Cash short' : 'Cash over'} at register close (expected ${round2(num(s.expected_cash))}, counted ${round2(num(s.closing))})${where}`,
            debitId: short ? overShort : cash,
            creditId: short ? cash : overShort,
            amount: num(s.variance),
            userId,
        });
        if (v)
            posted.push(v.voucher_no);
    }
    // CLOSE:<method> — card / bank / wallet entered at closing vs sales by that method.
    if (s.status === 'CLOSED') {
        const recs = await client_2.prisma.registerReconciliation.findMany({ where: { cashflow_id: s.id, method: { not: 'CASH' } } });
        for (const r of recs) {
            const diff = round2(num(r.variance));
            if (Math.abs(diff) < 0.005)
                continue;
            const methodBank = await (0, payment_accounts_service_1.bankAccountForMethod)(r.method, bank);
            const less = diff < 0;
            const label = r.method.toLowerCase().replace(/_/g, ' ');
            const v = await post({
                reference: ref(s.id, `CLOSE:${r.method}`),
                date: (0, register_cash_out_helper_1.drawerDate)(s.opened_at, s.closed_at ?? new Date()),
                branchId: s.branch_id,
                narration: `${label} ${less ? 'short' : 'over'} at register close (sales ${round2(num(r.expected))}, entered ${round2(num(r.actual))})${where}`,
                debitId: less ? overShort : methodBank,
                creditId: less ? methodBank : overShort,
                amount: diff,
                userId,
            });
            if (v)
                posted.push(v.voucher_no);
        }
    }
    return posted;
}
//# sourceMappingURL=register-accounting.service.js.map