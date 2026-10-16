"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = void 0;
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
const timezone_1 = require("../utils/timezone");
const SOLD = {
    notIn: [client_2.SaleStatus.CANCELLED, client_2.SaleStatus.PENDING],
};
class ReportsService {
    saleScope(q) {
        const where = { status: SOLD };
        if (q.userRole !== 'ADMIN' && q.userRole !== 'SUPER_ADMIN' && q.branchId) {
            where.branch_id = q.branchId;
        }
        if (q.from && q.to) {
            const { start, end } = (0, timezone_1.localRange)(q.from, q.to);
            where.sale_date = { gte: start, lte: end };
        }
        return where;
    }
    previousRange(from, to) {
        const start = new Date(`${from}T12:00:00Z`);
        const end = new Date(`${to}T12:00:00Z`);
        const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
        const prevTo = (0, timezone_1.shiftBusinessYmd)(from, -1);
        const prevFrom = (0, timezone_1.shiftBusinessYmd)(prevTo, -(days - 1));
        return { from: prevFrom, to: prevTo };
    }
    /**
     * Get all sales for reports (admin sees all, branch users see only their branch)
     */
    async getSalesForReports(q) {
        return client_1.prisma.sale.findMany({
            where: this.saleScope(q),
            include: {
                sale_items: {
                    include: {
                        product: {
                            include: {
                                category: true,
                            },
                        },
                    },
                },
                customer: true,
                user: { select: { id: true, name: true, email: true, employee: { select: { id: true, name: true } } } },
                salesperson: { select: { id: true, name: true } },
            },
            orderBy: { sale_date: 'desc' },
        });
    }
    /**
     * Get best selling products (ranked by qty; revenue from actual line totals)
     */
    async getBestSellingProducts(q) {
        const isAdmin = q.userRole === 'ADMIN' || q.userRole === 'SUPER_ADMIN';
        const saleFilter = this.saleScope(q);
        const where = { sale: saleFilter };
        const limit = q.limit ?? 10;
        const products = await client_1.prisma.saleItem.groupBy({
            by: ['product_id'],
            where,
            _sum: {
                quantity: true,
                line_total: true,
            },
            _count: {
                id: true,
            },
            orderBy: {
                _sum: {
                    quantity: 'desc',
                },
            },
            take: limit,
        });
        const productIds = products.map((p) => p.product_id);
        const productDetails = await client_1.prisma.product.findMany({
            where: { id: { in: productIds } },
            include: { category: true },
        });
        let topBranchByProduct = new Map();
        if (isAdmin && !q.branchId && productIds.length > 0) {
            const itemsWithBranch = await client_1.prisma.saleItem.findMany({
                where: { product_id: { in: productIds }, sale: saleFilter },
                select: {
                    product_id: true,
                    quantity: true,
                    sale: { select: { branch_id: true, branch: { select: { id: true, name: true } } } },
                },
            });
            const tally = new Map();
            for (const item of itemsWithBranch) {
                const branch = item.sale?.branch;
                if (!branch)
                    continue;
                if (!tally.has(item.product_id))
                    tally.set(item.product_id, new Map());
                const perBranch = tally.get(item.product_id);
                const existing = perBranch.get(branch.id);
                const qty = Number(item.quantity || 0);
                if (existing)
                    existing.quantity += qty;
                else
                    perBranch.set(branch.id, { id: branch.id, name: branch.name, quantity: qty });
            }
            for (const [productId, perBranch] of tally.entries()) {
                const top = [...perBranch.values()].sort((a, b) => b.quantity - a.quantity)[0];
                if (top)
                    topBranchByProduct.set(productId, top);
            }
        }
        return products.map((item) => {
            const product = productDetails.find((p) => p.id === item.product_id);
            const quantitySold = Number(item._sum.quantity || 0);
            const revenue = Number(item._sum.line_total || 0);
            const catalogPrice = Number(product?.sales_rate_inc_dis_and_tax || product?.sales_rate_exc_dis_and_tax || 0);
            return {
                id: item.product_id,
                name: product?.name || 'Unknown',
                sku: product?.sku || '',
                quantity_sold: quantitySold,
                order_count: item._count.id,
                revenue,
                price: catalogPrice,
                category: product?.category?.name || 'Uncategorized',
                topBranch: topBranchByProduct.get(item.product_id) || null,
            };
        });
    }
    /**
     * Cashier / salesperson performance for the period.
     * Prefers salesperson (commission credit), else linked employee on cashier, else user name.
     */
    async getEmployeePerformance(q) {
        const sales = await client_1.prisma.sale.findMany({
            where: this.saleScope(q),
            select: {
                total_amount: true,
                salesperson: { select: { id: true, name: true } },
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        employee: { select: { id: true, name: true } },
                    },
                },
            },
        });
        const map = new Map();
        for (const sale of sales) {
            const salesperson = sale.salesperson;
            const user = sale.user;
            const id = salesperson?.id || user?.employee?.id || user?.id || 'unknown';
            const name = salesperson?.name ||
                user?.employee?.name ||
                user?.name ||
                user?.email ||
                'Unknown cashier';
            const row = map.get(id) || { id, name, sales: 0, orders: 0 };
            row.sales += Number(sale.total_amount || 0);
            row.orders += 1;
            map.set(id, row);
        }
        return [...map.values()]
            .map((r) => ({
            id: r.id,
            name: r.name,
            sales: Math.round((r.sales + Number.EPSILON) * 100) / 100,
            orders: r.orders,
            avgOrder: r.orders > 0 ? Math.round((r.sales / r.orders + Number.EPSILON) * 100) / 100 : 0,
        }))
            .sort((a, b) => b.sales - a.sales);
    }
    /**
     * Get dashboard stats for reports (+ vs previous equal-length period)
     */
    async getReportsStats(q) {
        const where = this.saleScope(q);
        const [totalSales, totalRevenue, uniqueCustomers] = await Promise.all([
            client_1.prisma.sale.count({ where }),
            client_1.prisma.sale.aggregate({
                where,
                _sum: { total_amount: true },
            }),
            client_1.prisma.sale.findMany({
                where,
                select: { customer_id: true },
                distinct: ['customer_id'],
            }),
        ]);
        const revenue = Number(totalRevenue._sum.total_amount || 0);
        const customers = uniqueCustomers.filter((c) => c.customer_id).length;
        const avgOrder = totalSales > 0 ? revenue / totalSales : 0;
        let changes = {
            revenueChange: 0,
            ordersChange: 0,
            avgOrderChange: 0,
            customersChange: 0,
        };
        if (q.from && q.to) {
            const prev = this.previousRange(q.from, q.to);
            const prevWhere = this.saleScope({ ...q, from: prev.from, to: prev.to });
            const [prevSales, prevRevAgg, prevCust] = await Promise.all([
                client_1.prisma.sale.count({ where: prevWhere }),
                client_1.prisma.sale.aggregate({ where: prevWhere, _sum: { total_amount: true } }),
                client_1.prisma.sale.findMany({
                    where: prevWhere,
                    select: { customer_id: true },
                    distinct: ['customer_id'],
                }),
            ]);
            const prevRevenue = Number(prevRevAgg._sum.total_amount || 0);
            const prevCustomers = prevCust.filter((c) => c.customer_id).length;
            const prevAvg = prevSales > 0 ? prevRevenue / prevSales : 0;
            const pct = (cur, old) => old === 0 ? (cur > 0 ? 100 : 0) : ((cur - old) / old) * 100;
            changes = {
                revenueChange: Math.round(pct(revenue, prevRevenue) * 10) / 10,
                ordersChange: Math.round(pct(totalSales, prevSales) * 10) / 10,
                avgOrderChange: Math.round(pct(avgOrder, prevAvg) * 10) / 10,
                customersChange: Math.round(pct(customers, prevCustomers) * 10) / 10,
            };
        }
        return {
            totalSales,
            totalRevenue: revenue,
            uniqueCustomers: customers,
            ...changes,
            period: q.from && q.to ? { from: q.from, to: q.to } : null,
        };
    }
}
exports.ReportsService = ReportsService;
//# sourceMappingURL=reports.service.js.map