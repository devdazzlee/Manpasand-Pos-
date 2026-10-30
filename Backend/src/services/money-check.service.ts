import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { businessTodayYmd, localRange, toBusinessYmd } from '../utils/timezone';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { CashRegisterService } from './cash-register.service';
import { ExpenseService } from './expense.service';
import { SupplierService } from './supplier.service';
import { drawerDate, recordCashPayOnOpenRegister, refreshClosedRegister, syncSupplierPaymentDrawerCopy } from './register-cash-out.helper';

/* ============================================================
 * Money Check — lets the owner find and fix money mistakes without a
 * developer: match Cash / Bank to what is really there, move money
 * (deposits, owner withdrawals, bank charges), fix detected problems
 * (forgotten registers, wrong "paid from", wrong closing counts) and
 * correct any line of a day's cash / bank book. Every journal it posts
 * carries the MONEY-CHECK: reference so it can be undone.
 * ============================================================ */

export const MONEY_CHECK_PREFIX = 'MONEY-CHECK:';
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;
const SUPPLIER_CASH_TYPES = ['PAYMENT', 'ADVANCE', 'REFUND'];
const ISSUE_DAYS = 60;
const DIFFERENCE_LIMIT = 500;
const DISMISSED_KEY = 'money_check.dismissed';

export type ReconcileReason = 'OWNER_TOOK' | 'OWNER_ADDED' | 'TRANSFER' | 'BANK_CHARGES' | 'UNKNOWN';
export type MoveType = 'CASH_TO_BANK' | 'BANK_TO_CASH' | 'OWNER_TOOK' | 'OWNER_ADDED' | 'BANK_CHARGES';

const REASON_LABEL: Record<ReconcileReason, string> = {
  OWNER_TOOK: 'Owner took the money',
  OWNER_ADDED: 'Owner put money in',
  TRANSFER: 'Moved between cash and bank',
  BANK_CHARGES: 'Bank charges',
  UNKNOWN: 'Difference with no known reason',
};
const MOVE_LABEL: Record<MoveType, string> = {
  CASH_TO_BANK: 'Cash deposited in bank',
  BANK_TO_CASH: 'Cash withdrawn from bank',
  OWNER_TOOK: 'Owner took money',
  OWNER_ADDED: 'Owner put money in',
  BANK_CHARGES: 'Bank charges',
};

type MoneyAccount = { id: string; code: string; name: string; system_key: string | null };

export class MoneyCheckService {
  private coa = new ChartOfAccountsService();
  private register = new CashRegisterService();

  /* ------------------------------ helpers ------------------------------ */

  private async moneyAccounts(): Promise<MoneyAccount[]> {
    return (await this.coa.moneyAccountOptions()) as MoneyAccount[];
  }

  private async accountByKey(key: string) {
    await this.coa.ensureSetup();
    const row = await prisma.transactionalAccount.findUnique({ where: { system_key: key }, select: { id: true, name: true } });
    if (!row) throw new AppError(500, `Chart of Accounts is missing ${key}`);
    return row;
  }

  private async moneyAccount(id: string) {
    const acc = (await this.moneyAccounts()).find((a) => a.id === id);
    if (!acc) throw new AppError(400, 'Pick Cash in Hand or a bank account');
    return acc;
  }

  private isBank(a: MoneyAccount) {
    return a.system_key === 'BANK' || (a.system_key !== 'CASH' && /bank/i.test(a.name));
  }

  /** Balance of each money account at the end of a business day. */
  private async balancesAt(date: string) {
    const b = await this.coa.moneyBalances({ to: date });
    return new Map<string, number>(b.accounts.map((a: { id: string; balance: number }) => [a.id, a.balance]));
  }

  private async post(p: { date: string; type: string; narration: string; debitId: string; creditId: string; amount: number; userId?: string | null }) {
    const amount = round2(Math.abs(p.amount));
    if (amount < 0.01) throw new AppError(400, 'Amount must be more than zero');
    return this.coa.createVoucher(
      {
        voucher_date: p.date,
        narration: p.narration.slice(0, 480),
        reference: `${MONEY_CHECK_PREFIX}${p.type}`,
        lines: [
          { account_id: p.debitId, debit: amount, description: p.narration.slice(0, 180) },
          { account_id: p.creditId, credit: amount, description: p.narration.slice(0, 180) },
        ],
      },
      p.userId ?? undefined,
    );
  }

