/**
 * Audit Accounts Overview → Profit & Loss numbers against DB.
 *   npx ts-node --transpile-only scripts/audit-coa-pnl.ts
 */
import { PrismaClient, SaleStatus } from '@prisma/client';

const prisma = new PrismaClient();
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

async function main() {
  const ui = {
    salesRevenue: 1018814,
    discounts: 52255,
    netSales: 966559,
    cogs: 741199,
    grossProfit: 225360,
    expensesControl: 1468811,
    previousPosExpenses: 1425511,
    commission: 5100,
    totalRunningExpenses: 1473911,
    netLoss: 1248551,
  };

  // Sale-side totals (COMPLETED)
  const sales = await prisma.sale.findMany({
    where: { status: { notIn: [SaleStatus.CANCELLED, SaleStatus.PENDING] } },
    select: {
      total_amount: true,
      subtotal: true,
      discount_amount: true,
      tax_amount: true,
      notes: true,
      sale_items: { select: { quantity: true, line_total: true, unit_cost: true, unit_price: true, item_type: true, product: { select: { purchase_rate: true } } } },
    },
  });

  let billTotal = 0;
  let billDiscount = 0;
  let billTax = 0;
  let billSubtotal = 0;
  let lineTotal = 0;
  let cogsFrozen = 0;
  let cogsCurrent = 0;
  let zeroCostLines = 0;

  for (const s of sales) {
    const notes = (s.notes || '').toLowerCase();
    if (notes.includes('[regenerated]') || notes.includes('regenerated bill')) continue;
    billTotal += num(s.total_amount);
    billDiscount += num(s.discount_amount);
    billTax += num(s.tax_amount);
    billSubtotal += num(s.subtotal);
    for (const it of s.sale_items) {
      const qty = num(it.quantity);
      const line = num(it.line_total);
      const isReturn = it.item_type === 'RETURN' || qty < 0 || line < 0;
      const q = isReturn ? -Math.abs(qty) : qty;
      lineTotal += line;
      const rate = num(it.product.purchase_rate);
      const frozen =
        it.unit_cost != null && Number.isFinite(Number(it.unit_cost)) ? num(it.unit_cost) : rate;
      cogsFrozen += frozen * q;
      cogsCurrent += rate * q;
      if (!isReturn && frozen <= 1) zeroCostLines++;
    }
  }

  // Ledger balances (opening + journal lines) as debit − credit
  const ledgerRows = await prisma.$queryRawUnsafe<
    Array<{ code: string; name: string; balance: number; system_key: string | null }>
  >(`
    SELECT a.code, a.name, a.system_key,
           (
             CASE WHEN a.opening_side = 'CREDIT' THEN -a.opening_balance ELSE a.opening_balance END
             + COALESCE((SELECT SUM(jl.debit - jl.credit) FROM "JournalVoucherLine" jl WHERE jl.account_id = a.id), 0)
           )::float AS balance
    FROM "TransactionalAccount" a
    WHERE a.code IN (
      '4110001','4110002','5110001','5210001','5210003','5210004','5210005',
      '5210006','5210007','5210008','5210009','5210010','5230001'
    )
    ORDER BY a.code
  `);

  // COGS account specifically — may be synthetic (not journaled)
  const cogsAcct = ledgerRows.find((a) => a.code.startsWith('511') || /cogs|cost of goods/i.test(a.name));

  const salesRev = ledgerRows.find((a) => a.code === '4110001');
  const salesDisc = ledgerRows.find((a) => a.code === '4110002');
  const prevPos = ledgerRows.find((a) => a.code === '5210008');
  const commission = ledgerRows.find((a) => a.code === '5230001');

  // Natural income = credit - debit for type 4; expense = debit - credit for type 5
  // Raw balance above is DEBIT - CREDIT. For sales (income), natural = -(debit-credit) = credit-debit.
  const naturalIncome = (bal: number) => -bal;
  const naturalExpense = (bal: number) => bal;

  const computedNetSalesFromLedger =
    naturalIncome(num(salesRev?.balance)) + naturalIncome(num(salesDisc?.balance));

  const uiGrossOk = Math.abs(ui.netSales - ui.cogs - ui.grossProfit) < 1;
  const uiNetOk =
    Math.abs(ui.grossProfit - ui.totalRunningExpenses - (-ui.netLoss)) < 2 ||
    Math.abs(ui.grossProfit - ui.totalRunningExpenses + ui.netLoss) < 2;
  // net = gross - expenses → netLoss magnitude = expenses - gross
  const expectedNet = ui.grossProfit - ui.totalRunningExpenses; // negative
  const uiNetCalcOk = Math.abs(expectedNet - -ui.netLoss) < 2 || Math.abs(expectedNet - ui.netLoss) < 2;

  console.log(
    JSON.stringify(
      {
        ui_arithmetic: {
          netSales_from_revenue_minus_discount: r2(ui.salesRevenue - ui.discounts),
          matches_ui_netSales: r2(ui.salesRevenue - ui.discounts) === ui.netSales,
          grossProfit_from_netSales_minus_cogs: r2(ui.netSales - ui.cogs),
          matches_ui_gross: r2(ui.netSales - ui.cogs) === ui.grossProfit,
          expected_net_profit_gross_minus_expenses: r2(ui.grossProfit - ui.totalRunningExpenses),
          ui_shows_net_loss: ui.netLoss,
          expenses_breakdown_sum:
            r2(ui.expensesControl + ui.commission) === ui.totalRunningExpenses,
        },
        sales_from_Sale_table: {
          bill_total_amount: r2(billTotal),
          bill_subtotal: r2(billSubtotal),
          bill_discount: r2(billDiscount),
          bill_tax: r2(billTax),
          line_totals_sum: r2(lineTotal),
          note: 'COA Net sales may exclude tax / use journal postings, not raw Sale.total_amount',
        },
        cogs: {
          ui: ui.cogs,
          from_sale_line_unit_cost_frozen: r2(cogsFrozen),
          from_current_product_purchase_rate: r2(cogsCurrent),
          matches_ui_frozen: Math.abs(r2(cogsFrozen) - ui.cogs) < 1,
          zero_or_placeholder_unit_cost_sold_lines: zeroCostLines,
          verdict:
            Math.abs(r2(cogsFrozen) - ui.cogs) < 1
              ? 'COGS is correct — uses frozen sale unit_cost (NOT zero-cost profit)'
              : 'COGS mismatch — investigate',
        },
        ledger_accounts_debit_minus_credit: ledgerRows.map((a) => ({
          code: a.code,
          name: a.name,
          raw_debit_minus_credit: r2(a.balance),
          natural_pnl_amount: a.code.startsWith('4')
            ? r2(naturalIncome(a.balance))
            : r2(naturalExpense(a.balance)),
        })),
        compare_ui_vs_ledger: {
          salesRevenue_ui: ui.salesRevenue,
          salesRevenue_ledger_natural: salesRev ? r2(naturalIncome(salesRev.balance)) : null,
          discounts_ui: ui.discounts,
          discounts_ledger_natural: salesDisc ? r2(Math.abs(naturalIncome(salesDisc.balance))) : null,
          previousPos_ui: ui.previousPosExpenses,
          previousPos_ledger: prevPos ? r2(naturalExpense(prevPos.balance)) : null,
          commission_ui: ui.commission,
          commission_ledger: commission ? r2(naturalExpense(commission.balance)) : null,
          cogs_account: cogsAcct || null,
        },
        why_net_loss: {
          gross_profit: ui.grossProfit,
          huge_expense_driver: '5210008 Previous POS Expenses',
          previous_pos_expenses: ui.previousPosExpenses,
          explanation:
            'Net loss is driven by historical Previous POS Expenses (~1.43M), not by zero product cost. COGS 741,199 is the corrected sale-line cost.',
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
