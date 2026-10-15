/**
 * Full verify: Stock Quantity Report UI vs DB using NEW Product.purchase_rate.
 *   npx ts-node --transpile-only -r dotenv/config scripts/verify-stock-qty-costs.ts
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../src/prisma/client';
import { localRange } from '../src/utils/timezone';
import { StockQuantityReportService } from '../src/services/stock-quantity-report.service';

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

const UI = {
  from: '2026-09-16',
  to: '2026-10-15',
  available: 1586,
  items: 861,
  worth: 12142323,
  bought: 267,
  sold: 96,
  sellThroughPct: 36,
  closing: 1586,
  opening: 0,
  low: 118,
  out: 38,
  healthy: 705,
  // Spot-check lines from Stock Quantity Report.txt (sku → available, value)
  lines: [
    { sku: 'AR-MB-D7', available: 2, value: 23600 },
    { sku: 'CH14-08', available: 1, value: 11050 },
    { sku: 'CH12-D08', available: 1, value: 5800 },
    { sku: '4036', available: 3, value: 19050 },
    { sku: 'Burgundy-Dusk-01', available: 1, value: 9000 },
    { sku: '811786142', available: 1, value: 12000 },
    { sku: '136370221', available: 2, value: 24000 },
  ],
};

async function main() {
  const { start, end } = localRange(UI.from, UI.to);
  const svc = new StockQuantityReportService();
  const report = await svc.report({
    from: UI.from,
    to: UI.to,
    activity: 'all',
    all: true,
    userRole: 'SUPER_ADMIN',
  });

  // Stock table × current purchase_rate (source of truth for Value column)
  const stockAgg = await prisma.$queryRaw<
    {
      items: number;
      available: number;
      worth: number;
      zero_cost_qty: number;
      zero_cost_products: number;
      low: number;
      out: number;
      healthy: number;
    }[]
  >(Prisma.sql`
    SELECT
      COUNT(*)::int AS items,
      COALESCE(SUM(s.current_quantity), 0)::float AS available,
      COALESCE(SUM(GREATEST(s.current_quantity, 0) * COALESCE(p.purchase_rate, 0)), 0)::float AS worth,
      COALESCE(SUM(CASE WHEN s.current_quantity > 0 AND COALESCE(p.purchase_rate, 0) <= 1 THEN s.current_quantity ELSE 0 END), 0)::float AS zero_cost_qty,
      COUNT(*) FILTER (WHERE s.current_quantity > 0 AND COALESCE(p.purchase_rate, 0) <= 1)::int AS zero_cost_products,
      COUNT(*) FILTER (
        WHERE s.current_quantity > 0
          AND COALESCE(p.min_qty, 0) > 0
          AND s.current_quantity <= COALESCE(p.min_qty, 0)
      )::int AS low,
      COUNT(*) FILTER (WHERE s.current_quantity <= 0)::int AS out,
      COUNT(*) FILTER (
        WHERE s.current_quantity > 0
          AND NOT (
            COALESCE(p.min_qty, 0) > 0
            AND s.current_quantity <= COALESCE(p.min_qty, 0)
          )
      )::int AS healthy
    FROM "Stock" s
    JOIN "Product" p ON p.id = s.product_id
    WHERE p.is_active = true
  `);

  const zeroCostRows = await prisma.$queryRaw<
    { sku: string; name: string; qty: number; rate: number; retail: number }[]
  >(Prisma.sql`
    SELECT p.sku, p.name,
      s.current_quantity::float AS qty,
      COALESCE(p.purchase_rate, 0)::float AS rate,
      CASE WHEN p.sales_rate_inc_dis_and_tax > 0 THEN p.sales_rate_inc_dis_and_tax ELSE p.sales_rate_exc_dis_and_tax END::float AS retail
    FROM "Stock" s
    JOIN "Product" p ON p.id = s.product_id
    WHERE p.is_active = true
      AND s.current_quantity > 0
      AND COALESCE(p.purchase_rate, 0) <= 1
    ORDER BY p.name
    LIMIT 20
  `);

  // Would-be worth if still at 0 cost (sanity: new costs must make worth >> 0)
  const worthIfZero = 0;

  // Spot-check UI lines
  const spot: Array<Record<string, unknown>> = [];
  for (const line of UI.lines) {
    const db = await prisma.$queryRaw<
      { sku: string; name: string; qty: number; rate: number; value: number }[]
    >(Prisma.sql`
      SELECT p.sku, p.name,
        COALESCE(SUM(s.current_quantity), 0)::float AS qty,
        COALESCE(p.purchase_rate, 0)::float AS rate,
        COALESCE(SUM(GREATEST(s.current_quantity, 0) * COALESCE(p.purchase_rate, 0)), 0)::float AS value
      FROM "Product" p
      LEFT JOIN "Stock" s ON s.product_id = p.id
      WHERE p.sku = ${line.sku}
      GROUP BY p.id, p.sku, p.name, p.purchase_rate
    `);
    const row = db[0];
    const qty = row ? num(row.qty) : null;
    const value = row ? r2(num(row.value)) : null;
    const rate = row ? num(row.rate) : null;
    spot.push({
      sku: line.sku,
      ui_available: line.available,
      ui_value: line.value,
      db_qty: qty,
      db_rate: rate,
      db_value: value,
      qty_ok: qty === line.available,
      value_ok: value === line.value,
      uses_new_cost: rate != null && rate > 1,
      calc: rate != null && qty != null ? `${qty} × ${rate} = ${r2(Math.max(qty, 0) * rate)}` : null,
    });
  }

  // Movement KPIs
  const moves = await prisma.$queryRaw<
    { bought: number; sold: number; in_qty: number; out_qty: number; opening: number }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM(CASE WHEN m.created_at < ${start} THEN m.quantity_change ELSE 0 END), 0)::float AS opening,
      COALESCE(SUM(CASE WHEN m.created_at >= ${start} AND m.created_at <= ${end} AND m.movement_type = 'PURCHASE' AND m.quantity_change > 0 THEN m.quantity_change ELSE 0 END), 0)::float AS bought,
      COALESCE(SUM(CASE WHEN m.created_at >= ${start} AND m.created_at <= ${end} AND m.movement_type = 'SALE' AND m.quantity_change < 0 THEN -m.quantity_change ELSE 0 END), 0)::float AS sold,
      COALESCE(SUM(CASE WHEN m.created_at >= ${start} AND m.created_at <= ${end} AND m.quantity_change > 0 THEN m.quantity_change ELSE 0 END), 0)::float AS in_qty,
      COALESCE(SUM(CASE WHEN m.created_at >= ${start} AND m.created_at <= ${end} AND m.quantity_change < 0 THEN -m.quantity_change ELSE 0 END), 0)::float AS out_qty
    FROM "StockMovement" m
    JOIN "Product" p ON p.id = m.product_id AND p.is_active = true
  `);

  const sa = stockAgg[0];
  const mv = moves[0];
  const closing = r2(num(mv.opening) + num(mv.in_qty) - num(mv.out_qty));
  const sellBase = num(mv.opening) + num(mv.bought);
  const sellThrough =
    sellBase > 0 ? Math.round((num(mv.sold) / sellBase) * 1000) / 10 : null;

  // Report service totals for products that have stock rows (UI "861 items" = stock rows)
  const reportWorth = r2(num(report.totals.stockValue));
  // Filter report lines to those with a stock row existence isn't direct — compare stockAgg worth

  const kpi = {
    available: {
      ui: UI.available,
      db_stock: r2(num(sa.available)),
      report: report.totals.availableQty,
      ok: Math.abs(r2(num(sa.available)) - UI.available) < 0.5,
    },
    worth: {
      ui: UI.worth,
      db_stock_x_purchase_rate: r2(num(sa.worth)),
      report_stockValue: reportWorth,
      ok: Math.abs(Math.round(num(sa.worth)) - UI.worth) <= 1,
      note: 'Value = max(qty,0) × CURRENT Product.purchase_rate (your new costs). NOT old sale unit_cost.',
      if_still_zero_cost_would_be: worthIfZero,
    },
    bought: {
      ui: UI.bought,
      db_purchase_moves: r2(num(mv.bought)),
      report: report.totals.boughtQty,
      ok: r2(num(mv.bought)) === UI.bought,
    },
    sold: {
      ui: UI.sold,
      db_sale_moves: r2(num(mv.sold)),
      report: report.totals.soldQty,
      ok: r2(num(mv.sold)) === UI.sold,
    },
    opening: {
      ui: UI.opening,
      db: r2(num(mv.opening)),
      report: report.totals.opening,
      ok: r2(num(mv.opening)) === UI.opening,
    },
    closing: {
      ui: UI.closing,
      db_opening_plus_in_minus_out: closing,
      report: report.totals.closing,
      ok: closing === UI.closing && report.totals.closing === UI.closing,
    },
    sellThrough: {
      ui: UI.sellThroughPct,
      db: sellThrough,
      ok: sellThrough === UI.sellThroughPct,
    },
    status: {
      items: { ui: UI.items, db: num(sa.items), ok: num(sa.items) === UI.items },
      low: { ui: UI.low, db: num(sa.low), ok: num(sa.low) === UI.low },
      out: { ui: UI.out, db: num(sa.out), ok: num(sa.out) === UI.out },
      healthy: { ui: UI.healthy, db: num(sa.healthy), ok: num(sa.healthy) === UI.healthy },
    },
  };

  const allKpiOk =
    kpi.available.ok &&
    kpi.worth.ok &&
    kpi.bought.ok &&
    kpi.sold.ok &&
    kpi.opening.ok &&
    kpi.closing.ok &&
    kpi.sellThrough.ok &&
    kpi.status.items.ok &&
    kpi.status.low.ok &&
    kpi.status.out.ok &&
    kpi.status.healthy.ok;

  const spotOk = spot.every((s) => s.qty_ok && s.value_ok && s.uses_new_cost);

  process.stdout.write(
    JSON.stringify(
      {
        period: { from: UI.from, to: UI.to },
        verdict: allKpiOk && spotOk
          ? 'PASS — Stock Quantity Report numbers match DB; Values use your NEW purchase_rate costs (not 0-cost sales).'
          : 'FAIL — see mismatches below',
        kpi_all_match: allKpiOk,
        spot_checks_all_match: spotOk,
        kpi,
        spot_checks: spot,
        zero_cost_on_hand: {
          products: num(sa.zero_cost_products),
          qty: r2(num(sa.zero_cost_qty)),
          samples: zeroCostRows,
          note:
            num(sa.zero_cost_products) === 0
              ? 'No on-hand products still at cost ≤ 1.'
              : 'Only these leftover SKUs still have purchase_rate ≤ 1 — set their cost to fix their Value.',
        },
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
