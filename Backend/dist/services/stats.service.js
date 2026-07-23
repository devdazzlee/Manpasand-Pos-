"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatsService = void 0;
const client_1 = require("../prisma/client");
class StatsService {
    async totalCustomers(branchId) {
        if (branchId) {
            // Customers aren't branch-owned in the schema, so "this branch's
            // customers" means distinct buyers who have a sale at this branch.
            const distinctBuyers = await client_1.prisma.sale.findMany({
                where: { branch_id: branchId, customer_id: { not: null } },
                distinct: ["customer_id"],
                select: { customer_id: true },
            });
            return distinctBuyers.length;
        }
        return client_1.prisma.customer.count();
    }
    async newCustomersToday() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return client_1.prisma.customer.count({ where: { created_at: { gte: today } } });
    }
    async lowStockProducts(branchId) {
        const where = {
            current_quantity: { lt: 10 },
            product: { is_active: true },
        };
        if (branchId)
            where.branch_id = branchId;
        const lowStock = await client_1.prisma.stock.findMany({
            where,
            select: {
                id: true,
                current_quantity: true,
                product_id: true,
                product: {
                    select: {
                        name: true,
                        sku: true,
                        is_active: true,
                    },
                },
                branch: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { current_quantity: "asc" },
        });
        return lowStock;
    }
    async todaySales(branchId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const where = { created_at: { gte: today } };
        if (branchId)
            where.branch_id = branchId;
        const sales = await client_1.prisma.sale.findMany({
            where,
            select: {
                id: true,
                total_amount: true,
                sale_number: true,
                status: true,
                created_at: true,
                branch: { select: { id: true, name: true } },
            },
            orderBy: { created_at: "desc" },
        });
        return sales;
    }
    async paymentBreakdownToday(branchId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const where = { created_at: { gte: today } };
        if (branchId)
            where.branch_id = branchId;
        const grouped = await client_1.prisma.sale.groupBy({
            by: ["payment_method"],
            where,
            _sum: { total_amount: true },
            _count: { id: true },
        });
        return grouped.map((g) => ({
            method: g.payment_method,
            total: Number(g._sum.total_amount || 0),
            count: g._count.id,
        }));
    }
    async getDashboardStats(branchId) {
        const [totalCustomers, newCustomersToday, lowStockProducts, todaySales, paymentBreakdown, branch] = await Promise.all([
            this.totalCustomers(branchId),
            this.newCustomersToday(),
            this.lowStockProducts(branchId),
            this.todaySales(branchId),
            this.paymentBreakdownToday(branchId),
            branchId
                ? client_1.prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } })
                : Promise.resolve(null),
        ]);
        const todaySalesTotal = todaySales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
        return {
            branch,
            isAllBranches: !branchId,
            totalCustomers,
            newCustomersToday,
            lowStockProducts,
            lowStockCount: lowStockProducts.length,
            todaySales,
            todaySalesCount: todaySales.length,
            todaySalesTotal,
            paymentBreakdown,
        };
    }
}
exports.StatsService = StatsService;
//# sourceMappingURL=stats.service.js.map