/**
 * Audit Business Insights cost/profit vs frozen SaleItem.unit_cost.
 * Insights uses Product.purchase_rate (current). FS / Product Sales use unit_cost.
 *
 *   npx ts-node --transpile-only scripts/audit-insights-costs.ts
 */
import { PrismaClient, SaleStatus } from '@prisma/client';

const prisma = new PrismaClient();
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

async function main() {
  const sold = { notIn: [SaleStatus.CANCELLED, SaleStatus.PENDING] as SaleStatus[] };

  const productsZero = await prisma.$queryRawUnsafe<Array<{ cnt: number; sold_qty: number }>>(`
    SELECT COUNT(DISTINCT pr.id)::int AS cnt,
           COALESCE(SUM(CASE WHEN s.id IS NOT NULL THEN si.quantity ELSE 0 END),0)::float AS sold_qty
    FROM "Product" pr
    LEFT JOIN "SaleItem" si ON si.product_id = pr.id
    LEFT JOIN "Sale" s ON s.id = si.sale_id AND s.status NOT IN ('CANCELLED','PENDING')
    WHERE COALESCE(pr.purchase_rate,0) <= 1
      AND pr.is_active = true
      AND COALESCE(pr.non_inventory_item,false) = false
  `);

  const productsWithRate = await prisma.$queryRawUnsafe<Array<{ cnt: number; avg_rate: number }>>(`
    SELECT COUNT(*)::int AS cnt, COALESCE(AVG(purchase_rate),0)::float AS avg_rate
    FROM "Product"
    WHERE COALESCE(purchase_rate,0) > 1 AND is_active = true
      AND COALESCE(non_inventory_item,false) = false
  `);

  const badSaleLines = await prisma.$queryRawUnsafe<
    Array<{
      bad_zero: number;
      bad_eq_price: number;
      ok: number;
      still_zero_with_good_rate: number;
    }>
  >(`
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(si.unit_cost,0) <= 1)::int AS bad_zero,
      COUNT(*) FILTER (
        WHERE ABS(COALESCE(si.unit_cost,0) - COALESCE(si.unit_price,0)) < 0.01
          AND COALESCE(pr.purchase_rate,0) > 1
          AND ABS(pr.purchase_rate - si.unit_price) >= 1
      )::int AS bad_eq_price,
      COUNT(*) FILTER (WHERE COALESCE(si.unit_cost,0) > 1)::int AS ok,
      COUNT(*) FILTER (
        WHERE COALESCE(si.unit_cost,0) <= 1 AND COALESCE(pr.purchase_rate,0) > 1
      )::int AS still_zero_with_good_rate
    FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si.sale_id
    JOIN "Product" pr ON pr.id = si.product_id
    WHERE s.status NOT IN ('CANCELLED','PENDING')
  `);

  const items = await prisma.saleItem.findMany({
    where: { sale: { status: sold } },
    select: {
      quantity: true,
      line_total: true,
      item_type: true,
      unit_cost: true,
      sale: { select: { notes: true, discount_amount: true, subtotal: true } },
      product: { select: { purchase_rate: true, name: true, sku: true } },
    },
  });

  let rev = 0;
  let costInsights = 0;
  let costFrozen = 0;
  let zeroCostLines = 0;
  let zeroCostQty = 0;
  const zeroProducts = new Map<string, { name: string; qty: number; revenue: number; rate: number }>();

  for (const it of items) {
    const notes = (it.sale.notes || '').toLowerCase();
    if (notes.includes('[regenerated]') || notes.includes('regenerated bill')) continue;
    const qty = num(it.quantity);
    const line = num(it.line_total);
    const subtotal = num(it.sale.subtotal);
    const billDisc = subtotal > 0 ? (num(it.sale.discount_amount) * line) / subtotal : 0;
    const isReturn = it.item_type === 'RETURN' || qty < 0 || line < 0;
    const q = isReturn ? -Math.abs(qty) : qty;
    const rate = num(it.product.purchase_rate);
    const frozen =
      it.unit_cost != null && Number.isFinite(Number(it.unit_cost)) ? num(it.unit_cost) : rate;
    rev += line - billDisc;
    costInsights += rate * q;
    costFrozen += frozen * q;
    if (rate <= 1 && !isReturn && qty > 0) {
      zeroCostLines++;
      zeroCostQty += qty;
      const key = it.product.sku || it.product.name;
      const row = zeroProducts.get(key) || { name: it.product.name, qty: 0, revenue: 0, rate };
      row.qty += qty;
      row.revenue += line - billDisc;
      zeroProducts.set(key, row);
    }
  }

  const topZero = [...zeroProducts.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 15);

  const mismatch = await prisma.$queryRawUnsafe<
    Array<{
      name: string;
      sku: string;
      lines: number;
      qty: number;
      avg_unit_cost: number;
      purchase_rate: number;
    }>
  >(`
    SELECT pr.name, pr.sku,
           COUNT(*)::int AS lines,
           SUM(ABS(si.quantity))::float AS qty,
           AVG(si.unit_cost)::float AS avg_unit_cost,
           AVG(pr.purchase_rate)::float AS purchase_rate
    FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si.sale_id
    JOIN "Product" pr ON pr.id = si.product_id
    WHERE s.status NOT IN ('CANCELLED','PENDING')
      AND COALESCE(pr.purchase_rate,0) > 1
      AND ABS(COALESCE(si.unit_cost,0) - pr.purchase_rate) >= 1
    GROUP BY pr.id, pr.name, pr.sku
    ORDER BY SUM(ABS(si.quantity) * ABS(COALESCE(si.unit_cost,0) - pr.purchase_rate)) DESC
    LIMIT 12
  `);

  // Last 30 days Insights-style totals (same formula as analytics.salesBy)
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const recent = await prisma.saleItem.findMany({
    where: { sale: { status: sold, sale_date: { gte: since } } },
    select: {
      quantity: true,
      line_total: true,
      item_type: true,
      unit_cost: true,
      sale: { select: { notes: true, discount_amount: true, subtotal: true } },
      product: { select: { purchase_rate: true } },
    },
  });
  let rRev = 0;
  let rCostI = 0;
  let rCostF = 0;
  for (const it of recent) {
    const notes = (it.sale.notes || '').toLowerCase();
    if (notes.includes('[regenerated]') || notes.includes('regenerated bill')) continue;
    const qty = num(it.quantity);
    const line = num(it.line_total);
    const subtotal = num(it.sale.subtotal);
    const billDisc = subtotal > 0 ? (num(it.sale.discount_amount) * line) / subtotal : 0;
    const isReturn = it.item_type === 'RETURN' || qty < 0 || line < 0;
    const q = isReturn ? -Math.abs(qty) : qty;
    const rate = num(it.product.purchase_rate);
    const frozen =
      it.unit_cost != null && Number.isFinite(Number(it.unit_cost)) ? num(it.unit_cost) : rate;
    rRev += line - billDisc;
    rCostI += rate * q;
    rCostF += frozen * q;
  }

  console.log(
    JSON.stringify(
      {
        products: {
          withGoodRate: productsWithRate[0],
          zeroOrPlaceholderRate: productsZero[0],
        },
        saleLines: badSaleLines[0],
        allTimeTotals: {
          revenue: r2(rev),
          cost_insights_current_purchase_rate: r2(costInsights),
          profit_insights: r2(rev - costInsights),
          cost_frozen_unit_cost: r2(costFrozen),
          profit_frozen: r2(rev - costFrozen),
          difference_insights_minus_frozen_profit: r2(costFrozen - costInsights),
        },
        last30Days: {
          revenue: r2(rRev),
          cost_insights: r2(rCostI),
          profit_insights: r2(rRev - rCostI),
          cost_frozen: r2(rCostF),
          profit_frozen: r2(rRev - rCostF),
        },
        soldWithProductRateStillZeroOrOne: {
          lines: zeroCostLines,
          qty: r2(zeroCostQty),
          topProducts: topZero.map((p) => ({
            name: p.name.slice(0, 50),
            qty: r2(p.qty),
            revenue: r2(p.revenue),
            rate: p.rate,
          })),
        },
        productsWhereFrozenUnitCostDiffersFromCurrentRate: mismatch,
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
