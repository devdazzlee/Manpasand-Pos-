import { Prisma, SaleItemType, SaleStatus, StockMovementType } from "@prisma/client";
import { prisma } from '../prisma/client';
import { AppError } from "../utils/apiError";

interface ReturnItem {
    productId: string;
    quantity: number;
}

interface ExchangeItem {
    productId: string;
    quantity: number;
    price: number;
}

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
            const validations = [];

            if (customerId) {
                validations.push(
                    tx.customer.findUnique({ where: { id: customerId } })
                );
            } else {
                validations.push(Promise.resolve(null)); 
            }

            validations.push(
                tx.branch.findUnique({ where: { id: branchId } })
            );

            const [customer, branch] = await Promise.all(validations);

            if (customerId && !customer) {
                throw new AppError(400, "Invalid customer");
            }

            if (!branch) {
                throw new AppError(400, "Invalid branch");
            }

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

    async getTodaySales({ branchId }: { branchId?: string }) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);

        return prisma.sale.findMany({
            where: {
                branch_id: branchId,
                sale_date: {
                    gte: start,
                    lte: end,
                },
            },
            include: {
                customer: true,
            },
            orderBy: { sale_date: "desc" },
        });
    }

    // async createExchangeOrReturnSale({
    //     originalSaleId,
    //     branchId,
    //     customerId,
    //     returnedItems,
    //     exchangedItems,
    //     createdBy
    // }: {
    //     originalSaleId: string,
    //     branchId: string,
    //     customerId?: string,
    //     returnedItems: { productId: string, quantity: number }[],
    //     exchangedItems: { productId: string, quantity: number, price: number }[],
    //     createdBy: string,
    // }) {
    //     return prisma.$transaction(async (tx) => {
    //         const originalSale = await tx.sale.findUnique({
    //             where: { id: originalSaleId },
    //             include: { sale_items: true },
    //         });
    //         if (!originalSale) throw new AppError(404, "Original sale not found");

    //         const productIds = [
    //             ...returnedItems.map(i => i.productId),
    //             ...exchangedItems.map(i => i.productId)
    //         ];

    //         const stocks = await tx.stock.findMany({
    //             where: { product_id: { in: productIds }, branch_id: branchId }
    //         });

    //         const saleItems: any[] = [];
    //         let total = 0;

    //         // Process Returns
    //         for (const ret of returnedItems) {
    //             const stock = stocks.find(s => s.product_id === ret.productId);
    //             if (!stock) throw new AppError(400, `Stock not found for product ${ret.productId}`);

    //             const originalItem = originalSale.sale_items.find(i => i.product_id === ret.productId);
    //             if (!originalItem) throw new AppError(400, `Product ${ret.productId} not in original sale`);

    //             if (ret.quantity > originalItem.quantity) {
    //                 throw new AppError(400, `Return quantity exceeds original`);
    //             }

    //             await tx.stock.update({
    //                 where: {
    //                     product_id_branch_id: {
    //                         product_id: ret.productId,
    //                         branch_id: branchId,
    //                     }
    //                 },
    //                 data: { current_quantity: { increment: ret.quantity } }
    //             });

    //             await tx.stockMovement.create({
    //                 data: {
    //                     product_id: ret.productId,
    //                     branch_id: branchId,
    //                     movement_type: "RETURN",
    //                     quantity_change: ret.quantity,
    //                     previous_qty: 0,
    //                     new_qty: 0,
    //                     created_by: createdBy,
    //                 },
    //             });

    //             const lineTotal = -(Number(originalItem.unit_price) * ret.quantity);
    //             total += lineTotal;

    //             saleItems.push({
    //                 product_id: ret.productId,
    //                 quantity: -ret.quantity,
    //                 unit_price: originalItem.unit_price,
    //                 line_total: lineTotal,
    //                 item_type: "RETURN",
    //                 ref_sale_item_id: originalItem.id
    //             });
    //         }

    //         // Process Exchanges
    //         for (const item of exchangedItems) {
    //             const stock = stocks.find(s => s.product_id === item.productId);
    //             if (!stock || stock.current_quantity < item.quantity) {
    //                 throw new AppError(400, `Insufficient stock for exchange product ${item.productId}`);
    //             }

    //             await tx.stock.update({
    //                 where: {
    //                     product_id_branch_id: {
    //                         product_id: item.productId,
    //                         branch_id: branchId,
    //                     }
    //                 },
    //                 data: { current_quantity: { decrement: item.quantity } }
    //             });

    //             await tx.stockMovement.create({
    //                 data: {
    //                     product_id: item.productId,
    //                     branch_id: branchId,
    //                     movement_type: "SALE",
    //                     quantity_change: -item.quantity,
    //                     previous_qty: stock.current_quantity,
    //                     new_qty: stock.current_quantity - item.quantity,
    //                     created_by: createdBy,
    //                 },
    //             });

    //             const lineTotal = item.price * item.quantity;
    //             total += lineTotal;

    //             saleItems.push({
    //                 product_id: item.productId,
    //                 quantity: item.quantity,
    //                 unit_price: item.price,
    //                 line_total: lineTotal,
    //                 item_type: "EXCHANGE"
    //             });
    //         }

    //         const sale = await tx.sale.create({
    //             data: {
    //                 sale_number: `SALE-${Date.now()}`,
    //                 branch_id: branchId,
    //                 customer_id: customerId,
    //                 original_sale_id: originalSaleId,
    //                 total_amount: total,
    //                 subtotal: total,
    //                 payment_method: "CASH",
    //                 payment_status: "PAID",
    //                 status: "COMPLETED",
    //                 created_by: createdBy,
    //                 sale_items: {
    //                     create: saleItems,
    //                 },
    //             },
    //             include: { sale_items: true },
    //         });

    //         return sale;
    //     });
    // }    

    async createExchangeOrReturnSale({
        originalSaleId,
        branchId,
        customerId,
        returnedItems,
        exchangedItems,
        createdBy,
    }: {
        originalSaleId: string;
        branchId: string;
        customerId?: string;
        returnedItems: ReturnItem[];
        exchangedItems: ExchangeItem[];
        createdBy: string;
    }) {
        return prisma.$transaction(async (tx) => {
            const originalSale = await tx.sale.findUnique({
                where: { id: originalSaleId },
                include: { sale_items: true },
            });

            if (!originalSale) throw new AppError(400, 'Original sale not found');

            const productIds = [
                ...returnedItems.map((i) => i.productId),
                ...exchangedItems.map((i) => i.productId),
            ];

            const stocks = await tx.stock.findMany({
                where: {
                    product_id: { in: productIds },
                    branch_id: branchId,
                },
            });

            const saleItems: any[] = [];
            let total = 0;
            let hasReturn = returnedItems.length > 0;
            let hasExchange = exchangedItems.length > 0;

            // Process Returns
            for (const ret of returnedItems) {
                const stock = stocks.find((s) => s.product_id === ret.productId);
                if (!stock) throw new AppError(400, `Stock not found for product ${ret.productId}`);

                const originalItem = originalSale.sale_items.find((i) => i.product_id === ret.productId);
                if (!originalItem) throw new AppError(400, `Product ${ret.productId} not in original sale`);

                if (ret.quantity > originalItem.quantity) {
                    throw new AppError(400, `Return quantity exceeds original`);
                }

                // Update stock
                await tx.stock.update({
                    where: {
                        product_id_branch_id: {
                            product_id: ret.productId,
                            branch_id: branchId,
                        },
                    },
                    data: {
                        current_quantity: { increment: ret.quantity },
                    },
                });

                // Create stock movement
                await tx.stockMovement.create({
                    data: {
                        product_id: ret.productId,
                        branch_id: branchId,
                        movement_type: StockMovementType.RETURN,
                        quantity_change: ret.quantity,
                        previous_qty: stock.current_quantity,
                        new_qty: stock.current_quantity + ret.quantity,
                        created_by: createdBy,
                        reference_id: originalSaleId,
                        reference_type: 'return',
                        notes: 'Returned by customer',
                    },
                });

                const lineTotal = -Number(originalItem.unit_price) * ret.quantity;
                total += lineTotal;

                saleItems.push({
                    product_id: ret.productId,
                    quantity: -ret.quantity,
                    unit_price: originalItem.unit_price,
                    tax_rate: originalItem.tax_rate,
                    discount_rate: originalItem.discount_rate,
                    tax_amount: 0,
                    discount_amount: 0,
                    line_total: lineTotal,
                    item_type: SaleItemType.RETURN,
                    ref_sale_item_id: originalItem.id,
                });
            }

            // Process Exchanges
            for (const item of exchangedItems) {
                const stock = stocks.find((s) => s.product_id === item.productId);
                if (!stock || stock.current_quantity < item.quantity) {
                    throw new AppError(400, `Insufficient stock for product ${item.productId}`);
                }

                await tx.stock.update({
                    where: {
                        product_id_branch_id: {
                            product_id: item.productId,
                            branch_id: branchId,
                        },
                    },
                    data: {
                        current_quantity: { decrement: item.quantity },
                    },
                });

                await tx.stockMovement.create({
                    data: {
                        product_id: item.productId,
                        branch_id: branchId,
                        movement_type: StockMovementType.SALE,
                        quantity_change: -item.quantity,
                        previous_qty: stock.current_quantity,
                        new_qty: stock.current_quantity - item.quantity,
                        created_by: createdBy,
                        reference_id: originalSaleId,
                        reference_type: 'exchange',
                        notes: 'Exchanged to customer',
                    },
                });

                const lineTotal = item.price * item.quantity;
                total += lineTotal;

                saleItems.push({
                    product_id: item.productId,
                    quantity: item.quantity,
                    unit_price: item.price,
                    tax_rate: 0,
                    discount_rate: 0,
                    tax_amount: 0,
                    discount_amount: 0,
                    line_total: lineTotal,
                    item_type: SaleItemType.EXCHANGE,
                });
            }

            const sale = await tx.sale.create({
                data: {
                    sale_number: `SALE-${Date.now()}`,
                    branch_id: branchId,
                    customer_id: customerId,
                    original_sale_id: originalSaleId,
                    subtotal: total,
                    total_amount: total,
                    payment_method: 'CASH',
                    payment_status: 'PAID',
                    status: hasReturn && hasExchange
                        ? SaleStatus.EXCHANGED
                        : hasReturn
                            ? SaleStatus.REFUNDED
                            : SaleStatus.EXCHANGED,
                    created_by: createdBy,
                    sale_items: {
                        create: saleItems,
                    },
                },
                include: {
                    sale_items: true,
                },
            });

            return sale;
        });
    }

    async getRecentSaleItemsProductNameAndPrice(branchId: string) {
        const sale = await prisma.sale.findFirst({
            where: { branch_id: branchId },
            orderBy: { sale_date: "desc" },
            include: {
                sale_items: {
                    orderBy: { id: "desc" },
                    take: 5,
                    include: { product: true },
                },
            },
        });
        if (!sale || sale.sale_items.length === 0) return [];
        return sale.sale_items.map(item => ({
            productName: item.product.name,
            price: item.unit_price,
        }));
    }
}
export { SaleService };