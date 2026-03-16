import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { asNumber } from '../utils/helpers';

export class StockAdjustmentService {
  async createAdjustment(data: {
    productId: string;
    branchId: string;
    systemQuantity: number;
    physicalCount: number;
    reason?: string;
    adjustedBy: string;
  }) {
    const difference = data.physicalCount - data.systemQuantity;
    if (difference === 0) {
      throw new AppError(400, 'No difference between system and physical count');
    }

    return prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findUnique({
        where: {
          product_id_branch_id: {
            product_id: data.productId,
            branch_id: data.branchId,
          },
        },
      });

      const newQty = data.physicalCount;
      const previousQty = stock ? asNumber(stock.current_quantity) : 0;

      if (stock) {
        await tx.stock.update({
          where: {
            product_id_branch_id: {
              product_id: data.productId,
              branch_id: data.branchId,
            },
          },
          data: { current_quantity: newQty },
        });
      } else {
        if (newQty <= 0) {
          throw new AppError(400, 'Cannot adjust to zero or negative when no stock exists');
        }
        await tx.stock.create({
          data: {
            product_id: data.productId,
            branch_id: data.branchId,
            current_quantity: newQty,
          },
        });
      }

      await tx.stockMovement.create({
        data: {
          product_id: data.productId,
          branch_id: data.branchId,
          movement_type: 'ADJUSTMENT',
          reference_type: 'adjustment',
          quantity_change: difference,
          previous_qty: previousQty,
          new_qty: newQty,
          notes: data.reason || `Physical count reconciliation. System: ${data.systemQuantity}, Physical: ${data.physicalCount}`,
          created_by: data.adjustedBy,
        },
      });

      const adjustment = await tx.stockAdjustment.create({
        data: {
          product_id: data.productId,
          branch_id: data.branchId,
          system_quantity: data.systemQuantity,
          physical_count: data.physicalCount,
          difference,
          reason: data.reason,
          adjusted_by: data.adjustedBy,
        },
        include: {
          product: true,
          branch: true,
          user: { select: { email: true } },
        },
      });

      return adjustment;
    });
  }

  async listAdjustments(params: {
    page?: number;
    limit?: number;
    productId?: string;
    branchId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.productId) where.product_id = params.productId;
    if (params.branchId) where.branch_id = params.branchId;
    if (params.startDate || params.endDate) {
      where.adjustment_date = {};
      if (params.startDate) where.adjustment_date.gte = params.startDate;
      if (params.endDate) where.adjustment_date.lte = params.endDate;
    }

    const [total, adjustments] = await Promise.all([
      prisma.stockAdjustment.count({ where }),
      prisma.stockAdjustment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { adjustment_date: 'desc' },
        include: {
          product: true,
          branch: true,
          user: { select: { email: true } },
        },
      }),
    ]);

    return {
      data: adjustments,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
