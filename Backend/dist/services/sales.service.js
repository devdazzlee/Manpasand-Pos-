"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaleService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
class SaleService {
    async getSales({ branchId, page, limit, search, startDate, endDate, }) {
        const where = {
            ...(branchId ? { branch_id: branchId } : {}),
            ...(search
                ? {
                    OR: [
                        { sale_number: { contains: search, mode: 'insensitive' } },
                        { customer: { email: { contains: search, mode: 'insensitive' } } },
                        { customer: { name: { contains: search, mode: 'insensitive' } } },
                    ],
                }
                : {}),
            ...(startDate || endDate
                ? {
                    sale_date: {
                        ...(startDate ? { gte: startDate } : {}),
                        ...(endDate ? { lte: endDate } : {}),
                    },
                }
                : {}),
        };
        const include = {
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
        };
        // Backward-compatible behavior: when pagination is not requested, return all rows.
        if (!page || !limit) {
            const data = await client_2.prisma.sale.findMany({
                where,
                include,
                orderBy: { sale_date: 'desc' },
            });
            return {
                data,
                meta: {
                    total: data.length,
                    page: 1,
                    limit: data.length,
                    totalPages: 1,
                },
            };
        }
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.max(1, Number(limit) || 10);
        const skip = (safePage - 1) * safeLimit;
        const [total, data] = await Promise.all([
            client_2.prisma.sale.count({ where }),
            client_2.prisma.sale.findMany({
                where,
                include,
                orderBy: { sale_date: 'desc' },
                skip,
                take: safeLimit,
            }),
        ]);
        return {
            data,
            meta: {
                total,
                page: safePage,
                limit: safeLimit,
                totalPages: Math.max(1, Math.ceil(total / safeLimit)),
            },
        };
    }
    async getAlreadyReturnedQuantities(originalSaleId) {
        const prior = await client_2.prisma.sale.findMany({
            where: { original_sale_id: originalSaleId },
            include: {
                sale_items: { where: { item_type: client_1.SaleItemType.RETURN } },
            },
        });
        const map = new Map();
        for (const sale of prior) {
            for (const item of sale.sale_items) {
                const qty = Math.abs(item.quantity.toNumber());
                map.set(item.product_id, (map.get(item.product_id) || 0) + qty);
            }
        }
        return map;
    }
    async getReturnTransactions({ branchId, search, }) {
        const normalizedSearch = search?.replace(/\s+/g, ' ').trim();
        return client_2.prisma.sale.findMany({
            where: {
                original_sale_id: { not: null },
                ...(branchId ? { branch_id: branchId } : {}),
                ...(normalizedSearch
                    ? {
                        OR: [
                            { sale_number: { contains: normalizedSearch, mode: 'insensitive' } },
                            { customer: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
                            { customer: { email: { contains: normalizedSearch, mode: 'insensitive' } } },
                        ],
                    }
                    : {}),
            },
            include: {
                sale_items: { include: { product: true } },
                customer: true,
                original_sale: { select: { sale_number: true, total_amount: true } },
            },
            orderBy: { sale_date: 'desc' },
            take: 200,
        });
    }
    async getSalesForReturns({ branchId, search }) {
        const normalizedSearch = search?.replace(/\s+/g, ' ').trim();
        return client_2.prisma.sale.findMany({
            where: {
                branch_id: branchId,
                status: 'COMPLETED', // Only completed sales can be returned
                ...(normalizedSearch
                    ? {
                        OR: [
                            { sale_number: { contains: normalizedSearch, mode: 'insensitive' } },
                            { customer: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
                            { customer: { email: { contains: normalizedSearch, mode: 'insensitive' } } },
                        ],
                    }
                    : {}),
            },
            include: {
                sale_items: {
                    where: { item_type: client_1.SaleItemType.ORIGINAL },
                    include: { product: true },
                },
                customer: true,
            },
            orderBy: { sale_date: 'desc' },
            take: 50, // Limit results for performance
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
    async getHoldSales({ branchId }) {
        return client_2.prisma.holdSale.findMany({
            where: { branch_id: branchId },
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        });
    }
    async createHoldSale({ branchId, customerId, createdBy, items, }) {
        if (!items?.length) {
            throw new apiError_1.AppError(400, 'No items provided for hold sale');
        }
        const branch = await client_2.prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) {
            throw new apiError_1.AppError(400, 'Invalid branch');
        }
        const normalizedItems = items.map((item) => ({
            id: item.id,
            productId: item.productId,
            name: item.name,
            price: Number(item.price),
            originalPrice: Number(item.originalPrice ?? item.price),
            actualUnitPrice: Number(item.actualUnitPrice ?? item.price),
            quantity: Number(item.quantity),
            category: item.category,
            unitId: item.unitId,
            unitName: item.unitName,
            unit: item.unit,
        }));
        const subtotal = normalizedItems.reduce((sum, item) => sum + (item.actualUnitPrice || item.price) * item.quantity, 0);
        return client_2.prisma.holdSale.create({
            data: {
                branch_id: branchId,
                customer_id: customerId,
                created_by: createdBy,
                items: normalizedItems,
                subtotal: new client_1.Prisma.Decimal(subtotal),
                total_items: normalizedItems.length,
            },
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });
    }
    async retrieveHoldSale({ holdSaleId, branchId, }) {
        return client_2.prisma.$transaction(async (tx) => {
            const holdSale = await tx.holdSale.findFirst({
                where: { id: holdSaleId, branch_id: branchId },
                include: {
                    branch: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });
            if (!holdSale) {
                throw new apiError_1.AppError(404, 'Hold sale not found');
            }
            await tx.holdSale.delete({
                where: { id: holdSaleId },
            });
            return holdSale;
        });
    }
    async deleteHoldSale({ holdSaleId, branchId, }) {
        const holdSale = await client_2.prisma.holdSale.findFirst({
            where: { id: holdSaleId, branch_id: branchId },
            select: { id: true },
        });
        if (!holdSale) {
            throw new apiError_1.AppError(404, 'Hold sale not found');
        }
        await client_2.prisma.holdSale.delete({ where: { id: holdSaleId } });
    }
    async createSale({ branchId, customerId, paymentMethod, items, discountAmount, createdBy, }) {
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
        const subtotalAmt = items.reduce((s, it) => s + it.price * it.quantity, 0);
        const finalDiscount = discountAmount ?? 0;
        const finalTotal = Math.max(0, subtotalAmt - finalDiscount);
        const ops = [];
        // (a) Sale + items
        ops.push(client_2.prisma.sale.create({
            data: {
                sale_number: `SALE-${Date.now()}`,
                branch_id: branchId,
                customer_id: customerId,
                total_amount: new client_1.Prisma.Decimal(finalTotal),
                subtotal: new client_1.Prisma.Decimal(subtotalAmt),
                discount_amount: new client_1.Prisma.Decimal(finalDiscount),
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
    async createExchangeOrReturnSale({ originalSaleId, branchId, customerId, returnedItems, exchangedItems, notes, createdBy, transactionType, returnScope, returnReason, refundMethod, exchangeBalanceAction, }) {
        if (!returnedItems.length && !exchangedItems.length) {
            throw new apiError_1.AppError(400, 'No return or exchange items provided');
        }
        const isExchange = exchangedItems.length > 0;
        const resolvedType = transactionType || (isExchange ? 'EXCHANGE' : 'RETURN');
        const uniqueProductIds = [...new Set([
                ...returnedItems.map((item) => item.productId),
                ...exchangedItems.map((item) => item.productId),
            ])];
        const uniqueExchangeProductIds = [...new Set(exchangedItems.map((item) => item.productId))];
        const originalSale = await client_2.prisma.sale.findUnique({
            where: { id: originalSaleId },
            include: {
                sale_items: { where: { item_type: client_1.SaleItemType.ORIGINAL } },
            },
        });
        if (!originalSale)
            throw new apiError_1.AppError(400, 'Original sale not found');
        if (originalSale.status === client_1.SaleStatus.CANCELLED) {
            throw new apiError_1.AppError(400, 'Cancelled sales cannot be returned');
        }
        if (originalSale.status === client_1.SaleStatus.PENDING) {
            throw new apiError_1.AppError(400, 'Pending sales cannot be returned');
        }
        const alreadyReturned = await this.getAlreadyReturnedQuantities(originalSaleId);
        const resolvedBranchId = (branchId && branchId.trim()) || originalSale.branch_id || null;
        if (!resolvedBranchId) {
            throw new apiError_1.AppError(400, 'Branch is required for a refund/exchange. Provide branchId in the request, or assign a branch to the original sale.');
        }
        const [branch, customer, exchangeProducts, stocks] = await Promise.all([
            client_2.prisma.branch.findUnique({
                where: { id: resolvedBranchId },
                select: { id: true },
            }),
            customerId
                ? client_2.prisma.customer.findUnique({
                    where: { id: customerId },
                    select: { id: true },
                })
                : Promise.resolve(null),
            uniqueExchangeProductIds.length
                ? client_2.prisma.product.findMany({
                    where: { id: { in: uniqueExchangeProductIds } },
                    select: { id: true, name: true },
                })
                : Promise.resolve([]),
            uniqueProductIds.length
                ? client_2.prisma.stock.findMany({
                    where: {
                        product_id: { in: uniqueProductIds },
                        branch_id: resolvedBranchId,
                    },
                })
                : Promise.resolve([]),
        ]);
        if (!branch)
            throw new apiError_1.AppError(400, 'Invalid branch');
        if (customerId && !customer)
            throw new apiError_1.AppError(400, 'Invalid customer');
        const foundExchangeProductIds = new Set(exchangeProducts.map((product) => product.id));
        const missingExchangeProductIds = uniqueExchangeProductIds.filter((productId) => !foundExchangeProductIds.has(productId));
        if (missingExchangeProductIds.length > 0) {
            throw new apiError_1.AppError(400, `Products not found: ${missingExchangeProductIds.join(', ')}`);
        }
        for (const ret of returnedItems) {
            const originalItem = originalSale.sale_items.find((item) => item.product_id === ret.productId);
            if (!originalItem) {
                throw new apiError_1.AppError(400, `Product ${ret.productId} not found in original sale`);
            }
            const purchased = originalItem.quantity.toNumber();
            const prior = alreadyReturned.get(ret.productId) || 0;
            const remaining = purchased - prior;
            if (ret.quantity > remaining) {
                throw new apiError_1.AppError(400, `Return quantity (${ret.quantity}) exceeds remaining returnable quantity (${remaining}) for this product`);
            }
        }
        const stockQuantityMap = new Map(stocks.map((stock) => [stock.product_id, new client_1.Prisma.Decimal(stock.current_quantity)]));
        const saleItems = [];
        const movementRows = [];
        const stockNetChanges = new Map();
        let total = new client_1.Prisma.Decimal(0);
        let returnValue = new client_1.Prisma.Decimal(0);
        let exchangeValue = new client_1.Prisma.Decimal(0);
        const itemDispositions = {};
        const recordMovement = ({ productId, change, movementType, referenceType, notes: movementNote, }) => {
            const previousQty = stockQuantityMap.get(productId) ?? new client_1.Prisma.Decimal(0);
            const newQty = previousQty.plus(change);
            stockQuantityMap.set(productId, newQty);
            stockNetChanges.set(productId, (stockNetChanges.get(productId) ?? new client_1.Prisma.Decimal(0)).plus(change));
            movementRows.push({
                product_id: productId,
                movement_type: movementType,
                quantity_change: change,
                previous_qty: previousQty,
                new_qty: newQty,
                reference_type: referenceType,
                notes: movementNote,
            });
        };
        for (const ret of returnedItems) {
            const originalItem = originalSale.sale_items.find((item) => item.product_id === ret.productId);
            if (!originalItem) {
                throw new apiError_1.AppError(400, `Product ${ret.productId} not in original sale`);
            }
            const disposition = ret.disposition || 'RESTOCK';
            itemDispositions[ret.productId] = disposition;
            const returnQuantity = new client_1.Prisma.Decimal(ret.quantity);
            const lineTotal = new client_1.Prisma.Decimal(originalItem.unit_price).mul(returnQuantity).mul(-1);
            total = total.plus(lineTotal);
            returnValue = returnValue.plus(lineTotal.abs());
            if (disposition === 'RESTOCK') {
                recordMovement({
                    productId: ret.productId,
                    change: returnQuantity,
                    movementType: client_1.StockMovementType.RETURN,
                    referenceType: resolvedType === 'EXCHANGE' ? 'exchange' : 'return',
                    notes: `Returned by customer (${disposition.toLowerCase()})`,
                });
            }
            saleItems.push({
                product_id: ret.productId,
                quantity: returnQuantity.mul(-1),
                unit_price: originalItem.unit_price,
                tax_rate: originalItem.tax_rate,
                discount_rate: originalItem.discount_rate,
                tax_amount: new client_1.Prisma.Decimal(0),
                discount_amount: new client_1.Prisma.Decimal(0),
                line_total: lineTotal,
                item_type: client_1.SaleItemType.RETURN,
                ref_sale_item_id: originalItem.id,
            });
        }
        for (const item of exchangedItems) {
            const exchangeQuantity = new client_1.Prisma.Decimal(item.quantity);
            const unitPrice = new client_1.Prisma.Decimal(item.price);
            const lineTotal = unitPrice.mul(exchangeQuantity);
            total = total.plus(lineTotal);
            exchangeValue = exchangeValue.plus(lineTotal);
            recordMovement({
                productId: item.productId,
                change: exchangeQuantity.mul(-1),
                movementType: client_1.StockMovementType.SALE,
                referenceType: 'exchange',
                notes: 'Exchanged to customer',
            });
            saleItems.push({
                product_id: item.productId,
                quantity: exchangeQuantity,
                unit_price: unitPrice,
                tax_rate: new client_1.Prisma.Decimal(0),
                discount_rate: new client_1.Prisma.Decimal(0),
                tax_amount: new client_1.Prisma.Decimal(0),
                discount_amount: new client_1.Prisma.Decimal(0),
                line_total: lineTotal,
                item_type: client_1.SaleItemType.EXCHANGE,
            });
        }
        const balanceDue = total.toNumber();
        const inferredScope = returnScope ||
            (returnedItems.every((ret) => {
                const originalItem = originalSale.sale_items.find((i) => i.product_id === ret.productId);
                if (!originalItem)
                    return false;
                const prior = alreadyReturned.get(ret.productId) || 0;
                return ret.quantity >= originalItem.quantity.toNumber() - prior;
            }) &&
                originalSale.sale_items.every((orig) => {
                    const retQty = returnedItems.find((r) => r.productId === orig.product_id)?.quantity || 0;
                    const prior = alreadyReturned.get(orig.product_id) || 0;
                    return retQty >= orig.quantity.toNumber() - prior;
                })
                ? 'FULL'
                : 'PARTIAL');
        const mapRefundMethod = (method) => {
            switch (method) {
                case 'cash':
                    return client_1.PaymentMethod.CASH;
                case 'card':
                    return client_1.PaymentMethod.CARD;
                case 'bank_transfer':
                    return client_1.PaymentMethod.BANK_TRANSFER;
                case 'store_credit':
                    return client_1.PaymentMethod.CREDIT;
                case 'original_payment':
                    return originalSale.payment_method;
                case 'no_refund':
                    return originalSale.payment_method;
                default:
                    return client_1.PaymentMethod.CASH;
            }
        };
        const meta = {
            transactionType: resolvedType,
            returnScope: inferredScope,
            returnReason: returnReason || null,
            refundMethod: refundMethod || null,
            exchangeBalanceAction: exchangeBalanceAction || null,
            status: 'COMPLETED',
            returnValue: returnValue.toNumber(),
            exchangeValue: exchangeValue.toNumber(),
            balanceDue,
            itemDispositions,
        };
        const structuredNotes = `__META__${JSON.stringify(meta)}__ENDMETA__\n${notes || ''}`.trim();
        const childStatus = resolvedType === 'EXCHANGE' ? client_1.SaleStatus.EXCHANGED : client_1.SaleStatus.REFUNDED;
        const ops = [];
        ops.push(client_2.prisma.sale.create({
            data: {
                sale_number: `RTN-${Date.now()}`,
                branch_id: resolvedBranchId,
                customer_id: customerId || originalSale.customer_id,
                original_sale_id: originalSaleId,
                notes: structuredNotes,
                subtotal: total,
                total_amount: total,
                payment_method: mapRefundMethod(refundMethod),
                payment_status: 'PAID',
                status: childStatus,
                created_by: createdBy,
                sale_items: {
                    create: saleItems,
                },
            },
            include: {
                sale_items: { include: { product: true } },
                customer: true,
                original_sale: { select: { sale_number: true, total_amount: true } },
            },
        }));
        let allFullyReturned = true;
        for (const orig of originalSale.sale_items) {
            const retThisTxn = returnedItems.find((r) => r.productId === orig.product_id)?.quantity || 0;
            const prior = alreadyReturned.get(orig.product_id) || 0;
            if (prior + retThisTxn < orig.quantity.toNumber()) {
                allFullyReturned = false;
                break;
            }
        }
        const originalNewStatus = allFullyReturned
            ? resolvedType === 'EXCHANGE'
                ? client_1.SaleStatus.EXCHANGED
                : client_1.SaleStatus.REFUNDED
            : client_1.SaleStatus.COMPLETED;
        ops.push(client_2.prisma.sale.update({
            where: { id: originalSaleId },
            data: { status: originalNewStatus },
        }));
        for (const [productId, quantityChange] of stockNetChanges.entries()) {
            if (quantityChange.isZero())
                continue;
            ops.push(client_2.prisma.stock.upsert({
                where: {
                    product_id_branch_id: {
                        product_id: productId,
                        branch_id: resolvedBranchId,
                    },
                },
                update: {
                    current_quantity: {
                        increment: quantityChange,
                    },
                },
                create: {
                    product_id: productId,
                    branch_id: resolvedBranchId,
                    current_quantity: quantityChange,
                    minimum_quantity: new client_1.Prisma.Decimal(0),
                    maximum_quantity: new client_1.Prisma.Decimal(1000),
                    reserved_quantity: new client_1.Prisma.Decimal(0),
                },
            }));
        }
        if (movementRows.length > 0) {
            ops.push(client_2.prisma.stockMovement.createMany({
                data: movementRows.map((movement) => ({
                    product_id: movement.product_id,
                    branch_id: resolvedBranchId,
                    movement_type: movement.movement_type,
                    reference_id: originalSaleId,
                    reference_type: movement.reference_type,
                    quantity_change: movement.quantity_change,
                    previous_qty: movement.previous_qty,
                    new_qty: movement.new_qty,
                    notes: movement.notes,
                    created_by: createdBy,
                })),
            }));
        }
        const [sale] = await client_2.prisma.$transaction(ops);
        return sale;
    }
    async getRecentSaleItemsProductNameAndPrice(branchId) {
        const sale = await client_2.prisma.sale.findFirst({
            where: branchId ? { branch_id: branchId } : undefined,
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