  /* ------------------------------ 1. balance check ------------------------------ */

  /** System Cash / Bank balances at the end of a day, and that day's money in / out. */
  async summary(date?: string) {
    const day = (date || businessTodayYmd()).slice(0, 10);
    const book = await this.coa.moneyDay({ date: day });
    return { date: day, accounts: book.accounts };
  }

  /**
   * The owner says what is really in an account; the difference is booked to
   * the reason picked, so the books match the real money from then on.
   */
  async reconcile(
    body: { accountId: string; actual: number; date?: string; reason: ReconcileReason; otherAccountId?: string | null; note?: string | null },
    userId?: string | null,
  ) {
    const date = (body.date || businessTodayYmd()).slice(0, 10);
    const account = await this.moneyAccount(body.accountId);
    const system = round2((await this.balancesAt(date)).get(account.id) ?? 0);
    const diff = round2(num(body.actual) - system);
    if (Math.abs(diff) < 0.01) throw new AppError(400, `${account.name} already matches (${system}) — nothing to record`);
    const more = diff > 0; // more money than the books say
    let otherId: string;
    switch (body.reason) {
      case 'OWNER_TOOK':
        if (more) throw new AppError(400, 'There is more money than the books show — "owner took" does not fit');
        otherId = (await this.accountByKey('OWNER_CAPITAL')).id;
        break;
      case 'OWNER_ADDED':
        if (!more) throw new AppError(400, 'There is less money than the books show — "owner put money in" does not fit');
        otherId = (await this.accountByKey('OWNER_CAPITAL')).id;
        break;
      case 'BANK_CHARGES':
        if (more) throw new AppError(400, 'Bank charges only lower the balance');
        otherId = (await this.accountByKey('BANK_CHARGES')).id;
        break;
      case 'TRANSFER': {
        if (!body.otherAccountId || body.otherAccountId === account.id) throw new AppError(400, 'Pick the other cash / bank account the money moved to or from');
        otherId = (await this.moneyAccount(body.otherAccountId)).id;
        break;
      }
      default:
        otherId = (await this.accountByKey('CASH_OVER_SHORT')).id;
    }
    const narration = `Money check · ${account.name}: books ${system}, real ${round2(num(body.actual))} → ${REASON_LABEL[body.reason] ?? body.reason}${body.note ? ` · ${body.note.trim()}` : ''}`;
    const voucher = await this.post({
      date,
      type: `RECONCILE:${body.reason}`,
      narration,
      debitId: more ? account.id : otherId,
      creditId: more ? otherId : account.id,
      amount: diff,
      userId,
    });
    return { voucher, account: account.name, system, actual: round2(num(body.actual)), difference: diff };
  }

  /* ------------------------------ 3. move money ------------------------------ */

  async move(
    body: { type: MoveType; amount: number; date?: string; fromAccountId?: string | null; toAccountId?: string | null; note?: string | null },
    userId?: string | null,
  ) {
    const date = (body.date || businessTodayYmd()).slice(0, 10);
    const accounts = await this.moneyAccounts();
    const cash = accounts.find((a) => a.system_key === 'CASH');
    const bank = accounts.find((a) => a.system_key === 'BANK') ?? accounts.find((a) => this.isBank(a));
    const pick = async (id: string | null | undefined, fallback?: MoneyAccount) => (id ? this.moneyAccount(id) : fallback);
    let debit: { id: string; name: string } | undefined;
    let credit: { id: string; name: string } | undefined;
    switch (body.type) {
      case 'CASH_TO_BANK':
        credit = await pick(body.fromAccountId, cash);
        debit = await pick(body.toAccountId, bank);
        break;
      case 'BANK_TO_CASH':
        credit = await pick(body.fromAccountId, bank);
        debit = await pick(body.toAccountId, cash);
        break;
      case 'OWNER_TOOK':
        credit = await pick(body.fromAccountId, cash);
        debit = await this.accountByKey('OWNER_CAPITAL');
        break;
      case 'OWNER_ADDED':
        debit = await pick(body.toAccountId, cash);
        credit = await this.accountByKey('OWNER_CAPITAL');
        break;
      case 'BANK_CHARGES':
        credit = await pick(body.fromAccountId, bank);
        debit = await this.accountByKey('BANK_CHARGES');
        break;
      default:
        throw new AppError(400, 'Unknown money movement');
    }
    if (!debit || !credit) throw new AppError(400, 'Cash in Hand / Bank account not found');
    if (debit.id === credit.id) throw new AppError(400, 'From and to must be different accounts');
    const narration = `${MOVE_LABEL[body.type]} · ${credit.name} → ${debit.name}${body.note ? ` · ${body.note.trim()}` : ''}`;
    const voucher = await this.post({ date, type: `MOVE:${body.type}`, narration, debitId: debit.id, creditId: credit.id, amount: num(body.amount), userId });
    return { voucher };
  }

