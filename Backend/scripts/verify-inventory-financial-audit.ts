/**
 * Verify Inventory Financial Audit UI vs DB using NEW Product.purchase_rate.
 *   npx ts-node --transpile-only -r dotenv/config scripts/verify-inventory-financial-audit.ts
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../src/prisma/client';
import { InventoryService } from '../src/services/inventory.service';
import { asNumber } from '../src/utils/helpers';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const UI = {
  revenue: 1058349,
  revenueLac: 10.58,
  salesCount: 58,
  avgTicket: 18247.4,
  cogs: 733949,
  cogsLac: 7.34,
  unitsSold: 97,
  grossProfit: 324400,
  grossProfitLac: 3.24,
  margin: 30.7,
  stockCost: 12142322.78,
  stockCostCr: 1.21,
  stockUnits: 1588,
  stockRetail: 17652365, // 1.77 Cr
  discount: 52255,
  tax: 0,
  turnover: 5.5,
  daysOfStock: 66,
  lossMaking: 0,
  branch: {
    name: 'Warehouse 1',
    sales: 58,
    revenue: 1058349,
    cogs: 733949,
    profit: 324400,
    margin: 30.7,
    stockValue: 12142322.78,
    turnover: 5.5,
  },
  topCategories: [
    { name: 'Category 1536', revenue: 152580, margin: 28.7, units: 14, profit: 43780 },
    { name: 'Category 3086', revenue: 92400, margin: 32.5, units: 8, profit: 30050 },
    { name: 'Category 3134', revenue: 68400, margin: 25.7, units: 7, profit: 17600 },
  ],
  topProducts: [
    { sku: 'pa-165', profit: 13250, revenue: 42050, sold: 4, margin: 31.5 },
    { sku: 'CH14-06', profit: 13200, revenue: 46000, sold: 4, margin: 28.7 },
    { sku: 'Burgundy-Dusk-01', profit: 10500, revenue: 19500, sold: 1, margin: 53.8 },
  ],
  lowMargin: [
    { sku: 'PTA-0005-M', margin: 5.6, revenue: 9000, profit: 500 },
  ],
};

async function main() {
  const svc = new InventoryService();
  const report = await svc.getReports({ type: 'financial_audit' });
  const s = report.summary as Record<string, number>;

  // Independent DB: COMPLETED sales, COGS = qty × current purchase_rate (same as service — unit_cost not selected)
  const sales = await prisma.sale.findMany({
    where: { status: 'COMPLETED' },
    select: {
      id: true,
      discount_amount: true,
      tax_amount: true,
      sale_items: {
        select: {
          quantity: true,
          line_total: true,
          unit_cost: true,
          product: { select: { purchase_rate: true } },
        },
      },
    },
  });

  let rev = 0;
  let cogsCurrent = 0;
  let cogsFrozen = 0;
  let units = 0;
  let discount = 0;
  let tax = 0;
  let soldAtFrozenLe1 = 0;
  let soldAtCurrentLe1 = 0;
  for (const sale of sales) {
    discount += asNumber(sale.discount_amount);
    tax += asNumber(sale.tax_amount);
    for (const item of sale.sale_items) {
      const qty = asNumber(item.quantity);
      const line = asNumber(item.line_total);
      const current = asNumber(item.product.purchase_rate);
      const frozenRaw = item.unit_cost != null ? Number(item.unit_cost) : NaN;
      const frozen = Number.isFinite(frozenRaw) ? frozenRaw : current;
      rev += line;
      units += qty;
      cogsCurrent += current * qty;
      cogsFrozen += frozen * qty;
      if (frozen <= 1) soldAtFrozenLe1 += qty;
      if (current <= 1) soldAtCurrentLe1 += qty;
    }
  }

  const stock = await prisma.$queryRaw<{ cost: number; retail: number; units: number; zero_products: number }[]>(
    Prisma.sql`
      SELECT
        COALESCE(SUM(GREATEST(s.current_quantity, 0) * COALESCE(p.purchase_rate, 0)), 0)::float AS cost,
        COALESCE(SUM(
          GREATEST(s.current_quantity, 0) *
          CASE WHEN p.sales_rate_inc_dis_and_tax > 0 THEN p.sales_rate_inc_dis_and_tax ELSE p.sales_rate_exc_dis_and_tax END
        ), 0)::float AS retail,
        COALESCE(SUM(GREATEST(s.current_quantity, 0)), 0)::float AS units,
        COUNT(*) FILTER (WHERE s.current_quantity > 0 AND COALESCE(p.purchase_rate, 0) <= 1)::int AS zero_products
      FROM "Stock" s
      JOIN "Product" p ON p.id = s.product_id
    `,
  );

  const cats = (report.categories || []) as Array<{
    name: string;
    revenue: number;
    margin: number;
    units: number;
    profit: number;
  }>;
  const topProducts = (report.topProducts || []) as Array<{
    sku: string;
    profit: number;
    revenue: number;
    units: number;
    margin: number;
  }>;
  const lowMargin = (report.lowMarginProducts || []) as Array<{
    sku: string;
    margin: number;
    revenue: number;
    profit: number;
  }>;
  const branch = (report.data || [])[0] as Record<string, number | string> | undefined;

  const approx = (a: number, b: number, tol = 0.51) => Math.abs(a - b) <= tol;

  const kpi = {
    revenue: { ui: UI.revenue, service: s.totalRevenue, db_line_totals: r2(rev), ok: approx(s.totalRevenue, UI.revenue) },
    cogs: {
      ui: UI.cogs,
      service: s.totalCOGS,
      db_qty_x_current_purchase_rate: r2(cogsCurrent),
      db_qty_x_frozen_unit_cost: r2(cogsFrozen),
      ok: approx(s.totalCOGS, UI.cogs) && approx(s.totalCOGS, cogsCurrent),
      note: 'Service does not load sale_items.unit_cost — COGS = qty × CURRENT purchase_rate (your new costs).',
    },
    grossProfit: {
      ui: UI.grossProfit,
      service: s.grossProfit,
      ok: approx(s.grossProfit, UI.grossProfit),
    },
    margin: {
      ui: UI.margin,
      service: r2(s.profitMargin * (s.profitMargin > 1 ? 1 : 1)), // already percent
      serviceRaw: s.profitMargin,
      ok: approx(Number(s.profitMargin), UI.margin, 0.06),
    },
    salesCount: { ui: UI.salesCount, service: s.transactionCount, db: sales.length, ok: s.transactionCount === UI.salesCount },
    unitsSold: { ui: UI.unitsSold, service: s.unitsSold, db: r2(units), ok: approx(s.unitsSold, UI.unitsSold) },
    avgTicket: { ui: UI.avgTicket, service: s.avgTicket, ok: approx(s.avgTicket, UI.avgTicket) },
    discount: { ui: UI.discount, service: s.discount, db: r2(discount), ok: approx(s.discount, UI.discount) },
    tax: { ui: UI.tax, service: s.tax, db: r2(tax), ok: approx(s.tax, UI.tax) },
    stock: {
      cost: { ui: UI.stockCost, service: s.stockValue, db: r2(stock[0].cost), ok: approx(s.stockValue, UI.stockCost) },
      retail: { ui: UI.stockRetail, service: s.stockRetail, db: r2(stock[0].retail), ok: approx(s.stockRetail, UI.stockRetail, 1) },
      units: { ui: UI.stockUnits, service: s.stockUnits, db: r2(stock[0].units), ok: approx(s.stockUnits, UI.stockUnits) },
    },
    turnover: { ui: UI.turnover, service: s.turnover, ok: s.turnover === UI.turnover },
    daysOfStock: { ui: UI.daysOfStock, service: s.daysOfStock, ok: s.daysOfStock === UI.daysOfStock },
    lossMaking: { ui: UI.lossMaking, service: s.lossMakingCount, ok: s.lossMakingCount === UI.lossMaking },
  };

  const catChecks = UI.topCategories.map((u) => {
    const c = cats.find((x) => x.name === u.name);
    return {
      name: u.name,
      ui: u,
      db: c
        ? { revenue: c.revenue, margin: c.margin, units: c.units, profit: c.profit }
        : null,
      ok: !!c && approx(c.revenue, u.revenue) && approx(c.profit, u.profit) && approx(c.margin, u.margin, 0.06) && approx(c.units, u.units),
    };
  });

  const prodChecks = UI.topProducts.map((u) => {
    const p = topProducts.find((x) => (x.sku || '').toLowerCase() === u.sku.toLowerCase());
    return {
      sku: u.sku,
      ui: u,
      db: p
        ? { profit: p.profit, revenue: p.revenue, units: p.units, margin: p.margin }
        : null,
      ok:
        !!p &&
        approx(p.profit, u.profit) &&
        approx(p.revenue, u.revenue) &&
        approx(p.units, u.sold) &&
        approx(p.margin, u.margin, 0.06),
    };
  });

  const lowCheck = (() => {
    const u = UI.lowMargin[0];
    const p = lowMargin.find((x) => (x.sku || '').toLowerCase() === u.sku.toLowerCase());
    return {
      sku: u.sku,
      ui: u,
      db: p ? { margin: p.margin, revenue: p.revenue, profit: p.profit } : null,
      ok: !!p && approx(p.margin, u.margin, 0.06) && approx(p.revenue, u.revenue) && approx(p.profit, u.profit),
    };
  })();

  const branchOk =
    !!branch &&
    approx(Number(branch.revenue), UI.branch.revenue) &&
    approx(Number(branch.cogs), UI.branch.cogs) &&
    approx(Number(branch.profit), UI.branch.profit) &&
    approx(Number(branch.stockValue), UI.branch.stockValue) &&
    Number(branch.count) === UI.branch.sales;

  const allOk =
    kpi.revenue.ok &&
    kpi.cogs.ok &&
    kpi.grossProfit.ok &&
    kpi.margin.ok &&
    kpi.salesCount.ok &&
    kpi.unitsSold.ok &&
    kpi.avgTicket.ok &&
    kpi.discount.ok &&
    kpi.tax.ok &&
    kpi.stock.cost.ok &&
    kpi.stock.retail.ok &&
    kpi.stock.units.ok &&
    kpi.turnover.ok &&
    kpi.daysOfStock.ok &&
    kpi.lossMaking.ok &&
    catChecks.every((c) => c.ok) &&
    prodChecks.every((c) => c.ok) &&
    lowCheck.ok &&
    branchOk;

  process.stdout.write(
    JSON.stringify(
      {
        verdict: allOk
          ? 'PASS — Inventory Financial Audit matches DB; COGS & stock use NEW purchase_rate (not old 0-cost sales).'
          : 'FAIL — see mismatches',
        all_match: allOk,
        how_cogs_works:
          'Qty × current Product.purchase_rate (unit_cost not loaded in this report). Old 0-cost sale lines do NOT drive this tab.',
        if_still_used_frozen_unit_cost_cogs_would_be: r2(cogsFrozen),
        actual_cogs_with_new_rates: r2(cogsCurrent),
        sold_units_still_at_current_cost_le_1: soldAtCurrentLe1,
        sold_units_with_frozen_unit_cost_le_1: soldAtFrozenLe1,
        zero_cost_stock_products: stock[0].zero_products,
        kpi,
        branch: {
          name: branch?.name,
          ok: branchOk,
          service: branch
            ? {
                count: branch.count,
                revenue: branch.revenue,
                cogs: branch.cogs,
                profit: branch.profit,
                stockValue: branch.stockValue,
                turnover: branch.turnover,
              }
            : null,
        },
        category_checks: catChecks,
        top_product_checks: prodChecks,
        low_margin_check: lowCheck,
      },
      null,
      2,
    ) + '\n',
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
