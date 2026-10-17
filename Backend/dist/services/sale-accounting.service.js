"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saleAccountingService = exports.returnVoucherRef = exports.saleVoucherRef = void 0;
exports.ensureBankSystemAccount = ensureBankSystemAccount;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const timezone_1 = require("../utils/timezone");
const period_lock_service_1 = require("./period-lock.service");
const payment_accounts_service_1 = require("./payment-accounts.service");
/**
 * Posts POS tenders into Chart of Accounts:
 *   Cash sale     → Dr Cash In Hand (CASH)      / Cr Sales Revenue
 *   Card/bank     → Dr Bank (BANK)              / Cr Sales Revenue
 *   Return/refund → Dr Sales Returns            / Cr Cash or Bank
 *
 * Idempotent via voucher `reference` = SALE:{id} or SALE-RTN:{id}.
 */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const BANK_METHODS = new Set([
    client_1.PaymentMethod.CARD,
    client_1.PaymentMethod.BANK_TRANSFER,
    client_1.PaymentMethod.MOBILE_MONEY,
    'CARD',
    'BANK_TRANSFER',
    'MOBILE_MONEY',
]);
const saleVoucherRef = (saleId) => `SALE:${saleId}`;
exports.saleVoucherRef = saleVoucherRef;
const returnVoucherRef = (saleId) => `SALE-RTN:${saleId}`;
exports.returnVoucherRef = returnVoucherRef;
async function nextVoucherNo(tx) {
    const last = await tx.journalVoucher.findFirst({
        where: { voucher_no: { startsWith: 'JV-' } },
        orderBy: { voucher_no: 'desc' },
        select: { voucher_no: true },
    });
    const n = last ? Number(last.voucher_no.slice(3)) || 0 : 0;
    return `JV-${String(n + 1).padStart(6, '0')}`;
}
const accountCache = new Map();
async function accountByKey(key) {
    const cached = accountCache.get(key);
    if (cached?.is_active)
        return cached;
    const row = await client_2.prisma.transactionalAccount.findUnique({
        where: { system_key: key },
        select: { id: true, code: true, name: true, system_key: true, is_active: true },
    });
    if (!row || !row.is_active) {
        throw new apiError_1.AppError(500, `Chart of Accounts is missing system account ${key}`);
    }
    accountCache.set(key, row);
    return row;
}
/** Ensures Bank (1110002 / Pehnawa bank) has system_key BANK for tender posting. */
async function ensureBankSystemAccount() {
    const existing = await client_2.prisma.transactionalAccount.findUnique({ where: { system_key: 'BANK' } });
    if (existing)
        return existing;
    const candidate = (await client_2.prisma.transactionalAccount.findFirst({
        where: { code: '1110002' },
    })) ||
        (await client_2.prisma.transactionalAccount.findFirst({
            where: {
                system_key: null,
                control: { system_key: 'CASH_BANK' },
                name: { contains: 'Bank', mode: 'insensitive' },
                NOT: { name: { contains: 'Petty', mode: 'insensitive' } },
            },
            orderBy: { code: 'asc' },
        }));
    if (!candidate) {
        throw new apiError_1.AppError(500, 'Bank account not found under Cash & Bank — create it in Chart of Accounts');
    }
    return client_2.prisma.transactionalAccount.update({
        where: { id: candidate.id },
        data: { system_key: 'BANK', is_system: true },
    });
}
/** Cash total, plus the non-cash total per method (card, transfer, wallet). */
function splitTenders(payments, fallbackMethod, fallbackPaid) {
    let cash = 0;
    const bankByMethod = new Map();
    const addBank = (method, amt) => bankByMethod.set(method, round2((bankByMethod.get(method) || 0) + amt));
    if (payments.length) {
        for (const p of payments) {
            const amt = round2(Math.abs(Number(p.amount) || 0));
            if (amt < 0.005)
                continue;
            const method = String(p.method || '').toUpperCase();
            if (method === 'CASH')
                cash += amt;
            else if (BANK_METHODS.has(method))
                addBank(method, amt);
            // GIFT_CARD / CREDIT / unknown — skip (not cash or bank drawer)
        }
    }
    else if (fallbackPaid > 0.005) {
        const method = String(fallbackMethod || 'CASH').toUpperCase();
        if (method === 'CASH')
            cash = round2(fallbackPaid);
        else if (BANK_METHODS.has(method))
            addBank(method, round2(fallbackPaid));
    }
    const bank = round2([...bankByMethod.values()].reduce((s, v) => s + v, 0));
    return { cash: round2(cash), bank, bankByMethod };
}
async function createBalancedVoucher(params) {
    const lines = params.lines
        .map((l) => ({
        account_id: l.accountId,
        debit: round2(Math.max(0, l.debit || 0)),
        credit: round2(Math.max(0, l.credit || 0)),
        description: l.description || null,
    }))
        .filter((l) => l.debit > 0.004 || l.credit > 0.004);
    if (lines.length < 2)
        return null;
    let debit = round2(lines.reduce((s, l) => s + l.debit, 0));
    let credit = round2(lines.reduce((s, l) => s + l.credit, 0));
    if (Math.abs(debit - credit) >= 0.02) {
        throw new apiError_1.AppError(500, `Sale voucher out of balance: Dr ${debit} Cr ${credit} (${params.reference})`);
    }
    // Absorb 1-cent float on the largest credit/debit line
    if (Math.abs(debit - credit) >= 0.005) {
        const diff = round2(debit - credit);
        if (diff > 0) {
            const line = lines.find((l) => l.credit > 0) || lines[lines.length - 1];
            line.credit = round2(line.credit + diff);
            credit = round2(credit + diff);
        }
        else {
            const line = lines.find((l) => l.debit > 0) || lines[0];
            line.debit = round2(line.debit - diff);
            debit = round2(debit - diff);
        }
    }
    if (!params.skipPeriodLock) {
        await (0, period_lock_service_1.assertPeriodOpen)(params.voucherDate, 'a sale journal voucher');
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await client_2.prisma.$transaction(async (tx) => {
                const exists = await tx.journalVoucher.findFirst({
                    where: { reference: params.reference },
                    select: { id: true },
                });
                if (exists)
                    return exists;
                const voucher_no = await nextVoucherNo(tx);
                return tx.journalVoucher.create({
                    data: {
                        voucher_no,
                        voucher_date: params.voucherDate,
                        narration: params.narration,
                        reference: params.reference,
                        branch_id: params.branchId || null,
                        total: new client_1.Prisma.Decimal(debit),
                        created_by: params.createdBy ?? null,
                        lines: {
                            create: lines.map((l) => ({
                                account_id: l.account_id,
                                debit: new client_1.Prisma.Decimal(l.debit),
                                credit: new client_1.Prisma.Decimal(l.credit),
                                description: l.description,
                            })),
                        },
                    },
                    select: { id: true, voucher_no: true },
                });
            });
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 2) {
                continue;
            }
            throw error;
        }
    }
    throw new apiError_1.AppError(500, 'Could not allocate a voucher number for the sale');
}
class SaleAccountingService {
    /**
     * Rebuild a sale's accounting after it changed (payment method / amount
     * edited, cancelled or deleted): drop its voucher and post it again from
     * the sale as it is now. A cancelled or deleted sale ends with no voucher.
     */
    async repostForSale(saleId, opts) {
        await client_2.prisma.journalVoucher.deleteMany({
            where: { reference: { in: [(0, exports.saleVoucherRef)(saleId), (0, exports.returnVoucherRef)(saleId)] } },
        });
        return this.postForSale(saleId, { userId: opts?.userId, skipPeriodLock: opts?.skipPeriodLock });
    }
    /** Post (or no-op if already posted) accounting for a completed sale or return. */
    async postForSale(saleId, opts) {
        await ensureBankSystemAccount();
        const sale = await client_2.prisma.sale.findUnique({
            where: { id: saleId },
            include: { payments: true },
        });
        if (!sale)
            return null;
        if (sale.status === 'CANCELLED')
            return null;
        const total = Number(sale.total_amount) || 0;
        // Child return/exchange docs: money out when total < 0, money in when total > 0.
        if (sale.original_sale_id || total < 0) {
            if (total > 0.005)
                return this.postSale(sale, opts);
            if (total < -0.005)
                return this.postReturn(sale, opts);
            return null;
        }
        return this.postSale(sale, opts);
    }
    async postSale(sale, opts) {
        const reference = (0, exports.saleVoucherRef)(sale.id);
        const existing = await client_2.prisma.journalVoucher.findFirst({ where: { reference }, select: { id: true } });
        if (existing)
            return existing;
        const split = splitTenders(sale.payments, String(sale.payment_method), Number(sale.payment_received) || 0);
        let { cash, bank } = split;
        const { bankByMethod } = split;
        // Gift-card tenders are posted from the gift card ledger (Dr Gift Cards / Cr Sales).
        const giftCard = round2(sale.payments
            .filter((p) => String(p.method).toUpperCase() === 'GIFT_CARD')
            .reduce((t, p) => t + Math.abs(Number(p.amount) || 0), 0));
        // Paid more than the bill (e.g. 14,500 tendered on 13,000): the excess was
        // handed back as change — it is neither sales nor money kept. Take it off
        // cash first, then off bank tenders.
        let excess = round2(cash + bank + giftCard - (Number(sale.total_amount) || 0));
        if (excess > 0.005) {
            const fromCash = Math.min(cash, excess);
            cash = round2(cash - fromCash);
            excess = round2(excess - fromCash);
            for (const [method, amount] of bankByMethod) {
                if (excess < 0.005)
                    break;
                const take = Math.min(amount, excess);
                bankByMethod.set(method, round2(amount - take));
                excess = round2(excess - take);
            }
            bank = round2([...bankByMethod.values()].reduce((t, v) => t + v, 0));
        }
        const totalMoney = round2(cash + bank);
        // Whatever the customer did not pay now is on credit: it is still a sale.
        const unpaid = round2(Math.max(0, (Number(sale.total_amount) || 0) - totalMoney - giftCard));
        if (totalMoney < 0.005 && unpaid < 0.005)
            return null;
        const [cashAcct, bankAcct, salesAcct] = await Promise.all([
            accountByKey('CASH'),
            accountByKey('BANK'),
            accountByKey('SALES'),
        ]);
        const ymd = (0, timezone_1.toBusinessYmd)(sale.sale_date);
        const voucherDate = (0, timezone_1.localRange)(ymd, ymd).start;
        const lines = [];
        if (cash > 0.005) {
            lines.push({
                accountId: cashAcct.id,
                debit: cash,
                description: `Cash tender · ${sale.sale_number}`,
            });
        }
        if (bank > 0.005) {
            // Each method goes to its configured account (Settings → Payment accounts).
            const perAccount = new Map();
            for (const [method, amount] of bankByMethod) {
                if (amount < 0.005)
                    continue;
                const accountId = await (0, payment_accounts_service_1.bankAccountForMethod)(method, bankAcct.id);
                const row = perAccount.get(accountId) || { amount: 0, methods: [] };
                row.amount = round2(row.amount + amount);
                row.methods.push(method.toLowerCase().replace(/_/g, ' '));
                perAccount.set(accountId, row);
            }
            for (const [accountId, row] of perAccount) {
                lines.push({
                    accountId,
                    debit: row.amount,
                    description: `${row.methods.join(' + ')} tender · ${sale.sale_number}`,
                });
            }
        }
        if (unpaid > 0.005) {
            const receivables = await accountByKey('RECEIVABLES');
            lines.push({
                accountId: receivables.id,
                debit: unpaid,
                description: `On credit (customer owes) · ${sale.sale_number}`,
            });
        }
        lines.push({
            accountId: salesAcct.id,
            credit: round2(totalMoney + unpaid),
            description: `Sale · ${sale.sale_number}`,
        });
        return createBalancedVoucher({
            voucherDate,
            narration: `POS sale ${sale.sale_number}`,
            reference,
            branchId: sale.branch_id,
            createdBy: opts?.userId ?? sale.created_by,
            lines,
            skipPeriodLock: opts?.skipPeriodLock,
        });
    }
    async postReturn(sale, opts) {
        const reference = (0, exports.returnVoucherRef)(sale.id);
        const existing = await client_2.prisma.journalVoucher.findFirst({ where: { reference }, select: { id: true } });
        if (existing)
            return existing;
        // Return docs store negative totals; refund amount is absolute.
        // Prefer payment_received when set; else |total_amount|.
        const refundAbs = round2(Math.abs(Number(sale.payment_received) || 0) > 0.005
            ? Math.abs(Number(sale.payment_received))
            : Math.abs(Number(sale.total_amount) || 0));
        if (refundAbs < 0.005)
            return null;
        const method = String(sale.payment_method || 'CASH').toUpperCase();
        const toBank = BANK_METHODS.has(method);
        // no_refund / store credit style — if method is CREDIT, skip cash/bank
        if (method === 'CREDIT' || method === 'GIFT_CARD')
            return null;
        const [cashAcct, bankAcct, returnsAcct] = await Promise.all([
            accountByKey('CASH'),
            accountByKey('BANK'),
            accountByKey('SALES_RETURNS'),
        ]);
        const ymd = (0, timezone_1.toBusinessYmd)(sale.sale_date);
        const voucherDate = (0, timezone_1.localRange)(ymd, ymd).start;
        const moneyAcct = toBank ? { id: await (0, payment_accounts_service_1.bankAccountForMethod)(method, bankAcct.id) } : cashAcct;
        return createBalancedVoucher({
            voucherDate,
            narration: `POS return ${sale.sale_number}`,
            reference,
            branchId: sale.branch_id,
            createdBy: opts?.userId ?? sale.created_by,
            lines: [
                {
                    accountId: returnsAcct.id,
                    debit: refundAbs,
                    description: `Return · ${sale.sale_number}`,
                },
                {
                    accountId: moneyAcct.id,
                    credit: refundAbs,
                    description: `${toBank ? 'Bank' : 'Cash'} refund · ${sale.sale_number}`,
                },
            ],
            skipPeriodLock: opts?.skipPeriodLock,
        });
    }
    /** Backfill vouchers for sales on/after fromYmd (business date). Idempotent. */
    async backfillFrom(fromYmd, opts) {
        await ensureBankSystemAccount();
        const { start } = (0, timezone_1.localRange)(fromYmd, fromYmd);
        const end = opts?.toYmd ? (0, timezone_1.localRange)(opts.toYmd, opts.toYmd).end : undefined;
        const sales = await client_2.prisma.sale.findMany({
            where: {
                sale_date: end ? { gte: start, lte: end } : { gte: start },
                status: { not: 'CANCELLED' },
            },
            select: { id: true, sale_number: true, original_sale_id: true, total_amount: true },
            orderBy: { sale_date: 'asc' },
        });
        let posted = 0;
        let skipped = 0;
        let failed = 0;
        const errors = [];
        for (const sale of sales) {
            try {
                const result = await this.postForSale(sale.id, { skipPeriodLock: true });
                if (result)
                    posted += 1;
                else
                    skipped += 1;
            }
            catch (e) {
                failed += 1;
                errors.push({
                    id: sale.id,
                    sale_number: sale.sale_number,
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }
        return { total: sales.length, posted, skipped, failed, errors: errors.slice(0, 20) };
    }
}
exports.saleAccountingService = new SaleAccountingService();
//# sourceMappingURL=sale-accounting.service.js.map