  /** Undo a Money Check entry (only entries this screen made). */
  async undo(voucherId: string) {
    const v = await prisma.journalVoucher.findUnique({ where: { id: voucherId }, select: { id: true, reference: true, voucher_no: true, narration: true, total: true } });
    if (!v) throw new AppError(404, 'Entry not found — it may already be undone');
    if (!v.reference?.startsWith(MONEY_CHECK_PREFIX)) throw new AppError(400, 'Only entries made in Money Check can be undone here');
    await this.coa.deleteVoucher(v.id);
    return { voucher_no: v.voucher_no, narration: v.narration, amount: num(v.total) };
  }

  /* ------------------------------ 2. problems ------------------------------ */

  private async dismissedSet() {
    const row = await prisma.appSetting.findUnique({ where: { key: DISMISSED_KEY } }).catch(() => null);
    const list = Array.isArray(row?.value) ? (row?.value as string[]) : [];
    return new Set(list);
  }

  async dismiss(issueId: string) {
    const set = await this.dismissedSet();
    set.add(issueId);
    const value = [...set].slice(-500);
    await prisma.appSetting.upsert({ where: { key: DISMISSED_KEY }, create: { key: DISMISSED_KEY, value }, update: { value } });
    return { dismissed: issueId };
  }

  async issues() {
    const today = businessTodayYmd();
    const since = new Date(Date.now() - ISSUE_DAYS * 86400_000);
    const accounts = await this.moneyAccounts();
    const cashId = accounts.find((a) => a.system_key === 'CASH')?.id;
    const nameOf = (id: string | null | undefined) => accounts.find((a) => a.id === id)?.name ?? 'default account';
    const dismissed = await this.dismissedSet();
    type Issue = {
      id: string;
      kind: string;
      severity: 'high' | 'medium' | 'low';
      title: string;
      detail: string;
      date: string | null;
      amount?: number | null;
      action: Record<string, unknown>;
    };
    const out: Issue[] = [];

    // a) registers left open from an earlier day
    const open = await prisma.cashFlow.findMany({ where: { status: 'OPEN' }, include: { branch: { select: { name: true } } }, orderBy: { opened_at: 'asc' } });
    for (const s of open) {
      const day = toBusinessYmd(s.opened_at);
      if (day >= today) continue;
      const [lastSale, lastExp] = await Promise.all([
        prisma.sale.findFirst({ where: { sale_date: { gte: s.opened_at, lte: localRange(day, day).end }, ...(s.branch_id ? { branch_id: s.branch_id } : {}) }, orderBy: { sale_date: 'desc' }, select: { sale_date: true } }),
        prisma.expense.findFirst({ where: { cashflow_id: s.id }, orderBy: { created_at: 'desc' }, select: { created_at: true } }),
      ]);
      const last = Math.max(s.opened_at.getTime(), lastSale?.sale_date.getTime() ?? 0, lastExp?.created_at.getTime() ?? 0);
      const suggested = drawerDate(s.opened_at, new Date(last + 60_000));
      const { live } = await this.register.liveFigures(s.id, suggested);
      out.push({
        id: `open-register:${s.id}`,
        kind: 'OPEN_REGISTER',
        severity: 'high',
        title: `Register of ${day} was never closed`,
        detail: `${s.branch?.name ?? 'Register'} opened ${day} and is still open, so today's sales and expenses can land on the wrong day. Close it with that day's count.`,
        date: day,
        amount: live.expectedCash,
        action: {
          type: 'CLOSE_REGISTER',
          sessionId: s.id,
          suggestedClosedAt: suggested.toISOString(),
          expectedCash: live.expectedCash,
          cashSales: live.cashSales,
          cashOut: live.cashOut,
          salesByMethod: live.byMethod,
          expectedByMethod: live.expectedByMethod,
        },
      });
    }

    // b) "paid with" and "paid from" disagree (cash method out of the bank, or the reverse)
    if (cashId) {
      const exps = await prisma.expense.findMany({
        where: {
          status: 'APPROVED',
          expense_date: { gte: since },
          paid_from_account_id: { not: null },
          NOT: { cashflow_id: { not: null }, reference: { not: null }, particular: { startsWith: 'Purchase payment' } },
          OR: [
            { payment_method: 'CASH', NOT: { paid_from_account_id: cashId } },
            { NOT: { payment_method: 'CASH' }, paid_from_account_id: cashId },
          ],
        },
        orderBy: { expense_date: 'desc' },
        take: 50,
      });
      for (const e of exps) {
        out.push({
          id: `expense-method:${e.id}`,
          kind: 'PAID_FROM_MISMATCH',
          severity: 'medium',
          title: `Expense "${e.particular}" — paid with ${e.payment_method} but taken from ${nameOf(e.paid_from_account_id)}`,
          detail: 'The register and the books read this differently. Say where the money really came from.',
          date: toBusinessYmd(e.expense_date),
          amount: num(e.amount),
          action: { type: 'SET_PAID_FROM', entity: 'EXPENSE', id: e.id, currentAccountId: e.paid_from_account_id },
        });
      }
      const pays = await prisma.supplierPayment.findMany({
        where: {
          type: { in: SUPPLIER_CASH_TYPES },
          payment_date: { gte: since },
          paid_from_account_id: { not: null },
          OR: [
            { method: 'CASH', NOT: { paid_from_account_id: cashId } },
            { NOT: { method: { in: ['CASH', 'ADJUSTMENT'] } }, paid_from_account_id: cashId },
          ],
        },
        include: { supplier: { select: { name: true } } },
        orderBy: { payment_date: 'desc' },
        take: 50,
      });
      for (const p of pays) {
        out.push({
          id: `supplier-method:${p.id}`,
          kind: 'PAID_FROM_MISMATCH',
          severity: 'medium',
          title: `${p.supplier?.name ?? 'Supplier'} payment — method ${p.method} but taken from ${nameOf(p.paid_from_account_id)}`,
          detail: 'Say where the money really came from; the register and the books will follow.',
          date: toBusinessYmd(p.payment_date),
          amount: num(p.amount),
          action: { type: 'SET_PAID_FROM', entity: 'SUPPLIER_PAYMENT', id: p.id, supplierId: p.supplier_id, currentAccountId: p.paid_from_account_id },
        });
      }
    }

    // c) closed registers with a big difference between counted and expected
    const closed = await prisma.cashFlow.findMany({
      where: { status: 'CLOSED', opened_at: { gte: since } },
      include: { reconciliations: true },
      orderBy: { opened_at: 'desc' },
    });
    for (const s of closed) {
      const day = toBusinessYmd(s.opened_at);
      const big = s.reconciliations.filter((r) => Math.abs(num(r.variance)) >= DIFFERENCE_LIMIT);
      if (!big.length) continue;
      out.push({
        id: `closing-diff:${s.id}:${big.map((r) => `${r.method}${Math.round(num(r.variance))}`).join(',')}`,
        kind: 'CLOSING_DIFFERENCE',
        severity: big.some((r) => Math.abs(num(r.variance)) >= 5000) ? 'high' : 'medium',
        title: `Closing of ${day} is off: ${big.map((r) => `${r.method === 'CASH' ? 'cash' : r.method.toLowerCase().replace('_', ' ')} ${num(r.variance) > 0 ? '+' : ''}${Math.round(num(r.variance))}`).join(', ')}`,
        detail: 'If the count was typed wrong, correct it. A real shortage or extra can stay — dismiss this then.',
        date: day,
        amount: big.reduce((t, r) => t + num(r.variance), 0),
        action: {
          type: 'EDIT_CLOSING',
          sessionId: s.id,
          rows: s.reconciliations.map((r) => ({ method: r.method, expected: num(r.expected), actual: num(r.actual), variance: num(r.variance) })),
        },
      });
    }

    // d) Cash in Hand / Bank below zero
    const balances = await this.balancesAt(today);
    for (const a of accounts) {
      const bal = round2(balances.get(a.id) ?? 0);
      if (bal >= -1) continue;
      out.push({
        id: `negative:${a.id}:${Math.round(bal)}`,
        kind: 'NEGATIVE_BALANCE',
        severity: 'high',
        title: `${a.name} is below zero (${bal})`,
        detail: 'Real money can not be negative: some money came in without being recorded, or a payment was taken from the wrong account. Match it to the real balance.',
        date: today,
        amount: bal,
        action: { type: 'RECONCILE', accountId: a.id },
      });
    }

    // e) cash supplier payments made while a register was open — confirm drawer vs kept cash
    if (cashId) {
      const recent = new Date(Date.now() - 14 * 86400_000);
      const pays = await prisma.supplierPayment.findMany({
        where: { type: { in: ['PAYMENT', 'ADVANCE'] }, method: 'CASH', paid_from_account_id: cashId, payment_date: { gte: recent } },
        include: { supplier: { select: { name: true } } },
        orderBy: { payment_date: 'desc' },
        take: 30,
      });
      for (const p of pays) {
        const session = await prisma.cashFlow.findFirst({
          where: { opened_at: { lte: p.payment_date }, OR: [{ closed_at: null }, { closed_at: { gte: p.payment_date } }] },
          select: { id: true, opened_at: true },
        });
        if (!session) continue;
        const copy = await prisma.expense.findFirst({ where: { reference: p.id, particular: { startsWith: 'Purchase payment' }, cashflow_id: { not: null } }, select: { id: true } });
        out.push({
          id: `drawer-source:${p.id}`,
          kind: 'DRAWER_SOURCE',
          severity: 'low',
          title: `${p.supplier?.name ?? 'Supplier'} cash payment ${Math.round(num(p.amount))} — ${copy ? "taken from that day's drawer" : 'from cash already taken out'}`,
          detail: copy
            ? "It lowered the register's expected cash. If it was really paid from earlier days' cash (owner / safe), switch it."
            : "It did not touch the register. If the cashier paid it from the till, switch it.",
          date: toBusinessYmd(p.payment_date),
          amount: num(p.amount),
          action: { type: 'DRAWER_SOURCE', paymentId: p.id, fromDrawer: !!copy },
        });
      }
    }

    const order = { high: 0, medium: 1, low: 2 };
    return out
      .filter((i) => !dismissed.has(i.id))
      .sort((a, b) => order[a.severity] - order[b.severity] || (b.date ?? '').localeCompare(a.date ?? ''));
  }

