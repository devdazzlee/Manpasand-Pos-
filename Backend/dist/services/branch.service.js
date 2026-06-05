"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BranchService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const date_fns_1 = require("date-fns");
class BranchService {
    async createBranch(data) {
        // Codes follow `BRANCH-NNN` / `WAREHOUSE-NNN`. The previous
        // `parseInt(lastBranch.code)` against e.g. `BRANCH-004` returned NaN, so
        // generate the next number from rows matching the same prefix.
        const prefix = data.branch_type === 'WAREHOUSE' ? 'WAREHOUSE' : 'BRANCH';
        const siblings = await client_1.prisma.branch.findMany({
            where: { code: { startsWith: `${prefix}-` } },
            select: { code: true },
        });
        const maxN = siblings.reduce((acc, b) => {
            const n = parseInt(b.code.split('-')[1] || '', 10);
            return Number.isFinite(n) && n > acc ? n : acc;
        }, 0);
        const code = `${prefix}-${String(maxN + 1).padStart(3, '0')}`;
        const branch = await client_1.prisma.branch.create({
            data: {
                ...data,
                code,
            },
        });
        return branch;
    }
    async deleteBranch(id) {
        const branch = await client_1.prisma.branch.findUnique({ where: { id } });
        if (!branch)
            throw new apiError_1.AppError(404, 'Branch not found');
        await client_1.prisma.$transaction(async (tx) => {
            // Break return links before removing sales from this branch.
            await tx.sale.updateMany({
                where: { original_sale: { branch_id: id } },
                data: { original_sale_id: null },
            });
            await tx.saleItem.deleteMany({
                where: { sale: { branch_id: id } },
            });
            await tx.sale.deleteMany({ where: { branch_id: id } });
            await tx.holdSale.deleteMany({ where: { branch_id: id } });
            await tx.stockMovement.deleteMany({ where: { branch_id: id } });
            await tx.stockAdjustment.deleteMany({ where: { branch_id: id } });
            await tx.stock.deleteMany({ where: { branch_id: id } });
            await tx.purchaseOrderItem.deleteMany({
                where: { purchase_order: { branch_id: id } },
            });
            await tx.purchaseOrder.deleteMany({ where: { branch_id: id } });
            await tx.purchase.deleteMany({ where: { warehouse_branch_id: id } });
            await tx.transfer.deleteMany({
                where: { OR: [{ from_branch_id: id }, { to_branch_id: id }] },
            });
            await tx.orderItem.deleteMany({
                where: { order: { branch_id: id } },
            });
            await tx.order.deleteMany({ where: { branch_id: id } });
            await tx.expense.deleteMany({
                where: { cashflow: { branch_id: id } },
            });
            await tx.cashFlow.deleteMany({ where: { branch_id: id } });
            await tx.category.updateMany({
                where: { branch_id: id },
                data: { branch_id: null },
            });
            await tx.user.updateMany({
                where: { branch_id: id },
                data: { branch_id: null },
            });
            await tx.employee.updateMany({
                where: { branch_id: id },
                data: { branch_id: null },
            });
            await tx.branch.delete({ where: { id } });
        }, {
            maxWait: 30000,
            timeout: 120000,
        });
        return { message: 'Branch deleted successfully' };
    }
    async getBranchById(id) {
        const branch = await client_1.prisma.branch.findUnique({
            where: {
                id,
            },
        });
        if (!branch) {
            throw new apiError_1.AppError(404, 'Branch not found');
        }
        return branch;
    }
    async updateBranch(id, data) {
        const branch = await client_1.prisma.branch.findUnique({
            where: {
                id,
            },
        });
        if (!branch) {
            throw new apiError_1.AppError(404, 'Branch not found');
        }
        const updatedBranch = await client_1.prisma.branch.update({
            where: {
                id,
            },
            data,
        });
        return updatedBranch;
    }
    async toggleBranchStatus(id) {
        // Check if branch exists
        const branch = await client_1.prisma.branch.findUnique({ where: { id } });
        if (!branch) {
            throw new apiError_1.AppError(404, 'Branch not found');
        }
        // Toggle the is_active status
        const updatedBranch = await client_1.prisma.branch.update({
            where: { id },
            data: { is_active: !branch.is_active },
        });
        console.log('Updated Branch:', updatedBranch, 'is_active:', updatedBranch.is_active, branch);
        return updatedBranch;
    }
    async listBranches({ page = 1, limit = 10, search, is_active, fetch_all, }) {
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (is_active !== undefined) {
            where.is_active = is_active;
        }
        const take = fetch_all ? 1000 : limit;
        const skip = fetch_all ? 0 : (page - 1) * limit;
        const [total, branches] = await Promise.all([
            client_1.prisma.branch.count({ where }),
            client_1.prisma.branch.findMany({
                where,
                skip,
                take,
                orderBy: {
                    created_at: 'desc',
                },
            }),
        ]);
        return {
            data: branches,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async getBranchDetails(branchId) {
        const today = new Date();
        const branch = await client_1.prisma.branch.findUnique({
            where: { id: branchId },
            include: {
                employees: {
                    where: { is_active: true },
                    include: {
                        employee_type: true,
                    },
                },
                sales: {
                    where: {
                        sale_date: {
                            gte: (0, date_fns_1.startOfDay)(today),
                            lte: (0, date_fns_1.endOfDay)(today),
                        },
                    },
                    select: {
                        id: true,
                        sale_number: true,
                        total_amount: true,
                        sale_date: true,
                        payment_method: true,
                        status: true,
                    },
                },
            },
        });
        if (!branch) {
            throw new Error('Branch not found');
        }
        return branch;
    }
}
exports.BranchService = BranchService;
//# sourceMappingURL=branch.service.js.map