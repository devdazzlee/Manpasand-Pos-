import cron from 'node-cron';
import { prisma } from '../prisma/client';
import { CashRegisterService } from './cash-register.service';
import { BUSINESS_TIMEZONE, businessTodayYmd, localRange, zonedLocalToUtc } from '../utils/timezone';

/**
 * Daily register cycle for every shop branch (Pakistan time):
 *
 *  - 07:55  Any register still open from a previous day is closed automatically.
 *           Nobody counted the cash, so the close uses the system's expected cash,
 *           is marked "Auto-closed", and is left PENDING for a manager to review.
 *  - 08:00  Every active shop branch without a register gets one opened with
 *           0 opening cash (the drawer is emptied at every closing).
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

const registers = new CashRegisterService();

/** UTC instant of HH:MM today in the business timezone. */
function todayAt(t: { hour: number; minute: number }): Date {
  return zonedLocalToUtc(businessTodayYmd(), t.hour, t.minute);
}

/** User recorded as the opener: the branch's own staff account, else an owner account. */
async function openerFor(branchId: string) {
  const staff = await prisma.user.findFirst({
    where: { branch_id: branchId, is_active: true, role: { in: ['BRANCH_MANAGER', 'SUPERVISOR', 'CASHIER'] } },
    orderBy: [{ role: 'asc' }, { created_at: 'asc' }],
    select: { id: true, role: true },
  });
  if (staff) return staff;
  return prisma.user.findFirst({
    where: { is_active: true, role: 'SUPER_ADMIN' },
    orderBy: { created_at: 'asc' },
    select: { id: true, role: true },
  });
}

async function audit(action: string, branchId: string | null, entityId: string, summary: string, details?: object) {
  await prisma.auditLog
    .create({
      data: {
        user_email: SYSTEM_EMAIL,
        action,
        category: 'register',
        entity: 'cashflow',
        entity_id: entityId,
        branch_id: branchId,
        summary,
        details: details as any,
      },
    })
    .catch(() => undefined);
}

/** Close every register still open from a previous business day. */
export async function autoCloseStaleRegisters() {
  const { start: startOfToday } = localRange(businessTodayYmd(), businessTodayYmd());
  const stale = await prisma.cashFlow.findMany({
    where: { status: 'OPEN', opened_at: { lt: startOfToday } },
    select: { id: true, branch_id: true, branch: { select: { name: true } } },
  });

  for (const s of stale) {
    try {
      const { live } = await registers.liveFigures(s.id);
      const expected = Number(live.expectedCash ?? 0);
      await registers.close(
        { role: 'SYSTEM' },
        s.id,
        {
          closing: Math.max(0, expected),
          note: 'Auto-closed at 7:55 AM: register was not closed by staff. Cash was not counted; closing = system expected cash. Please review.',
        },
      );
      await audit('register.auto_close', s.branch_id, s.id, `Register auto-closed (${s.branch?.name ?? 'branch'}) at 7:55 AM — not closed by staff`, {
        expectedCash: expected,
      });
      console.log(`[register-scheduler] auto-closed ${s.branch?.name ?? s.branch_id} (${s.id})`);
    } catch (err) {
      console.error('[register-scheduler] auto-close failed', s.id, (err as Error).message);
    }
  }
  return stale.length;
}

/** Open a register for every active shop branch that has none open and none opened today. */
export async function autoOpenRegisters() {
  const today = localRange(businessTodayYmd(), businessTodayYmd());
  const branches = await prisma.branch.findMany({
    where: { is_active: true, branch_type: 'BRANCH' },
    select: { id: true, name: true },
  });

  let opened = 0;
  for (const b of branches) {
    try {
      const existing = await prisma.cashFlow.findFirst({
        where: {
          branch_id: b.id,
          OR: [{ status: 'OPEN' }, { opened_at: { gte: today.start, lte: today.end } }],
        },
        select: { id: true },
      });
      if (existing) continue; // already open, or opened (and maybe closed) today

      const opener = await openerFor(b.id);
      if (!opener) {
        console.warn(`[register-scheduler] no user to open ${b.name} under — skipped`);
        continue;
      }
      // Every day starts with an empty drawer: the cash is taken out at closing.
      const opening = 0;
      const s: any = await registers.open(
        { userId: opener.id, role: opener.role, branchId: b.id },
        { branchId: b.id, opening, note: 'Opened automatically at 8:00 AM with 0 opening cash.' },
      );
      opened += 1;
      await audit('register.auto_open', b.id, s?.id ?? b.id, `Register auto-opened (${b.name}) at 8:00 AM`, { opening });
      console.log(`[register-scheduler] auto-opened ${b.name} with ${opening}`);
    } catch (err) {
      console.error('[register-scheduler] auto-open failed', b.name, (err as Error).message);
    }
  }
  return opened;
}

let running = false;
/** One pass: close yesterday's leftovers, then open today's registers if it's past 8:00. */
async function runCycle(reason: string) {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    if (now >= todayAt(CLOSE_AT)) await autoCloseStaleRegisters();
    if (now >= todayAt(OPEN_AT)) await autoOpenRegisters();
  } catch (err) {
    console.error(`[register-scheduler] ${reason} run failed`, (err as Error).message);
  } finally {
    running = false;
  }
}

export function startRegisterScheduler() {
  cron.schedule(`${CLOSE_AT.minute} ${CLOSE_AT.hour} * * *`, () => runCycle('07:55 close'), { timezone: BUSINESS_TIMEZONE });
  cron.schedule(`${OPEN_AT.minute} ${OPEN_AT.hour} * * *`, () => runCycle('08:00 open'), { timezone: BUSINESS_TIMEZONE });
  // Catch up after a restart/deploy (e.g. the server was down at 8:00).
  setTimeout(() => void runCycle('startup catch-up'), 15_000);
  console.log(`[register-scheduler] daily close ${CLOSE_AT.hour}:${String(CLOSE_AT.minute).padStart(2, '0')} / open ${OPEN_AT.hour}:00 (${BUSINESS_TIMEZONE})`);
}