  /* ------------------------------ fixes ------------------------------ */

  async closeForgottenRegister(
    sessionId: string,
    body: { closing: number; reconciliations?: { method: string; actual: number }[]; closedAt?: string | null; note?: string | null },
    actor: { userId?: string; role?: string; branchId?: string | null },
  ) {
    const s = await prisma.cashFlow.findUnique({ where: { id: sessionId }, select: { id: true, status: true, opened_at: true } });
    if (!s) throw new AppError(404, 'Register not found');
    if (s.status !== 'OPEN') throw new AppError(400, 'This register is already closed');
    const day = toBusinessYmd(s.opened_at);
    let closedAt = body.closedAt ? new Date(body.closedAt) : localRange(day, day).end;
    if (Number.isNaN(closedAt.getTime())) throw new AppError(400, 'Closing time is not valid');
    if (closedAt < s.opened_at) throw new AppError(400, 'Closing time is before the register was opened');
    closedAt = drawerDate(s.opened_at, closedAt);
    return this.register.close(
      actor,
      sessionId,
      {
        closing: num(body.closing),
        note: body.note?.trim() || `Closed later from Money Check (register was left open)`,
        reconciliations: (body.reconciliations ?? []).map((r) => ({ method: r.method, actual: num(r.actual) })),
      },
      { closedAt },
    );
  }

