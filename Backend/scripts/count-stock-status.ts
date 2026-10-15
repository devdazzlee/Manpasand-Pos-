import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const num = (v: unknown) => Number(v ?? 0);

async function main() {
  const stocks = await prisma.stock.findMany({
    select: {
      current_quantity: true,
      minimum_quantity: true,
      product: { select: { min_qty: true, is_active: true, purchase_rate: true } },
    },
  });
  let zero = 0;
  let negative = 0;
  let low = 0;
  let healthy = 0;
  let worth = 0;
  let available = 0;
  for (const s of stocks) {
    if (!s.product?.is_active) continue;
    const qty = num(s.current_quantity);
    const minQty = num(s.product.min_qty) || num(s.minimum_quantity);
    available += qty;
    if (qty > 0) worth += qty * num(s.product.purchase_rate);
    if (qty < 0) negative++;
    else if (qty === 0) zero++;
    else if (minQty > 0 && qty <= minQty) low++;
    else healthy++;
  }
  process.stdout.write(
    JSON.stringify(
      {
        rows: stocks.length,
        available,
        worth: Math.round(worth * 100) / 100,
        zero,
        negative,
        out_le0: zero + negative,
        low,
        healthy,
        sum: zero + negative + low + healthy,
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
