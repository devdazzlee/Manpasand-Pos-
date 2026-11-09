import { prisma } from '../prisma/client';
import { AppError } from './apiError';

/**
 * New stock is received at the warehouse only. Branches get it by Transfer,
 * which keeps every purchase and its payment off the branch tills.
 */
export async function assertReceivesAtWarehouse(branchId: string) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { name: true, branch_type: true },
  });
  if (!branch) throw new AppError(404, 'Warehouse not found');
  if (branch.branch_type !== 'WAREHOUSE') {
    throw new AppError(400, `Stock In is received at the warehouse only. Send stock to ${branch.name} with a Transfer.`);
  }
}