  async editClosing(
    sessionId: string,
    body: { closing?: number | null; reconciliations?: { method: string; actual: number }[]; note?: string | null },
    userId?: string | null,
  ) {
    return this.register.editClosing(sessionId, body, userId);
  }

  async setPaidFrom(body: { entity: 'EXPENSE' | 'SUPPLIER_PAYMENT'; id: string; accountId: string }) {
    const account = await this.moneyAccount(body.accountId);
    if (body.entity === 'EXPENSE') {
      const before = await prisma.expense.findUnique({ where: { id: body.id }, select: { paid_from_account_id: true, payment_method: true, particular: true, amount: true } });
      if (!before) throw new AppError(404, 'Expense not found');
      const method = account.system_key === 'CASH' ? 'CASH' : before.payment_method === 'CASH' ? 'BANK' : before.payment_method;
      await new ExpenseService().update(body.id, { paid_from_account_id: account.id, payment_method: method } as never);
      return { entity: 'EXPENSE', id: body.id, particular: before.particular, amount: num(before.amount), to: account.name };
    }
    const pay = await prisma.supplierPayment.findUnique({ where: { id: body.id }, select: { supplier_id: true, method: true, amount: true, type: true } });
    if (!pay) throw new AppError(404, 'Supplier payment not found');
    const method = account.system_key === 'CASH' ? 'CASH' : pay.method === 'CASH' ? 'BANK_TRANSFER' : pay.method;
    await new SupplierService().updateSupplierPayment(pay.supplier_id, body.id, { paidFromAccountId: account.id, method } as never);
    return { entity: 'SUPPLIER_PAYMENT', id: body.id, amount: num(pay.amount), to: account.name };
  }

