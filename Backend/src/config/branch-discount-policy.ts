/**
 * Branch-level automatic bill discounts.
 *
 * Keyed by stable Branch.id (UUID). Branch APIs attach this as `pos_policy`
 * so the till can preview totals — enforcement stays in createSale.
 *
 * Applied server-side in SaleService.createSale so cashiers without
 * sales.discount, offline sync, and API clients all get the same rule.
 * The till UI only mirrors this for the cart total preview.
 */
export type BranchAutoDiscount = {
  /** Percent of subtotal (0–100). */
  percent: number;
  /** Human label for receipts / applied_promotions audit. */
  label: string;
};

/** Dhoraji opening branch — 15% on every sale. */
export const DHORAJI_BRANCH_ID = 'a99ed730-a6eb-4cb7-af44-2e2bf09bba5f';

export const BRANCH_AUTO_DISCOUNT: Readonly<Record<string, BranchAutoDiscount>> = {
  [DHORAJI_BRANCH_ID]: { percent: 15, label: 'Dhoraji' },
};

export function getBranchAutoDiscount(
  branchId: string | null | undefined,
): BranchAutoDiscount | null {
  if (!branchId) return null;
  return BRANCH_AUTO_DISCOUNT[branchId] ?? null;
}

/** Rupee amount for the branch floor discount (2 d.p.). */
export function branchAutoDiscountAmount(
  branchId: string | null | undefined,
  subtotal: number,
): number {
  const policy = getBranchAutoDiscount(branchId);
  if (!policy || policy.percent <= 0 || subtotal <= 0) return 0;
  return Math.round(((subtotal * policy.percent) / 100 + Number.EPSILON) * 100) / 100;
}
