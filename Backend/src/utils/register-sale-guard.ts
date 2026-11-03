import { prisma } from '../prisma/client';
import { AppError } from './apiError';
import { REQUIRE_OPEN_REGISTER_FOR_SALE } from '../config/pos-rules';

/** POS sales require an open, unlocked cash register for the branch. */
export async function assertCashRegisterOpenForSale(branchId: string): Promise<void> {
  if (!REQUIRE_OPEN_REGISTER_FOR_SALE) return;
  const session = await prisma.cashFlow.findFirst({
    where: { branch_id: branchId, status: 'OPEN' },
    select: { locked: true, locked_reason: true },
  });

  if (!session) {
    throw new AppError(
      423,
      'Cash register is not open. Open the cash register before creating a sale.',
    );
  }

  if (session.locked) {
    throw new AppError(
      423,
      `The register is locked (${session.locked_reason || 'cashier on break'}). Unlock it from Cash Register before billing.`,
    );
  }
}

/**
 * Warehouses store stock and transfer it to shops; they don't bill customers.
 * New sales (and held bills) are only allowed at active shop branches.
 * Returns / exchanges of older warehouse sales are not blocked, so history
 * can still be corrected.
 */
export function assertBranchCanSell(branch: {
  name: string;
  branch_type?: string | null;
  is_active?: boolean | null;
}): void {
  if (branch.branch_type === 'WAREHOUSE') {
    throw new AppError(400, `${branch.name} is a warehouse — sales can only be made at a shop branch.`);
  }
  if (branch.is_active === false) {
    throw new AppError(400, `${branch.name} is inactive — reactivate it before billing.`);
  }
}
