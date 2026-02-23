"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaleService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const notification_service_1 = require("./notification.service");
class SaleService {
    notificationService = new notification_service_1.NotificationService();
    async getSales({ branchId }) {
        return client_2.prisma.sale.findMany({
            where: branchId ? { branch_id: branchId } : undefined,
            include: {
                sale_items: {
                    include: { product: true },
                },
                customer: true,
                branch: {
                    select: {
                        id: true,
                        name: true,
                        address: true,
                    },
                },
            },
            orderBy: { sale_date: 'desc' },
        });
    }
    async getSalesForReturns({ branchId }) {
        return client_2.prisma.sale.findMany({
            where: {
                branch_id: branchId,
                status: 'COMPLETED', // Only completed sales can be returned
            },
            include: {
                sale_items: {
                    include: { product: true },
                },
                customer: true,
            },
            orderBy: { sale_date: 'desc' },
        });
    }
    async getSaleById(saleId) {
        const sale = await client_2.prisma.sale.findUnique({
            where: { id: saleId },
            include: {
                sale_items: {
                    include: { product: true },
                },
                customer: true,
            },
        });
        if (!sale)
            throw new apiError_1.AppError(404, 'Sale not found');
        return sale;
    }
    async createSale({ branchId, customerId, paymentMethod, items, createdBy, }) {
        // 1) Validate OUTSIDE any interactive transaction
        const [customer, branch] = await Promise.all([
            customerId ? client_2.prisma.customer.findUnique({ where: { id: customerId } }) : null,
            client_2.prisma.branch.findUnique({ where: { id: branchId } }),
        ]);
        if (customerId && !customer)
            throw new apiError_1.AppError(400, 'Invalid customer');
        if (!branch)
            throw new apiError_1.AppError(400, 'Invalid branch');
        if (!items.length)
            throw new apiError_1.AppError(400, 'No items provided');
        // 2) Validate that all products exist
        const productIds = items.map(i => i.productId);
        const uniqueProductIds = [...new Set(productIds)]; // Remove duplicates
        const products = await client_2.prisma.product.findMany({
            where: { id: { in: uniqueProductIds } },
            select: { id: true },
        });
        const foundProductIds = new Set(products.map(p => p.id));
        const missingProductIds = uniqueProductIds.filter(id => !foundProductIds.has(id));
        if (missingProductIds.length > 0) {
            throw new apiError_1.AppError(400, `Products not found: ${missingProductIds.join(', ')}`);
        }
        // 3) Pre-fetch stock snapshot once
        const stocks = await client_2.prisma.stock.findMany({
            where: { product_id: { in: productIds }, branch_id: branchId },
        });
        const stockMap = new Map(stocks.map(s => [s.product_id, s]));
        // 4) Group same product lines and compute movements in memory
        const grouped = items.reduce((acc, it) => {
            const key = it.productId;
            if (!acc[key])
                acc[key] = { productId: it.productId, qty: new client_1.Prisma.Decimal(0) };
            acc[key].qty = acc[key].qty.plus(it.quantity);
            return acc;
        }, {});
        const movements = [];
        for (const gp of Object.values(grouped)) {
            const existing = stockMap.get(gp.productId);
            const prev = new client_1.Prisma.Decimal(existing?.current_quantity ?? 0);
            const change = gp.qty.mul(-1); // sale => decrement
            const next = prev.plus(change);
            // allow negative stock per your testing; add a check here if you want to block it
            movements.push({
                product_id: gp.productId,
                previous_qty: prev,
                new_qty: next,
                quantity_change: change,
            });
            stockMap.set(gp.productId, {
                ...(existing ?? {}),
                product_id: gp.productId,
                branch_id: branchId,
                current_quantity: next,
            });
        }
        // 5) Prepare all writes as a single non-interactive transaction (prevents P2028)
        const total = items.reduce((s, it) => s + it.price * it.quantity, 0);
        const ops = [];
        // (a) Sale + items
        ops.push(client_2.prisma.sale.create({
            data: {
                sale_number: `SALE-${Date.now()}`,
                branch_id: branchId,
                customer_id: customerId,
                total_amount: new client_1.Prisma.Decimal(total),
                subtotal: new client_1.Prisma.Decimal(total),
                payment_method: paymentMethod,
                payment_status: 'PAID',
                status: 'COMPLETED',
                created_by: createdBy,
                sale_items: {
                    create: items.map((item) => ({
                        product: { connect: { id: item.productId } },
                        quantity: new client_1.Prisma.Decimal(item.quantity),
                        unit_price: new client_1.Prisma.Decimal(item.price),
                        line_total: new client_1.Prisma.Decimal(item.price).mul(item.quantity),
                    })),
                },
            },
            include: { sale_items: true },
        }));
        // (b) Stock upserts (one per product)
        for (const m of movements) {
            const decAbs = m.quantity_change.abs(); // positive decrement amount
            ops.push(client_2.prisma.stock.upsert({
                where: {
                    product_id_branch_id: {
                        product_id: m.product_id,
                        branch_id: branchId,
                    },
                },
                update: {
                    current_quantity: { decrement: decAbs },
                },
                create: {
                    product_id: m.product_id,
                    branch_id: branchId,
                    current_quantity: m.new_qty, // start at computed value (can be negative)
                    minimum_quantity: new client_1.Prisma.Decimal(0),
                    maximum_quantity: new client_1.Prisma.Decimal(1000),
                    reserved_quantity: new client_1.Prisma.Decimal(0),
                },
            }));
        }
        // (c) Stock movements (use computed prev/new; no read-after-write)
        for (const m of movements) {
            ops.push(client_2.prisma.stockMovement.create({
                data: {
                    product_id: m.product_id,
                    branch_id: branchId,
                    movement_type: 'SALE',
                    quantity_change: m.quantity_change, // negative
                    previous_qty: m.previous_qty,
                    new_qty: m.new_qty,
                    created_by: createdBy,
                },
            }));
        }
        const [sale] = await client_2.prisma.$transaction(ops);
        const saleResult = sale;
        // NOTE: Sale notifications removed per client requirement (Konain Bhai 1/5/2026)
        // Cash Counter sale notifications should NOT appear in notifications panel
        // Only important notifications (Inventory Low, Website Orders, etc.) should be shown
        try {
            // Check for low stock after sale and create notifications
            for (const m of movements) {
                try {
                    // Get actual stock from database after sale
                    const stock = await client_2.prisma.stock.findUnique({
                        where: {
                            product_id_branch_id: {
                                product_id: m.product_id,
                                branch_id: branchId,
                            },
                        },
                    });
                    const product = await client_2.prisma.product.findUnique({
                        where: { id: m.product_id },
                        select: { id: true, name: true },
                    });
                    if (product && stock) {
                        const currentStock = Number(stock.current_quantity);
                        const minStock = Number(stock.minimum_quantity) || 0;
                        // Create notification if stock is out (critical) or low
                        if (currentStock <= 0) {
                            await this.notificationService.notifyLowStock({
                                productId: product.id,
                                productName: product.name,
                                currentStock,
                                minStock,
                                branchId,
                            });
                        }
                        else if (currentStock <= 5 || (minStock > 0 && currentStock <= minStock)) {
                            // Low stock alert if <= 5 units or below minimum
                            await this.notificationService.notifyLowStock({
                                productId: product.id,
                                productName: product.name,
                                currentStock,
                                minStock: minStock > 0 ? minStock : 5,
                                branchId,
                            });
                        }
                    }
                }
                catch (error) {
                    console.error(`Failed to check stock for product ${m.product_id}:`, error);
                }
            }
        }
        catch (error) {
            // Don't fail the sale if notification fails - just log it
            console.error('Failed to create sale notification:', error);
        }
        return saleResult;
    }
    async getTodaySales({ branchId }) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        return client_2.prisma.sale.findMany({
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
            orderBy: { sale_date: 'desc' },
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
    async createExchangeOrReturnSale({ originalSaleId, branchId, customerId, returnedItems, exchangedItems, createdBy, }) {
        return client_2.prisma.$transaction(async (tx) => {
            const originalSale = await tx.sale.findUnique({
                where: { id: originalSaleId },
                include: { sale_items: true },
            });
            if (!originalSale)
                throw new apiError_1.AppError(400, 'Original sale not found');
            // Validate return quantities against original sale
            for (const ret of returnedItems) {
                const originalItem = originalSale.sale_items.find((i) => i.product_id === ret.productId);
                if (!originalItem) {
                    throw new apiError_1.AppError(400, `Product ${ret.productId} not found in original sale`);
                }
                if (ret.quantity > originalItem.quantity.toNumber()) {
                    throw new apiError_1.AppError(400, `Return quantity (${ret.quantity}) exceeds original sale quantity (${originalItem.quantity}) for product ${ret.productId}`);
                }
            }
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
            const saleItems = [];
            let total = 0;
            let hasReturn = returnedItems.length > 0;
            let hasExchange = exchangedItems.length > 0;
            // Process Returns
            for (const ret of returnedItems) {
                const stock = stocks.find((s) => s.product_id === ret.productId);
                // For testing: Create stock record if it doesn't exist
                if (!stock) {
                    await tx.stock.create({
                        data: {
                            product_id: ret.productId,
                            branch_id: branchId,
                            current_quantity: 0,
                            minimum_quantity: 0,
                            maximum_quantity: 1000,
                            reserved_quantity: 0,
                        },
                    });
                }
                const originalItem = originalSale.sale_items.find((i) => i.product_id === ret.productId);
                if (!originalItem)
                    throw new apiError_1.AppError(400, `Product ${ret.productId} not in original sale`);
                if (ret.quantity > originalItem.quantity.toNumber()) {
                    throw new apiError_1.AppError(400, `Return quantity exceeds original`);
                }
                // Update stock using upsert to handle both existing and new records
                await tx.stock.upsert({
                    where: {
                        product_id_branch_id: {
                            product_id: ret.productId,
                            branch_id: branchId,
                        },
                    },
                    update: {
                        current_quantity: { increment: ret.quantity },
                    },
                    create: {
                        product_id: ret.productId,
                        branch_id: branchId,
                        current_quantity: ret.quantity,
                        minimum_quantity: 0,
                        maximum_quantity: 1000,
                        reserved_quantity: 0,
                    },
                });
                // Get current stock after upsert
                const currentStock = await tx.stock.findUnique({
                    where: {
                        product_id_branch_id: {
                            product_id: ret.productId,
                            branch_id: branchId,
                        },
                    },
                });
                // Create stock movement
                await tx.stockMovement.create({
                    data: {
                        product_id: ret.productId,
                        branch_id: branchId,
                        movement_type: client_1.StockMovementType.RETURN,
                        quantity_change: ret.quantity,
                        previous_qty: currentStock
                            ? currentStock.current_quantity.minus(ret.quantity) // Decimal.minus(number)
                            : new client_1.Prisma.Decimal(0),
                        new_qty: currentStock ? currentStock.current_quantity : ret.quantity,
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
                    item_type: client_1.SaleItemType.RETURN,
                    ref_sale_item_id: originalItem.id,
                });
            }
            // Process Exchanges
            for (const item of exchangedItems) {
                const stock = stocks.find((s) => s.product_id === item.productId);
                // For testing: Create stock record if it doesn't exist
                if (!stock) {
                    await tx.stock.create({
                        data: {
                            product_id: item.productId,
                            branch_id: branchId,
                            current_quantity: 0,
                            minimum_quantity: 0,
                            maximum_quantity: 1000,
                            reserved_quantity: 0,
                        },
                    });
                }
                // For testing: Allow negative stock (comment out stock validation)
                // if (stock && stock.current_quantity < item.quantity) {
                //     throw new AppError(400, `Insufficient stock for product ${item.productId}`);
                // }
                // Use upsert to handle both existing and new stock records
                await tx.stock.upsert({
                    where: {
                        product_id_branch_id: {
                            product_id: item.productId,
                            branch_id: branchId,
                        },
                    },
                    update: {
                        current_quantity: { decrement: item.quantity },
                    },
                    create: {
                        product_id: item.productId,
                        branch_id: branchId,
                        current_quantity: -item.quantity,
                        minimum_quantity: 0,
                        maximum_quantity: 1000,
                        reserved_quantity: 0,
                    },
                });
                // Get current stock after upsert
                const currentStock = await tx.stock.findUnique({
                    where: {
                        product_id_branch_id: {
                            product_id: item.productId,
                            branch_id: branchId,
                        },
                    },
                });
                await tx.stockMovement.create({
                    data: {
                        product_id: item.productId,
                        branch_id: branchId,
                        movement_type: client_1.StockMovementType.SALE,
                        quantity_change: -item.quantity,
                        previous_qty: currentStock
                            ? currentStock.current_quantity.plus(item.quantity)
                            : new client_1.Prisma.Decimal(0),
                        new_qty: currentStock
                            ? currentStock.current_quantity
                            : new client_1.Prisma.Decimal(-item.quantity),
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
                    item_type: client_1.SaleItemType.EXCHANGE,
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
                        ? client_1.SaleStatus.EXCHANGED
                        : hasReturn
                            ? client_1.SaleStatus.REFUNDED
                            : client_1.SaleStatus.EXCHANGED,
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
        }).then(async (sale) => {
            // Create notifications for return/exchange (after transaction completes)
            try {
                const hasReturn = returnedItems.length > 0;
                const hasExchange = exchangedItems.length > 0;
                const originalSale = await client_2.prisma.sale.findUnique({
                    where: { id: originalSaleId },
                    select: { sale_number: true, sale_items: true },
                });
                if (hasReturn && originalSale) {
                    const returnAmount = returnedItems.reduce((sum, ret) => {
                        const originalItem = originalSale.sale_items.find((i) => i.product_id === ret.productId);
                        return sum + (originalItem ? Number(originalItem.unit_price) * ret.quantity : 0);
                    }, 0);
                    await this.notificationService.notifyReturnProcessed({
                        returnId: sale.id,
                        saleNumber: originalSale.sale_number,
                        returnAmount,
                        branchId,
                        userId: createdBy,
                    });
                }
                if (hasExchange && originalSale) {
                    await this.notificationService.notifyExchangeProcessed({
                        exchangeId: sale.id,
                        saleNumber: originalSale.sale_number,
                        branchId,
                        userId: createdBy,
                    });
                }
                // Check for low stock after return/exchange
                for (const ret of returnedItems) {
                    const currentStock = await client_2.prisma.stock.findUnique({
                        where: {
                            product_id_branch_id: {
                                product_id: ret.productId,
                                branch_id: branchId,
                            },
                        },
                    });
                    if (currentStock) {
                        const product = await client_2.prisma.product.findUnique({
                            where: { id: ret.productId },
                            select: { id: true, name: true },
                        });
                        if (product) {
                            const stockQty = Number(currentStock.current_quantity);
                            const minStock = Number(currentStock.minimum_quantity) || 0;
                            if (stockQty <= 0) {
                                await this.notificationService.notifyLowStock({
                                    productId: product.id,
                                    productName: product.name,
                                    currentStock: stockQty,
                                    minStock,
                                    branchId,
                                });
                            }
                            else if (stockQty <= minStock && minStock > 0) {
                                await this.notificationService.notifyLowStock({
                                    productId: product.id,
                                    productName: product.name,
                                    currentStock: stockQty,
                                    minStock,
                                    branchId,
                                });
                            }
                        }
                    }
                }
            }
            catch (error) {
                console.error('Failed to create return/exchange notification:', error);
            }
            return sale;
        });
    }
    async getRecentSaleItemsProductNameAndPrice(branchId) {
        const sale = await client_2.prisma.sale.findFirst({
            where: { branch_id: branchId },
            orderBy: { sale_date: 'desc' },
            include: {
                sale_items: {
                    orderBy: { id: 'desc' },
                    take: 5,
                    include: { product: true },
                },
            },
        });
        if (!sale || sale.sale_items.length === 0)
            return [];
        return sale.sale_items.map((item) => ({
            productName: item.product.name,
            price: item.unit_price,
        }));
    }
}
exports.SaleService = SaleService;
//# sourceMappingURL=sales.service.js.map