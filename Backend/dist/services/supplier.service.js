"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupplierService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const catalog_defaults_service_1 = require("./catalog-defaults.service");
class SupplierService {
    async createSupplier(data) {
        const existingSupplier = await client_1.prisma.supplier.findFirst({
            where: { name: data.name },
        });
        if (existingSupplier)
            throw new apiError_1.AppError(400, 'Supplier already exists');
        // Existing rows use a `SUP-XXXXXX` format (random alphanumeric), not a
        // numeric sequence. The old `parseInt(lastSupplier.code)` approach
        // returned NaN against those codes — generate a fresh random suffix
        // and re-roll on the (extremely unlikely) collision.
        const generateCode = () => {
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let suffix = '';
            for (let i = 0; i < 6; i++) {
                suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
            }
            return `SUP-${suffix}`;
        };
        let newCode = generateCode();
        for (let attempt = 0; attempt < 5; attempt++) {
            const clash = await client_1.prisma.supplier.findUnique({ where: { code: newCode } });
            if (!clash)
                break;
            newCode = generateCode();
        }
        const supplier = await client_1.prisma.supplier.create({
            data: {
                ...data,
                code: newCode,
                // Default to active so a newly-created supplier is immediately
                // usable. The frontend can still override via the form.
                status: data.status ?? 'active',
            },
        });
        return supplier;
    }
    async getSupplierById(id) {
        const supplier = await client_1.prisma.supplier.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });
        if (!supplier)
            throw new apiError_1.AppError(404, 'Supplier not found');
        return supplier;
    }
    async updateSupplier(id, data) {
        await this.getSupplierById(id); // Verify exists
        return client_1.prisma.supplier.update({
            where: { id },
            data,
        });
    }
    async toggleSupplierStatus(id) {
        const supplier = await this.getSupplierById(id);
        const newStatus = supplier.status === 'active' ? 'inactive' : 'active';
        return client_1.prisma.supplier.update({
            where: { id },
            data: { status: newStatus },
        });
    }
    async deleteSupplier(id) {
        const supplier = await client_1.prisma.supplier.findUnique({ where: { id } });
        if (!supplier)
            throw new apiError_1.AppError(404, 'Supplier not found');
        await client_1.prisma.$transaction(async (tx) => {
            const defaultSupplierId = await catalog_defaults_service_1.catalogDefaults.ensureDefaultSupplier(tx, id);
            await tx.product.updateMany({
                where: { supplier_id: id },
                data: { supplier_id: defaultSupplierId },
            });
            await tx.purchaseOrder.updateMany({
                where: { supplier_id: id },
                data: { supplier_id: defaultSupplierId },
            });
            await tx.purchase.updateMany({
                where: { supplier_id: id },
                data: { supplier_id: defaultSupplierId },
            });
            await tx.supplier.delete({ where: { id } });
        }, catalog_defaults_service_1.catalogDeleteOptions);
        return { message: 'Supplier deleted successfully' };
    }
    async listSuppliers({ page = 1, limit = 10, search, is_active, display_on_pos, fetch_all, }) {
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { phone_number: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (is_active !== undefined) {
            where.is_active = is_active;
        }
        if (display_on_pos !== undefined) {
            where.display_on_pos = display_on_pos;
        }
        const take = fetch_all ? 1000 : limit;
        const skip = fetch_all ? 0 : (page - 1) * limit;
        const [suppliers, total] = await Promise.all([
            client_1.prisma.supplier.findMany({
                where,
                skip,
                take,
                orderBy: { created_at: 'desc' },
                include: {
                    _count: {
                        select: { products: true },
                    },
                },
            }),
            client_1.prisma.supplier.count({ where }),
        ]);
        return {
            data: suppliers.map(s => ({
                ...s,
                product_count: s._count.products,
                _count: undefined,
            })),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}
exports.SupplierService = SupplierService;
//# sourceMappingURL=supplier.service.js.map