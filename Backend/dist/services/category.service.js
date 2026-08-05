"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryService = void 0;
exports.invalidateWebCategoryCache = invalidateWebCategoryCache;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const cloudinaryService_1 = require("./common/cloudinaryService");
const catalog_defaults_service_1 = require("./catalog-defaults.service");
const webCache_1 = require("../utils/webCache");
const CATEGORY_CLOUDINARY_FOLDER = 'manpasand/categories';
const CATEGORY_IMAGE_INCLUDE = {
    CategoryImages: {
        where: { status: 'COMPLETE' },
        select: { image: true },
        take: 1,
        orderBy: { created_at: 'desc' },
    },
};
/** Single source of truth: CategoryImages table (Cloudinary URLs). */
function resolveCategoryImage(category) {
    return category.CategoryImages?.[0]?.image ?? null;
}
async function invalidateWebCategoryCache() {
    await Promise.all([
        (0, webCache_1.invalidatePattern)('home:'),
        (0, webCache_1.invalidatePattern)('categories:'),
        (0, webCache_1.invalidatePattern)('category:'),
    ]);
}
class CategoryService {
    async createCategory(data) {
        const { image_url: _imageUrl, remove_image: _removeImage, ...fields } = data;
        const [existingSlug, allCategories] = await Promise.all([
            client_1.prisma.category.findUnique({
                where: { slug: fields.slug },
            }),
            client_1.prisma.category.findMany({
                select: { code: true },
            }),
        ]);
        if (existingSlug) {
            throw new apiError_1.AppError(400, 'Category with this slug already exists');
        }
        let maxCode = 999;
        allCategories.forEach(cat => {
            const codeNum = parseInt(cat.code, 10);
            if (!isNaN(codeNum) && codeNum.toString() === cat.code) {
                if (codeNum > maxCode)
                    maxCode = codeNum;
            }
        });
        const newCode = (maxCode + 1).toString();
        return client_1.prisma.category.create({
            data: {
                ...fields,
                code: newCode,
                display_on_branches: fields.display_on_branches || [],
            },
        });
    }
    async getCategoryById(id) {
        const category = await client_1.prisma.category.findUnique({
            where: { id },
            include: {
                branch: true,
                products: {
                    where: { is_active: true },
                    select: { id: true, name: true },
                },
                ...CATEGORY_IMAGE_INCLUDE,
            },
        });
        if (!category) {
            throw new apiError_1.AppError(404, 'Category not found');
        }
        const { CategoryImages, ...rest } = category;
        return {
            ...rest,
            image: resolveCategoryImage(category),
        };
    }
    async updateCategory(id, data) {
        const { image_url: _imageUrl, remove_image: _removeImage, ...fields } = data;
        const category = await this.getCategoryById(id);
        if (fields.slug && fields.slug !== category.slug) {
            const existingSlug = await client_1.prisma.category.findUnique({
                where: { slug: fields.slug },
            });
            if (existingSlug) {
                throw new apiError_1.AppError(400, 'Category with this slug already exists');
            }
        }
        const updated = await client_1.prisma.category.update({
            where: { id },
            data: {
                ...fields,
                display_on_branches: fields.display_on_branches || category.display_on_branches,
            },
            include: CATEGORY_IMAGE_INCLUDE,
        });
        const { CategoryImages, ...rest } = updated;
        return {
            ...rest,
            image: resolveCategoryImage(updated),
        };
    }
    async toggleCategoryStatus(id) {
        const category = await this.getCategoryById(id);
        return client_1.prisma.category.update({
            where: { id },
            data: { is_active: !category.is_active },
        });
    }
    async listCategories({ page = 1, limit, search, is_active, branch_id, }) {
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (is_active !== undefined) {
            where.is_active = is_active;
        }
        if (branch_id) {
            where.branch_id = branch_id;
        }
        const shouldPaginate = typeof limit === 'number' && Number.isFinite(limit) && limit > 0;
        const [categories, total] = await Promise.all([
            client_1.prisma.category.findMany({
                where,
                skip: shouldPaginate ? (page - 1) * limit : undefined,
                take: shouldPaginate ? limit : undefined,
                orderBy: { created_at: 'desc' },
                include: {
                    branch: {
                        select: { id: true, name: true, code: true },
                    },
                    ...CATEGORY_IMAGE_INCLUDE,
                    _count: {
                        select: { products: true },
                    },
                },
            }),
            client_1.prisma.category.count({ where }),
        ]);
        return {
            data: categories.map(c => {
                const { CategoryImages, _count, ...rest } = c;
                return {
                    ...rest,
                    image: resolveCategoryImage(c),
                    product_count: _count.products,
                };
            }),
            meta: {
                total,
                page,
                limit: shouldPaginate ? limit : total,
                totalPages: shouldPaginate ? Math.ceil(total / limit) : 1,
            },
        };
    }
    async getCategories() {
        return client_1.prisma.category.findMany({
            where: { is_active: true },
            orderBy: { created_at: 'desc' },
            include: CATEGORY_IMAGE_INCLUDE,
        });
    }
    /**
     * Link a Cloudinary URL to a category (same pattern as product image_urls).
     * Replaces any existing category images.
     */
    async setCategoryImageUrl(categoryId, imageUrl) {
        const existing = await client_1.prisma.categoryImages.findMany({
            where: { category_id: categoryId, status: 'COMPLETE' },
            select: { image: true },
        });
        const oldCloudinaryUrls = existing
            .map(row => row.image)
            .filter(url => url.includes('cloudinary.com'));
        await client_1.prisma.$transaction([
            client_1.prisma.categoryImages.deleteMany({ where: { category_id: categoryId } }),
            client_1.prisma.categoryImages.create({
                data: {
                    category_id: categoryId,
                    image: imageUrl,
                    status: 'COMPLETE',
                },
            }),
        ]);
        if (oldCloudinaryUrls.length > 0) {
            await cloudinaryService_1.imageService.deleteMultipleImages(oldCloudinaryUrls);
        }
    }
    async clearCategoryImages(categoryId) {
        const existing = await client_1.prisma.categoryImages.findMany({
            where: { category_id: categoryId, status: 'COMPLETE' },
            select: { image: true },
        });
        await client_1.prisma.categoryImages.deleteMany({ where: { category_id: categoryId } });
        const cloudinaryUrls = existing
            .map(row => row.image)
            .filter(url => url.includes('cloudinary.com'));
        if (cloudinaryUrls.length > 0) {
            await cloudinaryService_1.imageService.deleteMultipleImages(cloudinaryUrls);
        }
    }
    async uploadCategoryImageFile(file) {
        return cloudinaryService_1.imageService.uploadImage(file, { folder: CATEGORY_CLOUDINARY_FOLDER });
    }
    async deleteCategory(id) {
        const category = await this.getCategoryById(id);
        await this.clearCategoryImages(id);
        await client_1.prisma.$transaction(async (tx) => {
            const defaultCategoryId = await catalog_defaults_service_1.catalogDefaults.ensureDefaultCategory(tx, id);
            await tx.product.updateMany({
                where: { category_id: id },
                data: { category_id: defaultCategoryId },
            });
            await tx.categoryImages.deleteMany({ where: { category_id: id } });
            await tx.category.delete({ where: { id: category.id } });
        }, catalog_defaults_service_1.catalogDeleteOptions);
        return category;
    }
    async deleteAllCategories() {
        return client_1.prisma.$transaction(async (tx) => {
            const deletedImages = await tx.categoryImages.deleteMany({});
            const deletedCategories = await tx.category.deleteMany({});
            return {
                deletedCount: deletedCategories.count,
                deletedImages: deletedImages.count,
            };
        });
    }
}
exports.CategoryService = CategoryService;
//# sourceMappingURL=category.service.js.map