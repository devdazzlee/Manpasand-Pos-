"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoCloseStaleRegisters = autoCloseStaleRegisters;
exports.autoOpenRegisters = autoOpenRegisters;
exports.startRegisterScheduler = startRegisterScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const client_1 = require("../prisma/client");
const cash_register_service_1 = require("./cash-register.service");
const timezone_1 = require("../utils/timezone");
/**
 * Daily register cycle for every shop branch (Pakistan time):
 *
 *  - 07:55  Any register still open from a previous day is closed automatically.
 *           Nobody counted the cash, so the close uses the system's expected cash,
 *           is marked "Auto-closed", and is left PENDING for a manager to review.
 *  - 08:00  Every active shop branch without a register gets one opened, with the
 *           opening float carried over from the last closing.
 *
 * Staff still close the register by hand at the end of the day as normal; the
 * 07:55 run only catches registers that were forgotten.
 *
 * Both steps go through CashRegisterService (same shifts, accounting and review
 * rules as a manual open/close) and are idempotent, so running them again — or
 * on startup after a restart — never double-opens or double-closes.
 */
const OPEN_AT = { hour: 8, minute: 0 };
const CLOSE_AT = { hour: 7, minute: 55 };
const SYSTEM_EMAIL = 'system (auto register)';
const registers = new cash_register_service_1.CashRegisterService();
/** UTC instant of HH:MM today in the business timezone. */
function todayAt(t) {
    return (0, timezone_1.zonedLocalToUtc)((0, timezone_1.businessTodayYmd)(), t.hour, t.minute);
}
/** User recorded as the opener: the branch's own staff account, else an owner account. */
async function openerFor(branchId) {
    const staff = await client_1.prisma.user.findFirst({
        where: { branch_id: branchId, is_active: true, role: { in: ['BRANCH_MANAGER', 'SUPERVISOR', 'CASHIER'] } },
        orderBy: [{ role: 'asc' }, { created_at: 'asc' }],
        select: { id: true, role: true },
    });
    if (staff)
        return staff;
    return client_1.prisma.user.findFirst({
        where: { is_active: true, role: 'SUPER_ADMIN' },
        orderBy: { created_at: 'asc' },
        select: { id: true, role: true },
    });
}
async function audit(action, branchId, entityId, summary, details) {
    await client_1.prisma.auditLog
        .create({
        data: {
            user_email: SYSTEM_EMAIL,
            action,
            category: 'register',
            entity: 'cashflow',
            entity_id: entityId,
            branch_id: branchId,
            summary,
            details: details,
        },
    })
        .catch(() => undefined);
}
/** Close every register still open from a previous business day. */
async function autoCloseStaleRegisters() {
    const { start: startOfToday } = (0, timezone_1.localRange)((0, timezone_1.businessTodayYmd)(), (0, timezone_1.businessTodayYmd)());
    const stale = await client_1.prisma.cashFlow.findMany({
        where: { status: 'OPEN', opened_at: { lt: startOfToday } },
        select: { id: true, branch_id: true, branch: { select: { name: true } } },
    });
    for (const s of stale) {
        try {
            const { live } = await registers.liveFigures(s.id);
            const expected = Number(live.expectedCash ?? 0);
            await registers.close({ role: 'SYSTEM' }, s.id, {
                closing: Math.max(0, expected),
                note: 'Auto-closed at 7:55 AM: register was not closed by staff. Cash was not counted; closing = system expected cash. Please review.',
            });
            await audit('register.auto_close', s.branch_id, s.id, `Register auto-closed (${s.branch?.name ?? 'branch'}) at 7:55 AM — not closed by staff`, {
                expectedCash: expected,
            });
            console.log(`[register-scheduler] auto-closed ${s.branch?.name ?? s.branch_id} (${s.id})`);
        }
        catch (err) {
            console.error('[register-scheduler] auto-close failed', s.id, err.message);
        }
    }
    return stale.length;
}
/** Open a register for every active shop branch that has none open and none opened today. */
async function autoOpenRegisters() {
    const today = (0, timezone_1.localRange)((0, timezone_1.businessTodayYmd)(), (0, timezone_1.businessTodayYmd)());
    const branches = await client_1.prisma.branch.findMany({
        where: { is_active: true, branch_type: 'BRANCH' },
        select: { id: true, name: true },
    });
    let opened = 0;
    for (const b of branches) {
        try {
            const existing = await client_1.prisma.cashFlow.findFirst({
                where: {
                    branch_id: b.id,
                    OR: [{ status: 'OPEN' }, { opened_at: { gte: today.start, lte: today.end } }],
                },
                select: { id: true },
            });
            if (existing)
                continue; // already open, or opened (and maybe closed) today
            const opener = await openerFor(b.id);
            if (!opener) {
                console.warn(`[register-scheduler] no user to open ${b.name} under — skipped`);
                continue;
            }
            const expected = await registers.expectedOpening(b.id);
            const opening = Math.max(0, expected?.amount ?? 0);
            const s = await registers.open({ userId: opener.id, role: opener.role, branchId: b.id }, { branchId: b.id, opening, note: 'Opened automatically at 8:00 AM. Opening float carried over from the last closing.' });
            opened += 1;
            await audit('register.auto_open', b.id, s?.id ?? b.id, `Register auto-opened (${b.name}) at 8:00 AM`, { opening });
            console.log(`[register-scheduler] auto-opened ${b.name} with ${opening}`);
        }
        catch (err) {
            console.error('[register-scheduler] auto-open failed', b.name, err.message);
        }
    }
    return opened;
}
let running = false;
/** One pass: close yesterday's leftovers, then open today's registers if it's past 8:00. */
async function runCycle(reason) {
    if (running)
        return;
    running = true;
    try {
        const now = new Date();
        if (now >= todayAt(CLOSE_AT))
            await autoCloseStaleRegisters();
        if (now >= todayAt(OPEN_AT))
            await autoOpenRegisters();
    }
    catch (err) {
        console.error(`[register-scheduler] ${reason} run failed`, err.message);
    }
    finally {
        running = false;
    }
}
function startRegisterScheduler() {
    node_cron_1.default.schedule(`${CLOSE_AT.minute} ${CLOSE_AT.hour} * * *`, () => runCycle('07:55 close'), { timezone: timezone_1.BUSINESS_TIMEZONE });
    node_cron_1.default.schedule(`${OPEN_AT.minute} ${OPEN_AT.hour} * * *`, () => runCycle('08:00 open'), { timezone: timezone_1.BUSINESS_TIMEZONE });
    // Catch up after a restart/deploy (e.g. the server was down at 8:00).
    setTimeout(() => void runCycle('startup catch-up'), 15_000);
    console.log(`[register-scheduler] daily close ${CLOSE_AT.hour}:${String(CLOSE_AT.minute).padStart(2, '0')} / open ${OPEN_AT.hour}:00 (${timezone_1.BUSINESS_TIMEZONE})`);
}
//# sourceMappingURL=register-scheduler.service.js.map