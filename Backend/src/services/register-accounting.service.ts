import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';

/**
 * Keeps "Cash in Hand" equal to the register drawer, the way production POS
 * systems do it. Each register session posts:
 *
 *   OPEN    drawer started below last night's count → cash moved to the safe /
 *           owner (Dr Cash in Safe / Cr Cash in Hand); above it (or the very
 *           first float) → cash brought in from the safe (reverse).
 *   CASHIN  "Cash in" to the drawer (not gift cards — those post themselves)
 *           → Dr Cash in Hand / Cr Cash in Safe.
 *   CLOSE   counted ≠ expected → the difference goes to Cash Short & Over
 *           (short: Dr Short & Over / Cr Cash in Hand; extra: reverse).
 *
 * Idempotent: a session's vouchers are rebuilt from scratch every time.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;
export const REGISTER_VOUCHER_PREFIX = 'REGISTER:';
const ref = (sessionId: string, part: string) => `${REGISTER_VOUCHER_PREFIX}${sessionId}:${part}`;

async function accountId(key: string) {
  const row = await prisma.transactionalAccount.findUnique({ where: { system_key: key }, select: { id: true, is_active: true } });
  if (!row) throw new AppError(500, `Chart of Accounts is missing system account ${key}`);
  return row.id;
}

async function nextVoucherNo(tx: Prisma.TransactionClient) {
  const last = await tx.journalVoucher.findFirst({
    where: { voucher_no: { startsWith: 'JV-' } },
    orderBy: { voucher_no: 'desc' },
    select: { voucher_no: true },
  });
  const n = last ? Number(last.voucher_no.slice(3)) || 0 : 0;
  return `JV-${String(n + 1).padStart(6, '0')}`;
}

async function post(p: {
  reference: string;
  date: Date;
  branchId: string | null;
  narration: string;
  debitId: string;
  creditId: string;
  amount: number;
  userId?: string | null;
}) {
  const amount = round2(Math.abs(p.amount));
  if (amount < 0.005) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) =>
        tx.journalVoucher.create({
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
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 2) continue;
      throw error;
    }
  }
  return null;
}

/** Rebuild the vouchers of one register session from its current state. */
export async function postRegisterSession(sessionId: string, userId?: string | null) {
  const s = await prisma.cashFlow.findUnique({ where: { id: sessionId }, include: { branch: { select: { name: true } } } });
  if (!s) return null;
  await prisma.journalVoucher.deleteMany({ where: { reference: { startsWith: ref(sessionId, '') } } });

  // Creates Cash in Safe / Cash Short & Over on first use after a deploy.
  const { ChartOfAccountsService } = await import('./chart-of-accounts.service');
  await new ChartOfAccountsService().ensureSetup();
  const [cash, safe, overShort] = await Promise.all([accountId('CASH'), accountId('CASH_SAFE'), accountId('CASH_OVER_SHORT')]);
  const where = s.branch?.name ? ` · ${s.branch.name}` : '';
  const posted: string[] = [];

  // OPEN — drawer vs last night's count (no previous count = float brought in).
  const expectedOpening = s.expected_opening == null ? 0 : num(s.expected_opening);
  const openDiff = round2(num(s.opening) - expectedOpening);
  if (Math.abs(openDiff) >= 0.005) {
    const toSafe = openDiff < 0;
    const v = await post({
      reference: ref(s.id, 'OPEN'),
      date: s.opened_at,
      branchId: s.branch_id,
      narration: toSafe
        ? `Cash taken out of the drawer to safe / owner (opened with ${round2(num(s.opening))}, last count ${round2(expectedOpening)})${where}`
        : `Cash put into the drawer from safe / owner at opening${where}`,
      debitId: toSafe ? safe : cash,
      creditId: toSafe ? cash : safe,
      amount: openDiff,
      userId,
    });
    if (v) posted.push(v.voucher_no);
  }

  // CASH IN during the session (gift-card cash posts from the gift card ledger).
  const ins = await prisma.cashMovement.findMany({ where: { cashflow_id: s.id, type: 'IN' } });
  for (const m of ins) {
    if (/^gift card/i.test(m.reason || '')) continue;
    const v = await post({
      reference: ref(s.id, `CASHIN:${m.id}`),
      date: m.created_at,
      branchId: s.branch_id,
      narration: `Cash put into the drawer from safe / owner · ${m.reason}${where}`,
      debitId: cash,
      creditId: safe,
      amount: num(m.amount),
      userId,
    });
    if (v) posted.push(v.voucher_no);
  }

  // CLOSE — counted vs expected.
  if (s.status === 'CLOSED' && s.variance != null && Math.abs(num(s.variance)) >= 0.005) {
    const short = num(s.variance) < 0;
    const v = await post({
      reference: ref(s.id, 'CLOSE'),
      date: s.closed_at ?? new Date(),
      branchId: s.branch_id,
      narration: `${short ? 'Cash short' : 'Cash over'} at register close (expected ${round2(num(s.expected_cash))}, counted ${round2(num(s.closing))})${where}`,
      debitId: short ? overShort : cash,
      creditId: short ? cash : overShort,
      amount: num(s.variance),
      userId,
    });
    if (v) posted.push(v.voucher_no);
  }
  return posted;
}
