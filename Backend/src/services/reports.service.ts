import { prisma } from '../prisma/client';
import { Prisma, SaleStatus } from '@prisma/client';
import { localRange, shiftBusinessYmd } from '../utils/timezone';
import { ProductFilters, hasProductFilters, productFilterWhere } from '../utils/product-filters';

const SOLD: Prisma.EnumSaleStatusFilter = {
  notIn: [SaleStatus.CANCELLED, SaleStatus.PENDING],
};

export type ReportsQuery = {
  branchId?: string;
  userRole?: string;
  from?: string;
  to?: string;
  /** Vendor / category / subcategory / stitch: orders that contain such items. */
  filters?: ProductFilters;
};

export class ReportsService {
  private saleScope(q: ReportsQuery): Prisma.SaleWhereInput {
    const where: Prisma.SaleWhereInput = { status: SOLD };
    if (q.userRole !== 'ADMIN' && q.userRole !== 'SUPER_ADMIN' && q.branchId) {
      where.branch_id = q.branchId;
    }
    if (q.from && q.to) {
      const { start, end } = localRange(q.from, q.to);
      where.sale_date = { gte: start, lte: end };
    }
    const itemWhere = this.itemScope(q);
    if (itemWhere) where.sale_items = { some: itemWhere };
    return where;
  }

  /** Sale-line filter for the catalog filters, or undefined when none are set. */
  private itemScope(q: ReportsQuery): Prisma.SaleItemWhereInput | undefined {
    return hasProductFilters(q.filters) ? { product: productFilterWhere(q.filters) } : undefined;
  }

  /** Per-sale amount: the whole bill, or only the matching lines when filtered. */
  private async amountsBySale(q: ReportsQuery, where: Prisma.SaleWhereInput) {
    const itemWhere = this.itemScope(q);
    if (!itemWhere) return null;
    const rows = await prisma.saleItem.groupBy({
      by: ['sale_id'],
      where: { ...itemWhere, sale: where },
      _sum: { line_total: true },
    });
    return new Map(rows.map((r) => [r.sale_id, Number(r._sum.line_total || 0)]));
  }

  /** Bill totals normally; with catalog filters, only the matching lines count. */
  private async revenueFor(q: ReportsQuery, where: Prisma.SaleWhereInput, billTotal: number) {
    const itemWhere = this.itemScope(q);
    if (!itemWhere) return billTotal;
    const agg = await prisma.saleItem.aggregate({
      where: { ...itemWhere, sale: where },
      _sum: { line_total: true },
    });
    return Number(agg._sum.line_total || 0);
  }

  private previousRange(from: string, to: string): { from: string; to: string } {
    const start = new Date(`${from}T12:00:00Z`);
    const end = new Date(`${to}T12:00:00Z`);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const prevTo = shiftBusinessYmd(from, -1);
    const prevFrom = shiftBusinessYmd(prevTo, -(days - 1));
    return { from: prevFrom, to: prevTo };
  }

  /**
   * Get all sales for reports (admin sees all, branch users see only their branch)
   */
  async getSalesForReports(q: ReportsQuery) {
    return prisma.sale.findMany({
      where: this.saleScope(q),
      include: {
        sale_items: {
          where: this.itemScope(q),
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
  async getBestSellingProducts(q: ReportsQuery & { limit?: number }) {
    const isAdmin = q.userRole === 'ADMIN' || q.userRole === 'SUPER_ADMIN';
    const saleFilter = this.saleScope(q);
    const where: Prisma.SaleItemWhereInput = { sale: saleFilter, ...(this.itemScope(q) || {}) };
    const limit = q.limit ?? 10;

    const products = await prisma.saleItem.groupBy({
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
    const productDetails = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { category: true },
    });

    let topBranchByProduct = new Map<string, { id: string; name: string; quantity: number }>();
    if (isAdmin && !q.branchId && productIds.length > 0) {
      const itemsWithBranch = await prisma.saleItem.findMany({
        where: { product_id: { in: productIds }, sale: saleFilter, ...(this.itemScope(q) || {}) },
        select: {
          product_id: true,
          quantity: true,
          sale: { select: { branch_id: true, branch: { select: { id: true, name: true } } } },
        },
      });

      const tally = new Map<string, Map<string, { id: string; name: string; quantity: number }>>();
      for (const item of itemsWithBranch) {
        const branch = item.sale?.branch;
        if (!branch) continue;
        if (!tally.has(item.product_id)) tally.set(item.product_id, new Map());
        const perBranch = tally.get(item.product_id)!;
        const existing = perBranch.get(branch.id);
        const qty = Number(item.quantity || 0);
        if (existing) existing.quantity += qty;
        else perBranch.set(branch.id, { id: branch.id, name: branch.name, quantity: qty });
      }

      for (const [productId, perBranch] of tally.entries()) {
        const top = [...perBranch.values()].sort((a, b) => b.quantity - a.quantity)[0];
        if (top) topBranchByProduct.set(productId, top);
      }
    }

    return products.map((item) => {
      const product = productDetails.find((p) => p.id === item.product_id);
      const quantitySold = Number(item._sum.quantity || 0);
      const revenue = Number(item._sum.line_total || 0);
      const catalogPrice = Number(
        product?.sales_rate_inc_dis_and_tax || product?.sales_rate_exc_dis_and_tax || 0,
      );
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
  async getEmployeePerformance(q: ReportsQuery) {
    const scope = this.saleScope(q);
    const [sales, lineAmounts] = await Promise.all([
      prisma.sale.findMany({
        where: scope,
        select: {
          id: true,
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
      }),
      this.amountsBySale(q, scope),
    ]);

    type Agg = { id: string; name: string; sales: number; orders: number };
    const map = new Map<string, Agg>();

    for (const sale of sales) {
      const salesperson = sale.salesperson;
      const user = sale.user;
      const id = salesperson?.id || user?.employee?.id || user?.id || 'unknown';
      const name =
        salesperson?.name ||
        user?.employee?.name ||
        user?.name ||
        user?.email ||
        'Unknown cashier';
      const row = map.get(id) || { id, name, sales: 0, orders: 0 };
      row.sales += lineAmounts ? lineAmounts.get(sale.id) || 0 : Number(sale.total_amount || 0);
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
  async getReportsStats(q: ReportsQuery) {
    const where = this.saleScope(q);

    const [totalSales, totalRevenue, uniqueCustomers] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.aggregate({
        where,
        _sum: { total_amount: true },
      }),
      prisma.sale.findMany({
        where,
        select: { customer_id: true },
        distinct: ['customer_id'],
      }),
    ]);

    const revenue = await this.revenueFor(q, where, Number(totalRevenue._sum.total_amount || 0));
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
        prisma.sale.count({ where: prevWhere }),
        prisma.sale.aggregate({ where: prevWhere, _sum: { total_amount: true } }),
        prisma.sale.findMany({
          where: prevWhere,
          select: { customer_id: true },
          distinct: ['customer_id'],
        }),
      ]);
      const prevRevenue = await this.revenueFor(
        { ...q, from: prev.from, to: prev.to },
        prevWhere,
        Number(prevRevAgg._sum.total_amount || 0),
      );
      const prevCustomers = prevCust.filter((c) => c.customer_id).length;
      const prevAvg = prevSales > 0 ? prevRevenue / prevSales : 0;
      const pct = (cur: number, old: number) =>
        old === 0 ? (cur > 0 ? 100 : 0) : ((cur - old) / old) * 100;
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
