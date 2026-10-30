import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { localRange, toBusinessYmd } from '../utils/timezone';

/**
 * When money left a register drawer, for the books: now — or, when the register
 * was opened on an earlier business day (entered after midnight before closing),
 * the last moment of that day, so it lands on the register's day.
 */
export function drawerDate(openedAt: Date, at: Date = new Date()) {
  const day = toBusinessYmd(openedAt);
  return toBusinessYmd(at) === day ? at : localRange(day, day).end;
}

/**
 * The drawer copies recordCashPayOnOpenRegister writes for a supplier payment,
 * salary or commission paid in cash. They only make the drawer balance — the
 * payment itself is the real record, so reports and the Expenses list must
 * leave these out (use as `NOT: REGISTER_PAYMENT_COPY`) or the money counts twice.
 */
export const REGISTER_PAYMENT_COPY: Prisma.ExpenseWhereInput = {
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
export async function recordCashPayOnOpenRegister(opts: {
  particular: string;
  amount: number;
  branchId?: string | null;
  userId?: string | null;
  reference?: string | null;
  notes?: string | null;
  /** Account the money left from; looked up from the supplier payment (reference) when omitted. */
  paidFromAccountId?: string | null;
}) {
  const amount = Math.round((Number(opts.amount) + Number.EPSILON) * 100) / 100;
  if (!(amount > 0.005)) return null;
  const method = 'CASH';

  let paidFrom = opts.paidFromAccountId;
  if (paidFrom === undefined && opts.reference) {
    const pay = await prisma.supplierPayment
      .findUnique({ where: { id: opts.reference }, select: { paid_from_account_id: true } })
      .catch(() => null);
    paidFrom = pay?.paid_from_account_id;
  }
  if (paidFrom) {
    const account = await prisma.transactionalAccount.findUnique({ where: { id: paidFrom }, select: { system_key: true } });
    if (account && account.system_key !== 'CASH') return null;
  }

  const open = await prisma.cashFlow.findMany({
    where: {
      status: 'OPEN',
      ...(opts.branchId ? { branch_id: opts.branchId } : {}),
    },
    select: { id: true, branch_id: true, opened_at: true },
    take: 2,
  });
  if (open.length !== 1) return null;

  return prisma.expense.create({
    data: {
      particular: opts.particular.trim(),
      amount: new Prisma.Decimal(amount),
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
export async function refreshClosedRegister(cashflowId: string | null) {
  if (!cashflowId) return;
  const session = await prisma.cashFlow.findUnique({ where: { id: cashflowId }, select: { status: true } });
  if (session?.status !== 'CLOSED') return;
  const { CashRegisterService } = await import('./cash-register.service');
  await new CashRegisterService().recalculateClosed(cashflowId).catch((err) =>
    console.error('[register] recalculation failed', cashflowId, (err as Error).message),
  );
}

/**
 * Keep a supplier payment's drawer copy in step with the payment: same amount
 * while it is still cash from Cash in Hand, gone once it is edited to the bank
 * or deleted. Closed registers are recalculated.
 */
export async function syncSupplierPaymentDrawerCopy(paymentId: string, keep: { amount: number } | null) {
  const copies = await prisma.expense.findMany({
    where: { reference: paymentId, particular: { startsWith: 'Purchase payment' }, cashflow_id: { not: null } },
    select: { id: true, cashflow_id: true },
  });
  if (!copies.length) return;
  const ids = copies.map((c) => c.id);
  if (keep) await prisma.expense.updateMany({ where: { id: { in: ids } }, data: { amount: new Prisma.Decimal(keep.amount) } });
  else await prisma.expense.deleteMany({ where: { id: { in: ids } } });
  for (const id of new Set(copies.map((c) => c.cashflow_id))) await refreshClosedRegister(id);
}

/**
 * Reverse drawer cash-outs that were recorded for supplier payment IDs
 * (Stock In edit cash ↔ credit / payment amount changes).
 */
export async function reverseCashPayOnRegisterByPaymentRefs(
  paymentIds: string[],
): Promise<number> {
  const ids = [...new Set(paymentIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (ids.length === 0) return 0;
  const result = await prisma.expense.deleteMany({
    where: {
      reference: { in: ids },
      particular: { startsWith: 'Purchase payment' },
      cashflow_id: { not: null },
    },
  });
  return result.count;
}
