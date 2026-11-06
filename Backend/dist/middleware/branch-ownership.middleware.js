"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.branchOwnershipParam = void 0;
const apiError_1 = require("../utils/apiError");
const auth_middleware_1 = require("./auth.middleware");
/**
 * Object-level branch authorization (the "IDOR" check).
 *
 * The auth middleware pins list/query requests to the user's branch, but a
 * request that names a record by id (`/sale/:saleId`) bypasses any list
 * filter. This guard loads the record's branch(es) and rejects the request
 * when a branch-bound user (branch manager / supervisor / cashier) touches a
 * record that doesn't belong to their branch. Admins and cross-branch roles
 * (warehouse, purchase) are unaffected.
 *
 * A missing record is passed through so the handler returns its normal 404.
 * A foreign record also answers 404 — not 403 — so ids from other branches
 * can't be probed for existence.
 *
 * Usage: `router.param('saleId', branchOwnershipParam(id => prisma.sale.findUnique(...).then(s => s && [s.branch_id])))`
 */
const branchOwnershipParam = (loadBranchIds) => async (req, _res, next, id) => {
    try {
        if (!(0, auth_middleware_1.isBranchLockedRole)(req.user?.role))
            return next();
        const userBranch = req.user?.branch_id;
        const branchIds = await loadBranchIds(id);
        if (!branchIds)
            return next();
        if (!userBranch || !branchIds.includes(userBranch)) {
            throw new apiError_1.AppError(404, 'Record not found');
        }
        next();
    }
    catch (err) {
        next(err);
    }
};
exports.branchOwnershipParam = branchOwnershipParam;
//# sourceMappingURL=branch-ownership.middleware.js.map