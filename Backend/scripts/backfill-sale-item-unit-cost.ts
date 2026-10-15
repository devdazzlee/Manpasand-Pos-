/**
 * Freeze historical COGS on SaleItem.unit_cost.
 *
 * For each line missing unit_cost (null), or with --include-zero also unit_cost = 0
 * when a real cost is available:
 *   1) Prefer latest Purchase.cost_price (> 0) on/before the sale date
 *   2) Else product.purchase_rate (> 0)
 *
 *   npx ts-node --transpile-only scripts/backfill-sale-item-unit-cost.ts
 *   npx ts-node --transpile-only scripts/backfill-sale-item-unit-cost.ts --include-zero
 *   npx ts-node --transpile-only scripts/backfill-sale-item-unit-cost.ts --include-zero --dry-run
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const includeZero = process.argv.includes('--include-zero');
const BATCH = 500;

async function main() {
  const where = includeZero
    ? {
        OR: [{ unit_cost: null }, { unit_cost: 0 }],
      }
    : { unit_cost: null };

  const totalCandidates = await prisma.saleItem.count({ where });
  console.log(
    `Sale lines to check: ${totalCandidates}` +
      `${includeZero ? ' (null + zero)' : ' (null only)'}` +
      `${dryRun ? ' [dry-run]' : ''}`,
  );

  let updated = 0;
  let skipped = 0;
  const unfillable = new Set<string>();

  // Re-query each batch (no cursor): updating 0 → cost removes rows from `where`.
  for (;;) {
    const rows = await prisma.saleItem.findMany({
      where: {
        ...where,
        ...(unfillable.size
          ? { id: { notIn: [...unfillable] } }
          : {}),
      },
      take: BATCH,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        product_id: true,
        unit_cost: true,
        sale: { select: { sale_date: true } },
        product: { select: { purchase_rate: true, name: true } },
      },
    });
    if (!rows.length) break;

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
    let batchUpdated = 0;
    for (const row of rows) {
      const saleDate = row.sale.sale_date;
      const history = byProduct.get(row.product_id) || [];
      let cost: number | null = null;
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].at <= saleDate && history[i].cost > 0) {
          cost = history[i].cost;
          break;
        }
      }
      if (cost == null || !(cost > 0)) {
        const rate = Number(row.product.purchase_rate) || 0;
        cost = rate > 0 ? rate : null;
      }
      if (cost == null || !(cost > 0)) {
        unfillable.add(row.id);
        skipped += 1;
        continue;
      }
      // Don't rewrite a positive frozen cost
      const existing = row.unit_cost != null ? Number(row.unit_cost) : null;
      if (existing != null && existing > 0) {
        unfillable.add(row.id);
        skipped += 1;
        continue;
      }

      if (!dryRun) {
        ops.push(
          prisma.saleItem.update({
            where: { id: row.id },
            data: { unit_cost: cost },
          }),
        );
      }
      updated += 1;
      batchUpdated += 1;
      console.log(
        `  ${dryRun ? 'would set' : 'set'} ${row.product.name?.slice(0, 50)} → ${cost}`,
      );
    }
    if (ops.length) await prisma.$transaction(ops);
    if (dryRun && batchUpdated === 0) break;
    if (dryRun) break; // dry-run: one batch is enough to preview
  }

  console.log(
    dryRun
      ? `Would update ${updated} lines (skipped ${skipped})`
      : `Updated ${updated} lines (skipped ${skipped})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
