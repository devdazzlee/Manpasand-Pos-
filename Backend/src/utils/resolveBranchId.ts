import { Request } from 'express';

/**
 * Resolves which branch a request should be scoped to.
 * - SUPER_ADMIN / ADMIN: can pass ?branchId= (or body.branchId) to view a single
 *   branch; omit it to see all branches (returns undefined).
 * - Everyone else: always forced to their own JWT branch_id, regardless of
 *   any branchId they try to pass, so a branch user can never read another
 *   branch's data.
 */
export const resolveBranchId = (req: Request): string | undefined => {
  const jwtBranchId = req.user?.branch_id as string | undefined;
  const userRole = req.user?.role;

  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
    const queryBranchId = req.query.branchId as string | undefined;
    const bodyBranchId = req.body?.branchId as string | undefined;

    if (queryBranchId && queryBranchId.trim() && queryBranchId !== 'Not Found') {
      return queryBranchId.trim();
    }
    if (bodyBranchId && bodyBranchId.trim() && bodyBranchId !== 'Not Found') {
      return bodyBranchId.trim();
    }
    return undefined;
  }

  if (jwtBranchId && jwtBranchId.trim() && jwtBranchId !== 'Not Found') {
    return jwtBranchId.trim();
  }

  return undefined;
};

export const isAdminRole = (role?: string) => role === 'SUPER_ADMIN' || role === 'ADMIN';
