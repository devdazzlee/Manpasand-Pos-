/**
 * Fix sale lines where frozen unit_cost is wrong after costs were filled later:
 *  - unit_cost null / 0 / 1 (placeholder)
 *  - unit_cost equals unit_price (0% margin) while product.purchase_rate differs
 *
 * Prefer Purchase.cost_price on/before sale date, else product.purchase_rate.
 *
 *   npx ts-node --transpile-only scripts/fix-sale-item-bad-costs.ts
 *   npx ts-node --transpile-only scripts/fix-sale-item-bad-costs.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      product_id: string;
      name: string;
      rate: number;
      old_cost: number;
      price: number;
      sale_date: Date;
    }>
  >(`
    SELECT si.id, si.product_id, pr.name,
           pr.purchase_rate::float AS rate,
           si.unit_cost::float AS old_cost,
           si.unit_price::float AS price,
           s.sale_date
    FROM "SaleItem" si
    JOIN "Product" pr ON pr.id = si.product_id
    JOIN "Sale" s ON s.id = si.sale_id
    WHERE COALESCE(pr.purchase_rate, 0) > 1
      AND (
        si.unit_cost IS NULL
        OR si.unit_cost <= 1
        OR (
          ABS(si.unit_cost - si.unit_price) < 0.01
          AND ABS(pr.purchase_rate - si.unit_price) >= 1
        )
      )
    ORDER BY pr.name
  `);

  console.log(`Candidates: ${rows.length}${dryRun ? ' (dry-run)' : ''}`);

  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const purchases = await prisma.purchase.findMany({
    where: { product_id: { in: productIds } },
    select: { product_id: true, cost_price: true, purchase_date: true },
    orderBy: { purchase_date: 'asc' },
  });
  const byProduct = new Map<string, { cost: number; at: Date }[]>();
  for (const p of purchases) {
    const list = byProduct.get(p.product_id) ?? [];
    list.push({ cost: Number(p.cost_price) || 0, at: p.purchase_date });
    byProduct.set(p.product_id, list);
  }

  const ops = [];
  let updated = 0;
  for (const row of rows) {
    const history = byProduct.get(row.product_id) || [];
    let cost: number | null = null;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].at <= new Date(row.sale_date) && history[i].cost > 1) {
        cost = history[i].cost;
        break;
      }
    }
    if (cost == null || !(cost > 1)) cost = Number(row.rate) || 0;
    if (!(cost > 1)) continue;
    if (Math.abs(cost - Number(row.old_cost || 0)) < 0.005) continue;

    console.log(
      `  ${String(row.name).slice(0, 48)}: ${row.old_cost} → ${cost}`,
    );
    if (!dryRun) {
      ops.push(
        prisma.saleItem.update({
          where: { id: row.id },
          data: { unit_cost: cost },
        }),
      );
    }
    updated += 1;
  }

  if (ops.length) await prisma.$transaction(ops);

  const after = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE si.unit_cost <= 1)::int AS tiny,
      COUNT(*) FILTER (WHERE ABS(si.unit_cost - si.unit_price) < 0.01)::int AS eq_price,
      ROUND(SUM(si.quantity * COALESCE(si.unit_cost, 0))::numeric, 2) AS total_cogs
    FROM "SaleItem" si
  `);

  console.log(dryRun ? `Would update ${updated}` : `Updated ${updated}`);
  console.log('Snapshot:', after[0]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
