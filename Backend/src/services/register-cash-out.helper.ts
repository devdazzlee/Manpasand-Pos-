import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

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
    select: { id: true, branch_id: true },
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
