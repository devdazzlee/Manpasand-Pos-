"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertCashRegisterOpenForSale = assertCashRegisterOpenForSale;
exports.assertBranchCanSell = assertBranchCanSell;
const client_1 = require("../prisma/client");
const apiError_1 = require("./apiError");
const pos_rules_1 = require("../config/pos-rules");
/** POS sales require an open, unlocked cash register for the branch. */
async function assertCashRegisterOpenForSale(branchId) {
    if (!pos_rules_1.REQUIRE_OPEN_REGISTER_FOR_SALE)
        return;
    const session = await client_1.prisma.cashFlow.findFirst({
        where: { branch_id: branchId, status: 'OPEN' },
        select: { locked: true, locked_reason: true },
    });
    if (!session) {
        throw new apiError_1.AppError(423, 'Cash register is not open. Open the cash register before creating a sale.');
    }
    if (session.locked) {
        throw new apiError_1.AppError(423, `The register is locked (${session.locked_reason || 'cashier on break'}). Unlock it from Cash Register before billing.`);
    }
}
/**
 * Warehouses store stock and transfer it to shops; they don't bill customers.
 * New sales (and held bills) are only allowed at active shop branches.
 * Returns / exchanges of older warehouse sales are not blocked, so history
 * can still be corrected.
 */
function assertBranchCanSell(branch) {
    if (branch.branch_type === 'WAREHOUSE') {
        throw new apiError_1.AppError(400, `${branch.name} is a warehouse — sales can only be made at a shop branch.`);
    }
    if (branch.is_active === false) {
        throw new apiError_1.AppError(400, `${branch.name} is inactive — reactivate it before billing.`);
    }
}
//# sourceMappingURL=register-sale-guard.js.map