  /** Switch a cash supplier payment between "from that day's drawer" and "from cash already taken out". */
  async setDrawerSource(paymentId: string, fromDrawer: boolean, userId?: string | null) {
    const p = await prisma.supplierPayment.findUnique({ where: { id: paymentId }, include: { supplier: { select: { name: true } } } });
    if (!p) throw new AppError(404, 'Supplier payment not found');
    if (p.method !== 'CASH') throw new AppError(400, 'Only cash payments come out of a drawer');
    const copy = await prisma.expense.findFirst({ where: { reference: p.id, particular: { startsWith: 'Purchase payment' }, cashflow_id: { not: null } }, select: { id: true } });
    // Once the owner has answered, the question leaves the problem list.
    await this.dismiss(`drawer-source:${p.id}`);
    if (!fromDrawer) {
      if (copy) await syncSupplierPaymentDrawerCopy(p.id, null);
      return { paymentId, fromDrawer: false };
    }
    if (copy) return { paymentId, fromDrawer: true };
    const session = await prisma.cashFlow.findFirst({
      where: { opened_at: { lte: p.payment_date }, OR: [{ closed_at: null }, { closed_at: { gte: p.payment_date } }] },
      select: { id: true, branch_id: true, status: true, opened_at: true },
    });
    if (!session) throw new AppError(400, 'No register was open when this payment was made');
    if (session.status === 'OPEN') {
      await recordCashPayOnOpenRegister({ particular: `Purchase payment · ${p.supplier?.name || 'Supplier'}`, amount: num(p.amount), userId, reference: p.id, paidFromAccountId: p.paid_from_account_id });
    } else {
      await prisma.expense.create({
        data: {
          particular: `Purchase payment · ${p.supplier?.name || 'Supplier'}`,
          amount: num(p.amount),
          payment_method: 'CASH',
          reference: p.id,
          expense_date: drawerDate(session.opened_at, p.payment_date),
          created_at: p.payment_date,
          branch_id: session.branch_id,
          cashflow_id: session.id,
          status: 'APPROVED',
          approved_by: userId ?? null,
          approved_at: new Date(),
          created_by: userId ?? null,
        },
      });
      await refreshClosedRegister(session.id);
    }
    return { paymentId, fromDrawer: true };
  }

  /* ------------------------------ 4. day book ------------------------------ */

