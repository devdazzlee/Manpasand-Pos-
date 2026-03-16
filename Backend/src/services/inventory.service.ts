import { prisma } from '../prisma/client';
import { asNumber } from '../utils/helpers';
import { Prisma } from '@prisma/client';

export class InventoryService {
  async getDashboardStats(userRole?: string, branchId?: string) {
    const warehouse = await prisma.branch.findFirst({
      where: { branch_type: 'WAREHOUSE', is_active: true },
    });

    const branchFilter =
      userRole &&
      userRole !== 'ADMIN' &&
      userRole !== 'SUPER_ADMIN' &&
      branchId
        ? branchId
        : undefined;

    const stockWhere: Prisma.StockWhereInput = {};
    if (branchFilter) {
      stockWhere.branch_id = branchFilter;
    }

    const stocks = await prisma.stock.findMany({
      where: stockWhere,
      include: {
        product: true,
        branch: true,
      },
    });

    let totalWarehouseValue = 0;
    const branchSummary: Record<
      string,
      { name: string; value: number; items: number }
    > = {};

    for (const s of stocks) {
      const qty = asNumber(s.current_quantity);
      const cost = asNumber(
        (s.product as any).purchase_rate || (s.product as any).purchase_rate || 0
      );
      const value = qty * cost;
      const bid = s.branch_id;
      if (!branchSummary[bid]) {
        branchSummary[bid] = {
          name: (s.branch as any).name,
          value: 0,
          items: 0,
        };
      }
      branchSummary[bid].value += value;
      branchSummary[bid].items += 1;

      if ((s.branch as any).branch_type === 'WAREHOUSE') {
        totalWarehouseValue += value;
      }
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const purchaseWhere: Prisma.PurchaseWhereInput = {
      purchase_date: { gte: startOfMonth },
    };
    if (branchFilter) purchaseWhere.warehouse_branch_id = branchFilter;

    const recentPurchases = await prisma.purchase.findMany({
      where: purchaseWhere,
      take: 5,
      orderBy: { purchase_date: 'desc' },
      include: { product: true, supplier: true },
    });

    const pendingTransfersWhere: Prisma.TransferWhereInput = {
      status: { in: ['PENDING', 'DISPATCHED'] },
    };
    if (branchFilter) {
      pendingTransfersWhere.OR = [
        { from_branch_id: branchFilter },
        { to_branch_id: branchFilter },
      ];
    }

    const pendingTransfers = await prisma.transfer.findMany({
      where: pendingTransfersWhere,
      take: 10,
      orderBy: { transfer_date: 'desc' },
      include: { product: true, from_branch: true, to_branch: true },
    });

    const lowStockItems = stocks.filter((s) => {
      const minQty = asNumber(
        (s.product as any).min_qty ?? s.minimum_quantity ?? 0
      );
      return asNumber(s.current_quantity) <= minQty && minQty > 0;
    });

    return {
      totalWarehouseValue,
      branchSummary: Object.entries(branchSummary).map(([id, v]) => ({
        branchId: id,
        ...v,
      })),
      recentPurchases,
      pendingTransfers,
      lowStockAlerts: lowStockItems.map((s) => ({
        product: s.product,
        branch: s.branch,
        currentQuantity: asNumber(s.current_quantity),
        minThreshold: asNumber(
          (s.product as any).min_qty ?? s.minimum_quantity ?? 0
        ),
      })),
      warehouse,
    };
  }

  async getLowStockProducts(branchId?: string) {
    const where: Prisma.StockWhereInput = {};
    if (branchId) where.branch_id = branchId;

    const stocks = await prisma.stock.findMany({
      where,
      include: { product: true, branch: true },
    });

    const lowStock = stocks.filter((s) => {
      const minQty = asNumber(
        (s.product as any).min_qty ?? s.minimum_quantity ?? 0
      );
      return minQty > 0 && asNumber(s.current_quantity) <= minQty;
    });

    return lowStock;
  }

  async getStockMovements(params: {
    branchId?: string;
    productId?: string;
    movementType?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
    userRole?: string;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {};

    if (
      params.branchId &&
      params.userRole &&
      ['ADMIN', 'SUPER_ADMIN'].includes(params.userRole)
    ) {
      where.branch_id = params.branchId;
    } else if (
      params.branchId &&
      params.userRole &&
      !['ADMIN', 'SUPER_ADMIN'].includes(params.userRole)
    ) {
      where.branch_id = params.branchId;
    }

    if (params.productId) where.product_id = params.productId;
    if (params.movementType) where.movement_type = params.movementType as any;
    if (params.startDate || params.endDate) {
      where.created_at = {};
      if (params.startDate) where.created_at.gte = params.startDate;
      if (params.endDate) where.created_at.lte = params.endDate;
    }

    const [total, movements] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          product: true,
          branch: true,
          user: { select: { email: true } },
        },
      }),
    ]);

    return {
      data: movements,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getStockByLocation(branchId?: string, userRole?: string) {
    const where: Prisma.StockWhereInput = {};
    if (
      branchId &&
      userRole &&
      userRole !== 'ADMIN' &&
      userRole !== 'SUPER_ADMIN'
    ) {
      where.branch_id = branchId;
    }

    const stocks = await prisma.stock.findMany({
      where,
      include: { product: true, branch: true },
      orderBy: [{ branch_id: 'asc' }, { product_id: 'asc' }],
    });

    return stocks;
  }

  async getReports(params: {
    type: 'valuation' | 'purchase' | 'transfer' | 'stockout' | 'lowstock';
    branchId?: string;
    startDate?: Date;
    endDate?: Date;
    supplierId?: string;
    productId?: string;
  }) {
    switch (params.type) {
      case 'valuation': {
        const where: Prisma.StockWhereInput = {};
        if (params.branchId) where.branch_id = params.branchId;
        const stocks = await prisma.stock.findMany({
          where,
          include: { product: true, branch: true },
        });
        const byLocation: Record<string, { value: number; items: any[] }> = {};
        for (const s of stocks) {
          const bid = s.branch_id;
          if (!byLocation[bid]) {
            byLocation[bid] = { value: 0, items: [] };
          }
          const cost = asNumber((s.product as any).purchase_rate || 0);
          const value = asNumber(s.current_quantity) * cost;
          byLocation[bid].value += value;
          byLocation[bid].items.push({
            product: s.product,
            quantity: asNumber(s.current_quantity),
            value,
          });
        }
        return { byLocation, total: Object.values(byLocation).reduce((a, b) => a + b.value, 0) };
      }

      case 'purchase': {
        const where: Prisma.PurchaseWhereInput = {};
        if (params.branchId) where.warehouse_branch_id = params.branchId;
        if (params.supplierId) where.supplier_id = params.supplierId;
        if (params.productId) where.product_id = params.productId;
        if (params.startDate || params.endDate) {
          where.purchase_date = {};
          if (params.startDate) where.purchase_date.gte = params.startDate;
          if (params.endDate) where.purchase_date.lte = params.endDate;
        }
        const purchases = await prisma.purchase.findMany({
          where,
          include: { product: true, supplier: true, warehouse_branch: true },
          orderBy: { purchase_date: 'desc' },
        });
        return purchases;
      }

      case 'transfer': {
        const where: Prisma.TransferWhereInput = {};
        if (params.branchId) {
          where.OR = [
            { from_branch_id: params.branchId },
            { to_branch_id: params.branchId },
          ];
        }
        if (params.productId) where.product_id = params.productId;
        if (params.startDate || params.endDate) {
          where.transfer_date = {};
          if (params.startDate) where.transfer_date.gte = params.startDate;
          if (params.endDate) where.transfer_date.lte = params.endDate;
        }
        const transfers = await prisma.transfer.findMany({
          where,
          include: {
            product: true,
            from_branch: true,
            to_branch: true,
          },
          orderBy: { transfer_date: 'desc' },
        });
        return transfers;
      }

      case 'stockout': {
        const where: Prisma.StockMovementWhereInput = {
          movement_type: { in: ['SALE', 'DAMAGE', 'LOSS', 'EXPIRED'] },
        };
        if (params.branchId) where.branch_id = params.branchId;
        if (params.productId) where.product_id = params.productId;
        if (params.startDate || params.endDate) {
          where.created_at = {};
          if (params.startDate) where.created_at.gte = params.startDate;
          if (params.endDate) where.created_at.lte = params.endDate;
        }
        const movements = await prisma.stockMovement.findMany({
          where,
          include: { product: true, branch: true },
          orderBy: { created_at: 'desc' },
        });
        return movements;
      }

      case 'lowstock': {
        const stocks = await prisma.stock.findMany({
          where: params.branchId ? { branch_id: params.branchId } : {},
          include: { product: true, branch: true },
        });
        return stocks.filter((s) => {
          const minQty = asNumber((s.product as any).min_qty ?? s.minimum_quantity ?? 0);
          return minQty > 0 && asNumber(s.current_quantity) <= minQty;
        });
      }

      default:
        return [];
    }
  }
}
