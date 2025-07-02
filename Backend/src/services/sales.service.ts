import { Prisma, SaleStatus } from "@prisma/client";
import { prisma } from '../prisma/client';
import { AppError } from "../utils/apiError";

class SaleService {
    async getSales({ branchId }: { branchId?: string }) {
        return prisma.sale.findMany({
            where: { branch_id: branchId },
            include: {
                sale_items: {
                    include: { product: true },
                },
                customer: true,
            },
            orderBy: { sale_date: "desc" },
        });
    }

    async getSaleById(saleId: string) {
        const sale = await prisma.sale.findUnique({
            where: { id: saleId },
            include: {
                sale_items: {
                    include: { product: true },
                },
                customer: true,
            },
        });
        if (!sale) throw new AppError(404, "Sale not found");
        return sale;
    }

    async createSale({ branchId, customerId, paymentMethod, items, createdBy }: {
        branchId: string;
        customerId?: string;
        paymentMethod: Prisma.SaleCreateInput["payment_method"];
        items: Array<{ productId: string; quantity: number; price: number }>;
        createdBy: string;
    }) {
        return prisma.$transaction(async (tx) => {
            const productIds = items.map(i => i.productId);
            const stocks = await tx.stock.findMany({
                where: {
                    product_id: { in: productIds },
                    branch_id: branchId,
                },
            });

            let total = 0;
            for (const item of items) {
                const stock = stocks.find(s => s.product_id === item.productId);
                if (!stock) throw new AppError(400, `No stock for product ${item.productId}`);
                if (stock.current_quantity < item.quantity) throw new AppError(400, `Insufficient stock`);
                total += item.price * item.quantity;
            }

            for (const item of items) {
                await tx.stock.update({
                    where: {
                        product_id_branch_id: {
                            product_id: item.productId,
                            branch_id: branchId,
                        },
                    },
                    data: {
                        current_quantity: {
                            decrement: item.quantity,
                        },
                    },
                });

                await tx.stockMovement.create({
                    data: {
                        product_id: item.productId,
                        branch_id: branchId,
                        movement_type: "SALE",
                        quantity_change: -item.quantity,
                        previous_qty: stocks.find(s => s.product_id === item.productId)!.current_quantity,
                        new_qty: stocks.find(s => s.product_id === item.productId)!.current_quantity - item.quantity,
                        created_by: createdBy,
                    },
                });
            }

            const sale = await tx.sale.create({
                data: {
                    sale_number: `SALE-${Date.now()}`,
                    branch_id: branchId,
                    customer_id: customerId,
                    total_amount: total,
                    subtotal: total,
                    payment_method: paymentMethod,
                    payment_status: "PAID",
                    status: "COMPLETED",
                    created_by: createdBy,
                    sale_items: {
                        create: items.map(item => ({
                            product: { connect: { id: item.productId } },
                            quantity: item.quantity,
                            unit_price: item.price,
                            line_total: item.price * item.quantity,
                        })),
                    },
                },
                include: {
                    sale_items: true,
                },
            });

            return sale;
        });
    }

    async refundSale(saleId: string, refundedBy: string) {
        const sale = await prisma.sale.findUnique({
            where: { id: saleId },
            include: { sale_items: true },
        });
        if (!sale) throw new AppError(404, "Sale not found");
        if (sale.status === "REFUNDED") throw new AppError(400, "Already refunded");

        for (const item of sale.sale_items) {
            await prisma.stock.update({
                where: {
                    product_id_branch_id: {
                        product_id: item.product_id,
                        branch_id: sale.branch_id!,
                    },
                },
                data: {
                    current_quantity: {
                        increment: item.quantity,
                    },
                },
            });

            await prisma.stockMovement.create({
                data: {
                    product_id: item.product_id,
                    branch_id: sale.branch_id!,
                    movement_type: "RETURN",
                    quantity_change: item.quantity,
                    previous_qty: 0, // optionally track old quantity
                    new_qty: 0,      // optionally track new quantity
                    created_by: refundedBy,
                },
            });
        }

        return prisma.sale.update({
            where: { id: saleId },
            data: { status: "REFUNDED" },
            include: { sale_items: true },
        });
    }
}

export { SaleService };