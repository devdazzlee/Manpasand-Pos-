import { prisma } from "../prisma/client";
import { Prisma } from "@prisma/client";

export class StatsService {
    private async totalCustomers(branchId?: string) {
        if (branchId) {
            // Customers aren't branch-owned in the schema, so "this branch's
            // customers" means distinct buyers who have a sale at this branch.
            const distinctBuyers = await prisma.sale.findMany({
                where: { branch_id: branchId, customer_id: { not: null } },
                distinct: ["customer_id"],
                select: { customer_id: true },
            });
            return distinctBuyers.length;
        }
        return prisma.customer.count();
    }

    private async newCustomersToday() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return prisma.customer.count({ where: { created_at: { gte: today } } });
    }

    private async lowStockProducts(branchId?: string) {
        const where: Prisma.StockWhereInput = {
            current_quantity: { lt: 10 },
            product: { is_active: true },
        };
        if (branchId) where.branch_id = branchId;

        const lowStock = await prisma.stock.findMany({
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

    private async todaySales(branchId?: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const where: Prisma.SaleWhereInput = { created_at: { gte: today } };
        if (branchId) where.branch_id = branchId;

        const sales = await prisma.sale.findMany({
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

    private async paymentBreakdownToday(branchId?: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const where: Prisma.SaleWhereInput = { created_at: { gte: today } };
        if (branchId) where.branch_id = branchId;

        const grouped = await prisma.sale.groupBy({
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

    public async getDashboardStats(branchId?: string) {
        const [totalCustomers, newCustomersToday, lowStockProducts, todaySales, paymentBreakdown, branch] =
            await Promise.all([
                this.totalCustomers(branchId),
                this.newCustomersToday(),
                this.lowStockProducts(branchId),
                this.todaySales(branchId),
                this.paymentBreakdownToday(branchId),
                branchId
                    ? prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } })
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
