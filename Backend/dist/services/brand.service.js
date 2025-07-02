"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrandService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
class BrandService {
    async createBrand(data) {
        const existingBrand = await client_1.prisma.brand.findFirst({
            where: { name: data.name },
        });
        if (existingBrand) {
            throw new apiError_1.AppError(400, 'Brand with this name already exists');
        }
        const lastBrand = await client_1.prisma.brand.findFirst({
            orderBy: { created_at: 'desc' },
            select: { code: true },
        });
        const newCode = lastBrand ? (parseInt(lastBrand.code) + 1).toString() : '1000';
        return client_1.prisma.brand.create({
            data: {
                ...data,
                code: newCode,
            },
        });
    }
    async getBrandById(id) {
        const brand = await client_1.prisma.brand.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });
        if (!brand)
            throw new apiError_1.AppError(404, 'Brand not found');
        return brand;
    }
    async updateBrand(id, data) {
        await this.getBrandById(id); // Verify exists
        return client_1.prisma.brand.update({
            where: { id },
            data,
        });
    }
    async toggleBrandDisplay(id) {
        const brand = await this.getBrandById(id);
        return client_1.prisma.brand.update({
            where: { id },
            data: { display_on_pos: !brand.display_on_pos },
        });
    }
    async listBrands({ page = 1, limit = 10, search, }) {
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [brands, total] = await Promise.all([
            client_1.prisma.brand.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    _count: {
                        select: { products: true },
                    },
                },
            }),
            client_1.prisma.brand.count({ where }),
        ]);
        return {
            data: brands.map(b => ({
                ...b,
                product_count: b._count.products,
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
exports.BrandService = BrandService;
//# sourceMappingURL=brand.service.js.map