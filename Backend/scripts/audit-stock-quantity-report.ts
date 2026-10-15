/**
 * Audit Stock Quantity Report KPIs vs DB.
 *   npx ts-node --transpile-only -r dotenv/config scripts/audit-stock-quantity-report.ts
 */
import { PrismaClient } from '@prisma/client';
import { localRange } from '../src/utils/timezone';

const prisma = new PrismaClient();
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

async function main() {
  const from = '2026-09-16';
  const to = '2026-10-15';
  const { start, end } = localRange(from, to);

  const ui = {
    availableNow: 1586,
    items: 861,
    worth: 12142323,
    bought: 267,
    sold: 96,
    closing: 1586,
    low: 118,
    out: 38,
    healthy: 705,
  };

  // Available / value = current stock × purchase_rate (same idea as service)
  const stocks = await prisma.stock.findMany({
    select: {
      current_quantity: true,
      minimum_quantity: true,
      product: {
        select: {
          id: true,
          purchase_rate: true,
          min_qty: true,
          non_inventory_item: true,
        },
      },
    },
  });

  let available = 0;
  let worth = 0;
  let low = 0;
  let out = 0;
  let healthy = 0;
  let zeroCostStockQty = 0;
  let zeroCostProducts = 0;
  const productIds = new Set<string>();

  for (const s of stocks) {
    const p = s.product;
    if (!p) continue;
    productIds.add(p.id);
    const qty = num(s.current_quantity);
    const rate = num(p.purchase_rate);
    const minQty = num(p.min_qty) || num(s.minimum_quantity);
    available += qty;
    if (qty > 0) worth += qty * rate;
    // UI / service: availableQty <= 0 → out (includes negative stock)
    if (qty <= 0) out++;
    else if (minQty > 0 && qty <= minQty) low++;
    else healthy++;
    if (qty > 0 && rate <= 1) {
      zeroCostStockQty += qty;
      zeroCostProducts++;
    }
  }

  // Bought in period = StockMovement PURCHASE (+qty) — same as Stock Quantity Report service
  const purchaseMoves = await prisma.stockMovement.findMany({
    where: {
      movement_type: 'PURCHASE',
      created_at: { gte: start, lte: end },
      quantity_change: { gt: 0 },
    },
    select: { quantity_change: true },
  });
  const boughtFromMoves = purchaseMoves.reduce((s, m) => s + num(m.quantity_change), 0);

  // Purchase table qty (Purchase Report) — often lower if some PURCHASE moves are imports/legacy
  const purchAgg = await prisma.purchase.aggregate({
    where: { purchase_date: { gte: start, lte: end } },
    _sum: { quantity: true },
    _count: { id: true },
  });

  // Sold in period from sale items (COMPLETED)
  const soldItems = await prisma.saleItem.findMany({
    where: {
      item_type: { not: 'RETURN' },
      sale: {
        status: { notIn: ['CANCELLED', 'PENDING'] },
        sale_date: { gte: start, lte: end },
      },
    },
    select: { quantity: true, unit_cost: true, product: { select: { purchase_rate: true } } },
  });
  let soldQty = 0;
  let soldCostFrozen = 0;
  let soldCostCurrent = 0;
  let soldZeroCostQty = 0;
  for (const it of soldItems) {
    const q = Math.abs(num(it.quantity));
    soldQty += q;
    const frozen =
      it.unit_cost != null && Number.isFinite(Number(it.unit_cost))
        ? num(it.unit_cost)
        : num(it.product.purchase_rate);
    soldCostFrozen += q * frozen;
    soldCostCurrent += q * num(it.product.purchase_rate);
    if (frozen <= 1) soldZeroCostQty += q;
  }

  // Also stock movements SALE qty for comparison
  const moveSold = await prisma.stockMovement.aggregate({
    where: {
      movement_type: 'SALE',
      created_at: { gte: start, lte: end },
    },
    _sum: { quantity_change: true },
  });

  const purchaseTableQty = num(purchAgg._sum.quantity);
  const sellThrough =
    boughtFromMoves > 0 ? Math.round((soldQty / boughtFromMoves) * 100) : 0;

  console.log(
    JSON.stringify(
      {
        period: { from, to },
        how_valued: 'Available value = max(qty,0) × current Product.purchase_rate',
        how_bought: 'Bought KPI = SUM(StockMovement PURCHASE where qty>0 in period)',
        db: {
          stockRows: stocks.length,
          distinctProducts: productIds.size,
          availableNow: r2(available),
          worthPositiveStock: r2(worth),
          boughtFromPurchaseMovements: r2(boughtFromMoves),
          purchaseTableQty: r2(purchaseTableQty),
          purchaseLines: purchAgg._count.id,
          soldFromSaleItems: r2(soldQty),
          soldFromMovementsAbs: r2(Math.abs(num(moveSold._sum.quantity_change))),
          sellThroughPct_saleItems_over_boughtMoves: sellThrough,
          low,
          out,
          healthy,
          soldCost_frozen_unit_cost: r2(soldCostFrozen),
          soldCost_current_purchase_rate: r2(soldCostCurrent),
        },
        vs_ui: {
          available_matches: Math.abs(r2(available) - ui.availableNow) < 0.5,
          items_matches: stocks.length === ui.items,
          worth_matches: Math.abs(Math.round(worth) - ui.worth) <= 1,
          bought_matches: Math.abs(r2(boughtFromMoves) - ui.bought) < 0.5,
          bought_vs_purchase_report: {
            stock_qty_bought: r2(boughtFromMoves),
            purchase_report_qty: r2(purchaseTableQty),
            note: 'Different sources; gap is OK (imports/legacy PURCHASE moves).',
          },
          sold_note: {
            ui: ui.sold,
            db_sale_items: r2(soldQty),
            db_movements: r2(Math.abs(num(moveSold._sum.quantity_change))),
            matches_movements: Math.abs(Math.abs(num(moveSold._sum.quantity_change)) - ui.sold) < 0.5,
          },
          low_matches: low === ui.low,
          out_matches: out === ui.out,
          healthy_matches: healthy === ui.healthy,
        },
        zero_cost: {
          on_hand_qty_with_rate_le_1: r2(zeroCostStockQty),
          on_hand_products_with_rate_le_1: zeroCostProducts,
          sold_qty_still_unit_cost_le_1: r2(soldZeroCostQty),
          verdict:
            zeroCostProducts <= 1 && soldZeroCostQty === 0
              ? 'Stock value uses current costs; sold lines not at 0 cost. At most 1 leftover zero-cost SKU on hand.'
              : 'Review zero-cost rows',
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
