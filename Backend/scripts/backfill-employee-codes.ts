/**
 * One-off backfill after employee POS staff schema expansion:
 * - Sync status from is_active
 * - Generate EMP-XXXXXX codes where missing
 */
import { EmployeeStatus, PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function generateUniqueCode(used: Set<string>): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = `EMP-${Math.floor(100000 + Math.random() * 900000)}`;
    if (used.has(code)) continue;
    const exists = await prisma.employee.findUnique({
      where: { employee_code: code },
      select: { id: true },
    });
    if (!exists) {
      used.add(code);
      return code;
    }
  }
  throw new Error('Failed to generate unique employee code during backfill');
}

async function backfill() {
  console.log('Starting employee status + code backfill...\n');

  const statusActive = await prisma.employee.updateMany({
    where: { is_active: true, status: { not: EmployeeStatus.ACTIVE } },
    data: { status: EmployeeStatus.ACTIVE },
  });

  const statusInactive = await prisma.employee.updateMany({
    where: { is_active: false, status: { notIn: [EmployeeStatus.INACTIVE, EmployeeStatus.TERMINATED] } },
    data: { status: EmployeeStatus.INACTIVE },
  });

  console.log(`Status synced: ${statusActive.count} -> ACTIVE, ${statusInactive.count} -> INACTIVE`);

  const missingCodes = await prisma.employee.findMany({
    where: { OR: [{ employee_code: null }, { employee_code: '' }] },
    select: { id: true },
  });

  const used = new Set<string>();
  let coded = 0;
  for (const emp of missingCodes) {
    const code = await generateUniqueCode(used);
    await prisma.employee.update({
      where: { id: emp.id },
      data: { employee_code: code },
    });
    coded++;
  }

  console.log(`Employee codes generated: ${coded}`);
  console.log('Backfill complete.');
}

backfill()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
