/**
 * Audit Reports & Analytics tab (GET /reports) against DB.
 *   npx ts-node --transpile-only scripts/audit-reports-analytics.ts
 */
import { PrismaClient, SaleStatus } from '@prisma/client';

const prisma = new PrismaClient();
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

async function main() {
  // Same as ReportsService.getReportsStats — NO status filter
  const allWhere = {};
  const [totalSales, totalRevenueAgg, uniqueCustomers] = await Promise.all([
    prisma.sale.count({ where: allWhere }),
    prisma.sale.aggregate({ where: allWhere, _sum: { total_amount: true } }),
    prisma.sale.findMany({
      where: allWhere,
      select: { customer_id: true },
      distinct: ['customer_id'],
    }),
  ]);
  const totalRevenue = num(totalRevenueAgg._sum.total_amount);
  const uniqueCust = uniqueCustomers.filter((c) => c.customer_id).length;

  // Cleaner comparison: exclude cancelled/pending
  const soldWhere = { status: { notIn: [SaleStatus.CANCELLED, SaleStatus.PENDING] } };
  const [soldCount, soldRevAgg, soldCust] = await Promise.all([
    prisma.sale.count({ where: soldWhere }),
    prisma.sale.aggregate({ where: soldWhere, _sum: { total_amount: true } }),
    prisma.sale.findMany({
      where: soldWhere,
      select: { customer_id: true },
      distinct: ['customer_id'],
    }),
  ]);

  const byStatus = await prisma.sale.groupBy({
    by: ['status'],
    _count: { id: true },
    _sum: { total_amount: true },
  });

  // Daily like frontend (UTC date from sale_date) last 7 calendar days from "today"
  const today = new Date();
  const daily: Array<{ date: string; sales: number; orders: number; customers: number }> = [];
  const sales = await prisma.sale.findMany({
    where: allWhere,
    select: {
      sale_date: true,
      total_amount: true,
      customer_id: true,
      status: true,
    },
  });
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const daySales = sales.filter((s) => {
      try {
        return new Date(s.sale_date).toISOString().split('T')[0] === dateStr;
      } catch {
        return false;
      }
    });
    daily.push({
      date: dateStr,
      sales: r2(daySales.reduce((t, s) => t + Math.abs(num(s.total_amount)), 0)),
      orders: daySales.length,
      customers: new Set(daySales.map((s) => s.customer_id).filter(Boolean)).size,
    });
  }

  // Top products — same as ReportsService: groupBy qty, revenue = catalog price * qty
  const topGrouped = await prisma.saleItem.groupBy({
    by: ['product_id'],
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 8,
  });
  const products = await prisma.product.findMany({
    where: { id: { in: topGrouped.map((p) => p.product_id) } },
    select: {
      id: true,
      name: true,
      purchase_rate: true,
      sales_rate_inc_dis_and_tax: true,
      sales_rate_exc_dis_and_tax: true,
    },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Actual sold revenue from sale lines for those products
  const actualLines = await prisma.saleItem.findMany({
    where: { product_id: { in: topGrouped.map((p) => p.product_id) } },
    select: {
      product_id: true,
      quantity: true,
      line_total: true,
      unit_cost: true,
      sale: { select: { status: true } },
    },
  });
  const actualByProduct = new Map<string, { qty: number; lineRev: number; cogsFrozen: number; cogsCurrent: number }>();
  for (const row of actualLines) {
    if (row.sale.status === 'CANCELLED' || row.sale.status === 'PENDING') continue;
    const p = productMap.get(row.product_id);
    const agg = actualByProduct.get(row.product_id) || {
      qty: 0,
      lineRev: 0,
      cogsFrozen: 0,
      cogsCurrent: 0,
    };
    const q = num(row.quantity);
    agg.qty += q;
    agg.lineRev += num(row.line_total);
    const frozen =
      row.unit_cost != null && Number.isFinite(Number(row.unit_cost))
        ? num(row.unit_cost)
        : num(p?.purchase_rate);
    agg.cogsFrozen += frozen * q;
    agg.cogsCurrent += num(p?.purchase_rate) * q;
    actualByProduct.set(row.product_id, agg);
  }

  const catalogTop = topGrouped.map((g) => {
    const p = productMap.get(g.product_id);
    const qty = num(g._sum.quantity);
    const price = num(p?.sales_rate_inc_dis_and_tax || p?.sales_rate_exc_dis_and_tax);
    const catalogRev = price * qty;
    const actual = actualByProduct.get(g.product_id);
    return {
      name: (p?.name || 'Unknown').slice(0, 60),
      qty_groupBy: qty,
      catalog_price: price,
      ui_revenue_catalog_x_qty: r2(catalogRev),
      actual_line_total: r2(actual?.lineRev || 0),
      purchase_rate: num(p?.purchase_rate),
      cogs_current_rate: r2(actual?.cogsCurrent || 0),
      cogs_frozen_unit_cost: r2(actual?.cogsFrozen || 0),
      zero_cost_product: num(p?.purchase_rate) <= 1,
    };
  });

  // Category names + sample
  const cats = await prisma.$queryRawUnsafe<
    Array<{ category: string; sales: number }>
  >(`
    SELECT COALESCE(c.name, 'Uncategorized') AS category,
           SUM(ABS(si.line_total))::float AS sales
    FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si.sale_id
    JOIN "Product" pr ON pr.id = si.product_id
    LEFT JOIN "Category" c ON c.id = pr.category_id
    WHERE s.status NOT IN ('CANCELLED','PENDING')
    GROUP BY COALESCE(c.name, 'Uncategorized')
    ORDER BY sales DESC
    LIMIT 8
  `);

  // Any sold product still at 0/1 cost?
  const zeroCostSold = await prisma.$queryRawUnsafe<
    Array<{ cnt: number; qty: number; revenue: number }>
  >(`
    SELECT COUNT(*)::int AS cnt,
           COALESCE(SUM(si.quantity),0)::float AS qty,
           COALESCE(SUM(si.line_total),0)::float AS revenue
    FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si.sale_id
    JOIN "Product" pr ON pr.id = si.product_id
    WHERE s.status NOT IN ('CANCELLED','PENDING')
      AND COALESCE(pr.purchase_rate,0) <= 1
      AND si.quantity > 0
  `);

  const ui = {
    totalRevenue: 1006094,
    totalOrders: 58,
    avgOrder: 17346.45,
    uniqueCustomers: 47,
    daily: [
      { date: '2026-10-11', sales: 257049, orders: 18 },
      { date: '2026-10-12', sales: 312635, orders: 22 },
      { date: '2026-10-13', sales: 436410, orders: 18 },
    ],
  };

  console.log(
    JSON.stringify(
      {
        note: 'Reports & Analytics tab shows REVENUE only — no profit/COGS on this screen.',
        kpi_as_api_no_status_filter: {
          totalSales,
          totalRevenue: r2(totalRevenue),
          avgOrder: totalSales > 0 ? r2(totalRevenue / totalSales) : 0,
          uniqueCustomers: uniqueCust,
          matches_ui: {
            revenue: r2(totalRevenue) === ui.totalRevenue,
            orders: totalSales === ui.totalOrders,
            customers: uniqueCust === ui.uniqueCustomers,
          },
        },
        kpi_if_exclude_cancelled_pending: {
          totalSales: soldCount,
          totalRevenue: r2(num(soldRevAgg._sum.total_amount)),
          uniqueCustomers: soldCust.filter((c) => c.customer_id).length,
        },
        sales_by_status: byStatus.map((s) => ({
          status: s.status,
          count: s._count.id,
          revenue: r2(num(s._sum.total_amount)),
        })),
        daily_last_7_utc: daily,
        ui_daily_check: ui.daily.map((d) => {
          const row = daily.find((x) => x.date === d.date);
          return {
            date: d.date,
            ui_sales: d.sales,
            db_sales: row?.sales ?? null,
            match: row ? row.sales === d.sales && row.orders === d.orders : false,
          };
        }),
        top_products_catalog_vs_actual: catalogTop,
        category_top_from_db: cats,
        sold_products_still_zero_cost: zeroCostSold[0],
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