  async dayBook(date?: string) {
    const day = (date || businessTodayYmd()).slice(0, 10);
    const book = await this.coa.moneyDay({ date: day });
    const expenseIds = book.lines.filter((l) => l.kind === 'EXPENSE_PAYMENT' && l.sourceId).map((l) => l.sourceId!) as string[];
    const payIds = book.lines.filter((l) => l.kind === 'SUPPLIER_PAYMENT' && l.sourceId).map((l) => l.sourceId!) as string[];
    const [expenses, pays] = await Promise.all([
      prisma.expense.findMany({ where: { id: { in: expenseIds } }, select: { id: true, particular: true, amount: true, payment_method: true, paid_from_account_id: true, cashflow_id: true, expense_date: true } }),
      prisma.supplierPayment.findMany({ where: { id: { in: payIds } }, select: { id: true, supplier_id: true, amount: true, method: true, paid_from_account_id: true, type: true, payment_date: true, supplier: { select: { name: true } } } }),
    ]);
    const expById = new Map(expenses.map((e) => [e.id, e]));
    const payById = new Map(pays.map((p) => [p.id, p]));
    const lines = book.lines.map((l) => {
      let action: Record<string, unknown> = { type: 'VIEW' };
      const ref = l.sourceRef ?? '';
      if (l.kind === 'EXPENSE_PAYMENT' && l.sourceId && expById.has(l.sourceId)) {
        const e = expById.get(l.sourceId)!;
        action = { type: 'EDIT_EXPENSE', id: e.id, particular: e.particular, amount: num(e.amount), paidFromAccountId: e.paid_from_account_id, method: e.payment_method, inRegister: !!e.cashflow_id };
      } else if (l.kind === 'SUPPLIER_PAYMENT' && l.sourceId && payById.has(l.sourceId)) {
        const p = payById.get(l.sourceId)!;
        action = { type: 'EDIT_SUPPLIER_PAYMENT', id: p.id, supplierId: p.supplier_id, supplier: p.supplier?.name, amount: num(p.amount), paidFromAccountId: p.paid_from_account_id, method: p.method };
      } else if (ref.startsWith(MONEY_CHECK_PREFIX)) {
        action = { type: 'UNDO', voucherId: l.sourceId };
      } else if (ref.startsWith('REGISTER:')) {
        action = { type: 'EDIT_CLOSING', sessionId: ref.split(':')[1] };
      } else if (ref.startsWith('SALE:') || ref.startsWith('SALE-RTN:')) {
        action = { type: 'SALE', saleId: ref.split(':')[1] };
      } else if (l.kind === 'SALARY_PAYMENT') {
        action = { type: 'OPEN', where: 'salaries' };
      } else if (l.kind === 'COMMISSION_PAYMENT') {
        action = { type: 'OPEN', where: 'commissions' };
      } else if (l.kind === 'JOURNAL') {
        action = { type: 'OPEN', where: 'adjustments', voucherNo: l.reference };
      }
      return { ...l, action };
    });
    const sessions = await prisma.cashFlow.findMany({
      where: { opened_at: { gte: localRange(day, day).start, lte: localRange(day, day).end } },
      include: { reconciliations: true },
      orderBy: { opened_at: 'asc' },
    });
    return {
      date: day,
      accounts: book.accounts,
      lines,
      registers: sessions.map((s) => ({
        id: s.id,
        status: s.status,
        openedAt: s.opened_at,
        closedAt: s.closed_at,
        closing: s.closing == null ? null : num(s.closing),
        expected: s.expected_cash == null ? null : num(s.expected_cash),
        rows: s.reconciliations.map((r) => ({ method: r.method, expected: num(r.expected), actual: num(r.actual), variance: num(r.variance) })),
      })),
    };
  }

  /** Register figures for a closing / correction form. */
  async registerForm(sessionId: string) {
    const s = await prisma.cashFlow.findUnique({ where: { id: sessionId }, include: { reconciliations: true, branch: { select: { name: true } } } });
    if (!s) throw new AppError(404, 'Register not found');
    const at = s.closed_at ?? undefined;
    const { live } = await this.register.liveFigures(s.id, at);
    return {
      id: s.id,
      day: toBusinessYmd(s.opened_at),
      branch: s.branch?.name ?? null,
      status: s.status,
      openedAt: s.opened_at,
      closedAt: s.closed_at,
      closing: s.closing == null ? null : num(s.closing),
      expectedCash: live.expectedCash,
      cashSales: live.cashSales,
      cashRefunds: live.cashRefunds,
      cashOut: live.cashOut,
      salesByMethod: live.byMethod,
      expensesByMethod: live.expensesByMethod,
      expectedByMethod: live.expectedByMethod,
      rows: s.reconciliations.map((r) => ({ method: r.method, expected: num(r.expected), actual: num(r.actual), variance: num(r.variance) })),
      note: s.variance_note,
    };
  }

  /* ------------------------------ history ------------------------------ */

  async history(limit = 100) {
    const rows = await prisma.auditLog.findMany({
      where: { action: { startsWith: 'money_check.' } },
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(limit, 1), 300),
    });
    const voucherIds = rows.map((r) => (r.details as { voucherId?: string } | null)?.voucherId).filter((v): v is string => !!v);
    const alive = new Set((await prisma.journalVoucher.findMany({ where: { id: { in: voucherIds } }, select: { id: true } })).map((v) => v.id));
    return rows.map((r) => {
      const d = (r.details ?? {}) as { voucherId?: string };
      return {
        id: r.id,
        at: r.created_at,
        by: r.user_email,
        action: r.action,
        summary: r.summary,
        details: r.details,
        undoVoucherId: d.voucherId && alive.has(d.voucherId) && r.action !== 'money_check.undo' ? d.voucherId : null,
      };
    });
  }
}
