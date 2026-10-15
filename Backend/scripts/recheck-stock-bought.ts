import { Prisma } from '@prisma/client';
import { prisma } from '../src/prisma/client';
import { localRange } from '../src/utils/timezone';
import { StockQuantityReportService } from '../src/services/stock-quantity-report.service';

async function main() {
  const from = '2026-09-16';
  const to = '2026-10-15';
  const { start, end } = localRange(from, to);

  const byType = await prisma.$queryRaw<
    { movement_type: string; cnt: number; in_qty: number; out_qty: number }[]
  >(Prisma.sql`
    SELECT
      m.movement_type,
      COUNT(*)::int AS cnt,
      COALESCE(SUM(CASE WHEN m.quantity_change > 0 THEN m.quantity_change ELSE 0 END), 0)::float AS in_qty,
      COALESCE(SUM(CASE WHEN m.quantity_change < 0 THEN -m.quantity_change ELSE 0 END), 0)::float AS out_qty
    FROM "StockMovement" m
    JOIN "Product" p ON p.id = m.product_id AND p.is_active = true
    WHERE m.created_at >= ${start} AND m.created_at <= ${end}
    GROUP BY m.movement_type
    ORDER BY m.movement_type
  `);

  const purchaseTable = await prisma.$queryRaw<{ qty: number }[]>(Prisma.sql`
    SELECT COALESCE(SUM(pu.quantity), 0)::float AS qty
    FROM "Purchase" pu
    WHERE pu.purchase_date >= ${start} AND pu.purchase_date <= ${end}
  `);

  const svc = new StockQuantityReportService();
  const report = await svc.report({
    from,
    to,
    activity: 'all',
    all: true,
    userRole: 'SUPER_ADMIN',
  });

  const ui = {
    available: 1586,
    worth: 12142323,
    bought: 267,
    sold: 96,
    closing: 1586,
    low: 118,
    out: 38,
    healthy: 705,
    items: 861,
  };

  const boughtFromMoves =
    byType.find((r) => r.movement_type === 'PURCHASE')?.in_qty ?? 0;

  const out = {
    period: { from, to },
    movementsByType: byType,
    purchaseTableQty: purchaseTable[0]?.qty ?? 0,
    reportService: {
      items: report.totals.count,
      opening: report.totals.opening,
      boughtQty: report.totals.boughtQty,
      soldQty: report.totals.soldQty,
      inQty: report.totals.inQty,
      outQty: report.totals.outQty,
      closing: report.totals.closing,
      availableQty: report.totals.availableQty,
      stockValue: report.stockValue,
      statusCounts: report.statusCounts,
    },
    vs_ui: {
      available: report.totals.availableQty === ui.available,
      items: report.totals.count === ui.items,
      worth: Math.round(report.stockValue) === ui.worth,
      bought: report.totals.boughtQty === ui.bought,
      sold: report.totals.soldQty === ui.sold,
      closing: report.totals.closing === ui.closing,
      low: report.statusCounts.low === ui.low,
      out: report.statusCounts.out === ui.out,
      healthy: report.statusCounts.healthy === ui.healthy,
    },
    bought_reconcile: {
      ui: ui.bought,
      reportService_PURCHASE_moves: report.totals.boughtQty,
      raw_PURCHASE_moves: boughtFromMoves,
      purchase_table_qty: purchaseTable[0]?.qty ?? 0,
      note:
        'Stock Qty Bought = StockMovement PURCHASE (+qty), not PurchaseItem sum. Gap vs Purchase Report is expected if imports/adjustments use PURCHASE type or dates differ.',
    },
  };

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
