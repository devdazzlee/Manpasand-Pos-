/**
 * Audit Purchase Report totals vs DB (period matching UI: 16 Sep – 15 Oct 2026 business days).
 *   npx ts-node --transpile-only scripts/audit-purchase-report.ts
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
    netPurchases: 1496300,
    vouchers: 5,
    netQty: 202,
    items: 81,
    vendors: 2,
    returns: 0,
    araast: 1351000,
    pehnawa: 145300,
  };

  const purchases = await prisma.purchase.findMany({
    where: { purchase_date: { gte: start, lte: end } },
    select: {
      id: true,
      quantity: true,
      cost_price: true,
      sale_price: true,
      bill_group_id: true,
      invoice_ref: true,
      product_id: true,
      supplier: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, purchase_rate: true } },
    },
  });

  // Returns — check schema field names
  let returnsAmount = 0;
  let returnsQty = 0;
  let returnLines = 0;
  try {
    const returns = await prisma.purchaseReturn.findMany({
      where: { return_date: { gte: start, lte: end } },
      select: {
        id: true,
        items: {
          select: { quantity: true, unit_cost: true },
        },
      },
    });
    for (const r of returns) {
      returnLines += r.items.length;
      for (const it of r.items) {
        const q = Math.abs(num(it.quantity));
        returnsQty += q;
        returnsAmount += q * num(it.unit_cost);
      }
    }
  } catch {
    // fallback if relation name differs
  }

  let amount = 0;
  let qty = 0;
  let zeroCostLines = 0;
  let costEqSale = 0;
  const byVendor = new Map<string, { name: string; amount: number; qty: number; vouchers: Set<string> }>();
  const byProduct = new Map<string, { name: string; amount: number; qty: number }>();
  const vouchers = new Set<string>();

  for (const p of purchases) {
    const q = num(p.quantity);
    const rate = num(p.cost_price);
    const line = q * rate;
    amount += line;
    qty += q;
    if (rate <= 1) zeroCostLines++;
    if (num(p.sale_price) > 0 && Math.abs(rate - num(p.sale_price)) < 0.01) costEqSale++;

    const vKey = p.bill_group_id || p.invoice_ref || p.id;
    vouchers.add(vKey);

    const sName = p.supplier?.name || 'No supplier';
    const sId = p.supplier?.id || 'none';
    const v = byVendor.get(sId) || { name: sName, amount: 0, qty: 0, vouchers: new Set() };
    v.amount += line;
    v.qty += q;
    v.vouchers.add(vKey);
    byVendor.set(sId, v);

    const prod = byProduct.get(p.product_id) || {
      name: (p.product?.name || 'Unknown').slice(0, 60),
      amount: 0,
      qty: 0,
    };
    prod.amount += line;
    prod.qty += q;
    byProduct.set(p.product_id, prod);
  }

  const vendors = [...byVendor.values()]
    .map((v) => ({
      name: v.name,
      amount: r2(v.amount),
      qty: r2(v.qty),
      vouchers: v.vouchers.size,
    }))
    .sort((a, b) => b.amount - a.amount);

  const topItems = [...byProduct.values()]
    .map((p) => ({ name: p.name, amount: r2(p.amount), qty: r2(p.qty) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  const net = amount - returnsAmount;

  console.log(
    JSON.stringify(
      {
        period: { from, to, start: start.toISOString(), end: end.toISOString() },
        how_calculated:
          'Purchase Report = Purchase.quantity × Purchase.cost_price (buy cost on the bill). Not sale profit. Not Product.purchase_rate for past bills.',
        db: {
          lines: purchases.length,
          amount: r2(amount),
          qty: r2(qty),
          vouchers: vouchers.size,
          vendors: vendors.length,
          returnsAmount: r2(returnsAmount),
          returnsQty: r2(returnsQty),
          returnLines,
          netPurchases: r2(net),
          avgVoucher: vouchers.size ? r2(net / vouchers.size) : 0,
        },
        vs_ui: {
          net_matches: Math.abs(r2(net) - ui.netPurchases) < 1,
          qty_matches: Math.abs(r2(qty) - ui.netQty) < 0.01,
          lines_matches: purchases.length === ui.items,
          vouchers_matches: vouchers.size === ui.vouchers,
          vendors_matches: vendors.length === ui.vendors,
          returns_matches: Math.abs(r2(returnsAmount) - ui.returns) < 1,
          araast_matches: Math.abs((vendors.find((v) => /araast/i.test(v.name))?.amount || 0) - ui.araast) < 1,
          pehnawa_matches: Math.abs((vendors.find((v) => /pehnawa/i.test(v.name))?.amount || 0) - ui.pehnawa) < 1,
        },
        vendors,
        topItems,
        zero_cost_on_purchase_bills: {
          lines_with_cost_le_1: zeroCostLines,
          lines_where_cost_equals_sale_price: costEqSale,
          verdict:
            zeroCostLines === 0
              ? 'No purchase lines at 0/1 cost — report amounts use bill cost_price (your purchase costs)'
              : 'Some purchase lines still have cost ≤ 1',
        },
        note_about_sale_zero_cost:
          'Purchase Report is buying stock. Old “sold at 0 cost” does not change these numbers. Sale profit is on Product Sales / Financial Statement / Business Insights.',
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
