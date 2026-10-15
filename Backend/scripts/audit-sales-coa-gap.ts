import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const salesAcc = await prisma.transactionalAccount.findFirst({ where: { code: '4110001' } });
  if (!salesAcc) {
    console.log('no sales account');
    return;
  }
  const lines = await prisma.journalVoucherLine.findMany({
    where: { account_id: salesAcc.id },
    select: {
      debit: true,
      credit: true,
      description: true,
      voucher: { select: { voucher_date: true, voucher_no: true, narration: true } },
    },
  });
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    debit += Number(l.debit);
    credit += Number(l.credit);
  }

  // Opening side CREDIT means sales opening reduces debit-positive balance
  const openingSigned =
    salesAcc.opening_side === 'CREDIT'
      ? -Number(salesAcc.opening_balance)
      : Number(salesAcc.opening_balance);

  console.log(
    JSON.stringify(
      {
        account: salesAcc.name,
        system_key: salesAcc.system_key,
        opening_balance: Number(salesAcc.opening_balance),
        opening_side: salesAcc.opening_side,
        opening_as_debit_minus_credit: openingSigned,
        journal_lines: lines.length,
        journal_debit: debit,
        journal_credit: credit,
        net_from_journals_credit_minus_debit: credit - debit,
        natural_sales_including_opening: -(openingSigned + debit - credit),
        bill_total: 1006094,
        coa_net_sales_ui: 966559,
        gap: 1006094 - 966559,
        note: 'COA builds sales from live Sale rows in collectEntries, not only JournalVoucherLine',
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
