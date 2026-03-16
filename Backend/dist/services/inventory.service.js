"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const client_1 = require("../prisma/client");
const helpers_1 = require("../utils/helpers");
class InventoryService {
    async getDashboardStats(userRole, branchId) {
        const warehouse = await client_1.prisma.branch.findFirst({
            where: { branch_type: 'WAREHOUSE', is_active: true },
        });
        const branchFilter = userRole &&
            userRole !== 'ADMIN' &&
            userRole !== 'SUPER_ADMIN' &&
            branchId
            ? branchId
            : undefined;
        const stockWhere = {};
        if (branchFilter) {
            stockWhere.branch_id = branchFilter;
        }
        const stocks = await client_1.prisma.stock.findMany({
            where: stockWhere,
            include: {
                product: true,
                branch: true,
            },
        });
        let totalWarehouseValue = 0;
        const branchSummary = {};
        for (const s of stocks) {
            const qty = (0, helpers_1.asNumber)(s.current_quantity);
            const cost = (0, helpers_1.asNumber)(s.product.purchase_rate || s.product.purchase_rate || 0);
            const value = qty * cost;
            const bid = s.branch_id;
            if (!branchSummary[bid]) {
                branchSummary[bid] = {
                    name: s.branch.name,
                    value: 0,
                    items: 0,
                };
            }
            branchSummary[bid].value += value;
            branchSummary[bid].items += 1;
            if (s.branch.branch_type === 'WAREHOUSE') {
                totalWarehouseValue += value;
            }
        }
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const purchaseWhere = {
            purchase_date: { gte: startOfMonth },
        };
        if (branchFilter)
            purchaseWhere.warehouse_branch_id = branchFilter;
        const recentPurchases = await client_1.prisma.purchase.findMany({
            where: purchaseWhere,
            take: 5,
            orderBy: { purchase_date: 'desc' },
            include: { product: true, supplier: true },
        });
        const pendingTransfersWhere = {
            status: { in: ['PENDING', 'DISPATCHED'] },
        };
        if (branchFilter) {
            pendingTransfersWhere.OR = [
                { from_branch_id: branchFilter },
                { to_branch_id: branchFilter },
            ];
        }
        const pendingTransfers = await client_1.prisma.transfer.findMany({
            where: pendingTransfersWhere,
            take: 10,
            orderBy: { transfer_date: 'desc' },
            include: { product: true, from_branch: true, to_branch: true },
        });
        const lowStockItems = stocks.filter((s) => {
            const minQty = (0, helpers_1.asNumber)(s.product.min_qty ?? s.minimum_quantity ?? 0);
            return (0, helpers_1.asNumber)(s.current_quantity) <= minQty && minQty > 0;
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
                currentQuantity: (0, helpers_1.asNumber)(s.current_quantity),
                minThreshold: (0, helpers_1.asNumber)(s.product.min_qty ?? s.minimum_quantity ?? 0),
            })),
            warehouse,
        };
    }
    async getLowStockProducts(branchId) {
        const where = {};
        if (branchId)
            where.branch_id = branchId;
        const stocks = await client_1.prisma.stock.findMany({
            where,
            include: { product: true, branch: true },
        });
        const lowStock = stocks.filter((s) => {
            const minQty = (0, helpers_1.asNumber)(s.product.min_qty ?? s.minimum_quantity ?? 0);
            return minQty > 0 && (0, helpers_1.asNumber)(s.current_quantity) <= minQty;
        });
        return lowStock;
    }
    async getStockMovements(params) {
        const page = params.page || 1;
        const limit = params.limit || 50;
        const skip = (page - 1) * limit;
        const where = {};
        if (params.branchId &&
            params.userRole &&
            ['ADMIN', 'SUPER_ADMIN'].includes(params.userRole)) {
            where.branch_id = params.branchId;
        }
        else if (params.branchId &&
            params.userRole &&
            !['ADMIN', 'SUPER_ADMIN'].includes(params.userRole)) {
            where.branch_id = params.branchId;
        }
        if (params.productId)
            where.product_id = params.productId;
        if (params.movementType)
            where.movement_type = params.movementType;
        if (params.startDate || params.endDate) {
            where.created_at = {};
            if (params.startDate)
                where.created_at.gte = params.startDate;
            if (params.endDate)
                where.created_at.lte = params.endDate;
        }
        const [total, movements] = await Promise.all([
            client_1.prisma.stockMovement.count({ where }),
            client_1.prisma.stockMovement.findMany({
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
    async getStockByLocation(branchId, userRole) {
        const where = {};
        if (branchId &&
            userRole &&
            userRole !== 'ADMIN' &&
            userRole !== 'SUPER_ADMIN') {
            where.branch_id = branchId;
        }
        const stocks = await client_1.prisma.stock.findMany({
            where,
            include: { product: true, branch: true },
            orderBy: [{ branch_id: 'asc' }, { product_id: 'asc' }],
        });
        return stocks;
    }
    async getReports(params) {
        switch (params.type) {
            case 'valuation': {
                const where = {};
                if (params.branchId)
                    where.branch_id = params.branchId;
                const stocks = await client_1.prisma.stock.findMany({
                    where,
                    include: { product: true, branch: true },
                });
                const byLocation = {};
                for (const s of stocks) {
                    const bid = s.branch_id;
                    if (!byLocation[bid]) {
                        byLocation[bid] = { value: 0, items: [] };
                    }
                    const cost = (0, helpers_1.asNumber)(s.product.purchase_rate || 0);
                    const value = (0, helpers_1.asNumber)(s.current_quantity) * cost;
                    byLocation[bid].value += value;
                    byLocation[bid].items.push({
                        product: s.product,
                        quantity: (0, helpers_1.asNumber)(s.current_quantity),
                        value,
                    });
                }
                return { byLocation, total: Object.values(byLocation).reduce((a, b) => a + b.value, 0) };
            }
            case 'purchase': {
                const where = {};
                if (params.branchId)
                    where.warehouse_branch_id = params.branchId;
                if (params.supplierId)
                    where.supplier_id = params.supplierId;
                if (params.productId)
                    where.product_id = params.productId;
                if (params.startDate || params.endDate) {
                    where.purchase_date = {};
                    if (params.startDate)
                        where.purchase_date.gte = params.startDate;
                    if (params.endDate)
                        where.purchase_date.lte = params.endDate;
                }
                const purchases = await client_1.prisma.purchase.findMany({
                    where,
                    include: { product: true, supplier: true, warehouse_branch: true },
                    orderBy: { purchase_date: 'desc' },
                });
                return purchases;
            }
            case 'transfer': {
                const where = {};
                if (params.branchId) {
                    where.OR = [
                        { from_branch_id: params.branchId },
                        { to_branch_id: params.branchId },
                    ];
                }
                if (params.productId)
                    where.product_id = params.productId;
                if (params.startDate || params.endDate) {
                    where.transfer_date = {};
                    if (params.startDate)
                        where.transfer_date.gte = params.startDate;
                    if (params.endDate)
                        where.transfer_date.lte = params.endDate;
                }
                const transfers = await client_1.prisma.transfer.findMany({
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
                const where = {
                    movement_type: { in: ['SALE', 'DAMAGE', 'LOSS', 'EXPIRED'] },
                };
                if (params.branchId)
                    where.branch_id = params.branchId;
                if (params.productId)
                    where.product_id = params.productId;
                if (params.startDate || params.endDate) {
                    where.created_at = {};
                    if (params.startDate)
                        where.created_at.gte = params.startDate;
                    if (params.endDate)
                        where.created_at.lte = params.endDate;
                }
                const movements = await client_1.prisma.stockMovement.findMany({
                    where,
                    include: { product: true, branch: true },
                    orderBy: { created_at: 'desc' },
                });
                return movements;
            }
            case 'lowstock': {
                const stocks = await client_1.prisma.stock.findMany({
                    where: params.branchId ? { branch_id: params.branchId } : {},
                    include: { product: true, branch: true },
                });
                return stocks.filter((s) => {
                    const minQty = (0, helpers_1.asNumber)(s.product.min_qty ?? s.minimum_quantity ?? 0);
                    return minQty > 0 && (0, helpers_1.asNumber)(s.current_quantity) <= minQty;
                });
            }
            default:
                return [];
        }
    }
}
exports.InventoryService = InventoryService;
//# sourceMappingURL=inventory.service.js.map