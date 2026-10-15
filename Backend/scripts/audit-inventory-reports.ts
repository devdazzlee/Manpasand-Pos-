/**
 * Audit Inventory Reports → Stock Valuation against DB.
 * Uses current Product.purchase_rate (same as inventory-report.service).
 *
 *   npx ts-node --transpile-only scripts/audit-inventory-reports.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

const ui = {
  stockAtCostBranch: 12142322.78,
  stockAtRetail: 17652365,
  potentialProfitLac: 55.1,
  pieces: 1588,
  productsInStock: 823,
  stockRows: 861,
  low: 118,
  out: 36,
  negative: 2,
  tableCost: 12113222.78,
  tablePieces: 1586,
  purchasesTotal: 1496300,
  purchasesLines: 81,
  purchasesQty: 202,
};

async function main() {
  const stocks = await prisma.stock.findMany({
    select: {
      current_quantity: true,
      minimum_quantity: true,
      branch: { select: { id: true, name: true } },
      product: {
        select: {
          id: true,
          name: true,
          purchase_rate: true,
          sales_rate_inc_dis_and_tax: true,
          sales_rate_exc_dis_and_tax: true,
          min_qty: true,
          is_active: true,
          non_inventory_item: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Match service: include all stock rows tied to products (filter non-inventory if service does)
  let cost = 0;
  let retail = 0;
  let units = 0;
  const statusCounts = { ok: 0, low: 0, out: 0, negative: 0 };
  const productsInStock = new Set<string>();
  let zeroCostWithStock = 0;
  let zeroCostValueAtRetail = 0;
  const zeroCostSamples: { name: string; qty: number; rate: number; retail: number }[] = [];
  const byCategory = new Map<string, { name: string; cost: number; qty: number; rows: number }>();

  for (const s of stocks) {
    const p = s.product;
    if (!p) continue;
    // Match inventory-report.service valuation: no non_inventory filter on stock rows
    const qty = num(s.current_quantity);
    const unitCost = num(p.purchase_rate);
    const unitPrice = num(p.sales_rate_inc_dis_and_tax) || num(p.sales_rate_exc_dis_and_tax);
    const minQty = num(p.min_qty) || num(s.minimum_quantity);
    const status = qty < 0 ? 'negative' : qty === 0 ? 'out' : minQty > 0 && qty <= minQty ? 'low' : 'ok';
    statusCounts[status as keyof typeof statusCounts] += 1;

    if (qty > 0) {
      cost += qty * unitCost;
      retail += qty * unitPrice;
      units += qty;
      productsInStock.add(p.id);
      const catId = p.category?.id || 'none';
      const catName = p.category?.name || 'Uncategorized';
      const g = byCategory.get(catId) || { name: catName, cost: 0, qty: 0, rows: 0 };
      g.cost += qty * unitCost;
      g.qty += qty;
      g.rows += 1;
      byCategory.set(catId, g);

      if (unitCost <= 1) {
        zeroCostWithStock++;
        zeroCostValueAtRetail += qty * unitPrice;
        if (zeroCostSamples.length < 12) {
          zeroCostSamples.push({
            name: p.name.slice(0, 50),
            qty: r2(qty),
            rate: unitCost,
            retail: r2(unitPrice),
          });
        }
      }
    }
  }

  // viewTotals like UI table (all rows including qty<=0 that remain in list)
  let viewCost = 0;
  let viewQty = 0;
  for (const s of stocks) {
    if (!s.product) continue;
    const qty = num(s.current_quantity);
    viewCost += qty * num(s.product.purchase_rate);
    viewQty += qty;
  }

  const purchases = await prisma.purchase.findMany({
    select: { quantity: true, cost_price: true, sale_price: true },
  });
  let purchTotal = 0;
  let purchQty = 0;
  let purchZeroCost = 0;
  let purchCostEqSale = 0;
  for (const p of purchases) {
    const qty = num(p.quantity);
    const costP = num(p.cost_price);
    const saleP = num(p.sale_price);
    purchTotal += qty * costP;
    purchQty += qty;
    if (costP <= 1) purchZeroCost++;
    if (saleP > 0 && Math.abs(costP - saleP) < 0.01) purchCostEqSale++;
  }

  // Outflow SALE cost: unit_cost on movement or purchase_rate
  const saleMoves = await prisma.stockMovement.findMany({
    where: { movement_type: 'SALE' },
    select: {
      quantity_change: true,
      unit_cost: true,
      product: { select: { purchase_rate: true } },
    },
    take: 50000,
  });
  let outflowFrozen = 0;
  let outflowCurrent = 0;
  let outflowZero = 0;
  for (const m of saleMoves) {
    const qty = Math.abs(num(m.quantity_change));
    const frozen = num(m.unit_cost) || num(m.product.purchase_rate);
    const current = num(m.product.purchase_rate);
    outflowFrozen += qty * frozen;
    outflowCurrent += qty * current;
    if (frozen <= 1) outflowZero += qty;
  }

  const profit = retail - cost;
  const margin = retail > 0 ? Math.round((profit / retail) * 1000) / 10 : 0;
  const topCats = [...byCategory.values()]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5)
    .map((c) => ({
      name: c.name,
      cost: r2(c.cost),
      qty: r2(c.qty),
      rows: c.rows,
      share: cost > 0 ? Math.round((c.cost / cost) * 100) : 0,
    }));

  console.log(
    JSON.stringify(
      {
        how_valued: 'Stock qty × current Product.purchase_rate (NOT old sale unit_cost)',
        valuation_db: {
          stockAtCost: r2(cost),
          stockAtRetail: r2(retail),
          potentialProfit: r2(profit),
          potentialProfitLac: r2(profit / 100_000),
          marginPct: margin,
          pieces: r2(units),
          productsInStock: productsInStock.size,
          stockRows: stocks.length,
          statusCounts,
        },
        vs_ui: {
          cost_matches_branch_card: Math.abs(r2(cost) - ui.stockAtCostBranch) < 1,
          retail_matches: Math.abs(r2(retail) - ui.stockAtRetail) < 1,
          pieces_matches: Math.abs(r2(units) - ui.pieces) < 0.5,
          products_matches: productsInStock.size === ui.productsInStock,
          low_matches: statusCounts.low === ui.low,
          out_matches: statusCounts.out === ui.out,
          negative_matches: statusCounts.negative === ui.negative,
          ui_cost: ui.stockAtCostBranch,
          db_cost: r2(cost),
          ui_retail: ui.stockAtRetail,
          db_retail: r2(retail),
          ui_profit_lac: ui.potentialProfitLac,
          db_profit_lac: r2(profit / 100_000),
        },
        table_footer_note: {
          ui_table: { cost: ui.tableCost, pieces: ui.tablePieces },
          db_all_rows_including_zero_neg: { cost: r2(viewCost), pieces: r2(viewQty) },
          reason: 'Summary cards only sum qty>0; table footer can include filtered/all rows — small piece/cost diffs are expected',
        },
        zero_cost_stock: {
          products_with_stock_and_rate_le_1: zeroCostWithStock,
          retail_value_at_risk_if_cost_still_zero: r2(zeroCostValueAtRetail),
          samples: zeroCostSamples,
          verdict:
            zeroCostWithStock === 0
              ? 'No on-hand stock is still valued at 0/1 cost — valuation uses your new purchase rates'
              : 'Some stock rows still have purchase_rate ≤ 1',
        },
        top_categories_db: topCats,
        ui_top_categories: [
          { name: 'Category 1536', cost: 1524050 },
          { name: 'Category 3086', cost: 662450 },
          { name: 'Category 3097', cost: 639700 },
          { name: 'Category 2450', cost: 613877.78 },
          { name: 'Category 3135', cost: 613300 },
        ],
        purchases_all_time: {
          lines: purchases.length,
          qty: r2(purchQty),
          total: r2(purchTotal),
          ui_total: ui.purchasesTotal,
          matches_ui: Math.abs(r2(purchTotal) - ui.purchasesTotal) < 1,
          lines_with_cost_le_1: purchZeroCost,
          lines_where_cost_equals_sale_price: purchCostEqSale,
          note: 'Purchase tab 0% margin rows mean cost_price was saved equal to sale price on those bills — not zero stock valuation',
        },
        sale_outflow_movements: {
          count: saleMoves.length,
          cost_using_movement_or_product: r2(outflowFrozen),
          cost_if_all_current_purchase_rate: r2(outflowCurrent),
          qty_still_at_cost_le_1: r2(outflowZero),
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
