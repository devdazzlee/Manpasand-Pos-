import { Stock, StockMovement } from "@prisma/client";
import { prisma } from '../prisma/client';
import { AppError } from "../utils/apiError";

class StockService {
    async createStock({ productId, branchId, quantity, createdBy }: {
        productId: Stock["product_id"];
        branchId: Stock["branch_id"];
        quantity: Stock["current_quantity"];
        createdBy: StockMovement["created_by"];
    }) {
        return prisma.$transaction(async (tx) => {
            const exists = await tx.stock.findUnique({
                where: { product_id_branch_id: { product_id: productId, branch_id: branchId } },
            });

            if (exists) throw new AppError(400, "Stock already exists for this product in branch");

            const stock = await tx.stock.create({
                data: {
                    product_id: productId,
                    branch_id: branchId,
                    current_quantity: quantity,
                },
            });

            await tx.stockMovement.create({
                data: {
                    product_id: productId,
                    branch_id: branchId,
                    movement_type: "ADJUSTMENT",
                    quantity_change: quantity,
                    previous_qty: 0,
                    new_qty: quantity,
                    created_by: createdBy,
                },
            });

            return stock;
        });
    }

    async adjustStock({ productId, branchId, quantityChange, reason, createdBy }: {
        productId: string;
        branchId: string;
        quantityChange: number;
        reason?: string;
        createdBy: string;
    }) {
        return prisma.$transaction(async (tx) => {
            const stock = await tx.stock.findUnique({
                where: { product_id_branch_id: { product_id: productId, branch_id: branchId } },
            });

            if (!stock) throw new AppError(404, "Stock not found");

            const newQty = stock.current_quantity + quantityChange;
            if (newQty < 0) throw new AppError(400, "Insufficient stock");

            await tx.stock.update({
                where: {
                    product_id_branch_id: {
                        product_id: productId,
                        branch_id: branchId,
                    },
                },
                data: {
                    current_quantity: newQty,
                },
            });

            await tx.stockMovement.create({
                data: {
                    product_id: productId,
                    branch_id: branchId,
                    movement_type: quantityChange > 0 ? "ADJUSTMENT" : "DAMAGE",
                    quantity_change: quantityChange,
                    previous_qty: stock.current_quantity,
                    new_qty: newQty,
                    notes: reason,
                    created_by: createdBy,
                },
            });

            return { newQty };
        });
    }

    async getStockByBranch(branchId: string) {
        return prisma.stock.findMany({
            where: { branch_id: branchId },
            include: { product: true },
            orderBy: { last_updated: "desc" },
        });
    }

    async getStockMovements(branchId: string) {
        return prisma.stockMovement.findMany({
            where: { branch_id: branchId },
            include: { product: true },
            orderBy: { created_at: "desc" },
        });
    }
}

export { StockService };
