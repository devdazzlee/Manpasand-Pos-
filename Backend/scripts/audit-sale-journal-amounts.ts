import { PrismaClient, SaleStatus } from '@prisma/client';

const prisma = new PrismaClient();
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

async function main() {
  const sales = await prisma.sale.findMany({
    where: { status: { notIn: [SaleStatus.CANCELLED, SaleStatus.PENDING] } },
    select: {
      id: true,
      sale_number: true,
      total_amount: true,
      payment_received: true,
      discount_amount: true,
      subtotal: true,
      payments: { select: { amount: true, method: true } },
    },
    orderBy: { sale_date: 'asc' },
  });

  const salesAcc = await prisma.transactionalAccount.findFirst({ where: { code: '4110001' } });
  const lines = salesAcc
    ? await prisma.journalVoucherLine.findMany({
        where: { account_id: salesAcc.id },
        select: {
          credit: true,
          description: true,
          voucher: { select: { voucher_no: true, reference: true, narration: true } },
        },
      })
    : [];

  let sumTotal = 0;
  let sumReceived = 0;
  let sumPayments = 0;
  const mismatches: any[] = [];

  for (const s of sales) {
    const total = Number(s.total_amount) || 0;
    const received = Number(s.payment_received) || 0;
    const paySum = s.payments.reduce((t, p) => t + (Number(p.amount) || 0), 0);
    sumTotal += total;
    sumReceived += received;
    sumPayments += paySum;

    // Match journal by SALE:id or sale number in reference/description
    const j = lines.find(
      (l) =>
        (l.voucher.reference || '').includes(s.id) ||
        (l.voucher.reference || '').includes(s.sale_number || '') ||
        (l.description || '').includes(s.sale_number || '') ||
        (l.voucher.narration || '').includes(s.sale_number || ''),
    );
    const journalCredit = j ? Number(j.credit) : null;
    if (journalCredit != null && Math.abs(journalCredit - total) > 0.5) {
      mismatches.push({
        sale: s.sale_number,
        total,
        received,
        paySum,
        journalCredit,
        diff: r2(total - journalCredit),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        counts: { sales: sales.length, salesJournalLines: lines.length },
        sums: {
          total_amount: r2(sumTotal),
          payment_received: r2(sumReceived),
          sale_payments: r2(sumPayments),
          journal_credits: r2(lines.reduce((t, l) => t + Number(l.credit), 0)),
        },
        mismatches_count: mismatches.length,
        mismatches_sample: mismatches.slice(0, 15),
        mismatch_total_diff: r2(mismatches.reduce((t, m) => t + m.diff, 0)),
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
