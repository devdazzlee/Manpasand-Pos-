import { Prisma, Product } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { CreateProductInput, UpdateProductInput } from '../validations/product.validation';
import { Decimal } from 'decimal.js';
import { startOfMonth } from 'date-fns';
import { s3Service } from './common/s3BucketService';

type RelationField =
    | 'unit_id' | 'tax_id' | 'category_id' | 'subcategory_id'
    | 'supplier_id' | 'brand_id' | 'color_id' | 'size_id';

export class ProductService {
    private buildProductData(data: CreateProductInput, code: string) {
        return {
            name: data.name,
            sku: data.sku,
            code,
            pct_or_hs_code: data.pct_or_hs_code,
            description: data.description,
            purchase_rate: data.purchase_rate,
            sales_rate_exc_dis_and_tax: data.sales_rate_exc_dis_and_tax,
            sales_rate_inc_dis_and_tax: data.sales_rate_inc_dis_and_tax,
            discount_amount: data.discount_amount ?? 0,
            min_qty: Number(data.min_qty) ?? 0,
            max_qty: Number(data.max_qty) ?? 0,
            is_active: data.is_active ?? true,
            display_on_pos: data.display_on_pos ?? true,
            is_batch: data.is_batch ?? false,
            auto_fill_on_demand_sheet: data.auto_fill_on_demand_sheet ?? false,
            non_inventory_item: data.non_inventory_item ?? false,
            is_deal: data.is_deal ?? false,
            is_featured: data.is_featured ?? false,
        };
    }

    private buildRelationData(data: CreateProductInput) {
        const relations: Record<string, { connect: { id: string } }> = {};
        const relationFields: RelationField[] = [
            'unit_id', 'tax_id', 'category_id', 'subcategory_id',
            'supplier_id', 'brand_id', 'color_id', 'size_id'
        ];

        relationFields.forEach(field => {
            const value = data[field];
            if (value) {
                const relationName = field.split('_')[0];
                relations[relationName] = { connect: { id: value } };
            }
        });

        return relations;
    }

    private buildRelationIncludes(data: CreateProductInput) {
        const includes: Record<string, boolean> = {};
        const relationFields: RelationField[] = [
            'unit_id', 'tax_id', 'category_id', 'subcategory_id',
            'supplier_id', 'brand_id', 'color_id', 'size_id'
        ];

        relationFields.forEach(field => {
            if (data[field]) {
                const relationName = field.split('_')[0];
                includes[relationName] = true;
            }
        });

        return includes;
    }

    async createProduct(data: CreateProductInput): Promise<Product> {
        // Validate SKU uniqueness and get last product code in parallel
        const [existingSku, lastProduct] = await Promise.all([
            prisma.product.findUnique({
                where: { sku: data.sku },
                select: { id: true }
            }),
            prisma.product.findFirst({
                orderBy: { created_at: 'desc' },
                select: { code: true }
            })
        ]);

        if (existingSku) {
            throw new AppError(400, 'Product with this SKU already exists');
        }

        const newCode = lastProduct ? (parseInt(lastProduct.code) + 1).toString() : '1000';

        // Start transaction for atomic operations
        return await prisma.$transaction(async (tx) => {
            // Create the product
            const product = await tx.product.create({
                data: {
                    ...this.buildProductData(data, newCode),
                    ...this.buildRelationData(data)
                },
                include: this.buildRelationIncludes(data)
            });

            return product;
        }, {
            maxWait: 20000, // 20 seconds
            timeout: 15000  // 15 seconds,
        });
    }

    async processProductImages(productId: string, files: Express.Multer.File[]) {
        try {
            // 1. Upload images
            const imageUrls = await s3Service.uploadMultipleImages(files);

            // 2. Create image records
            await prisma.productImage.createMany({
                data: imageUrls.map(url => ({
                    product_id: productId,
                    image: url,
                    status: 'COMPLETE'
                }))
            });

            // 3. Optional: Update product to indicate images are ready
            await prisma.product.update({
                where: { id: productId },
                data: { has_images: true }
            });
            console.log('Images processed successfully:', imageUrls);

        } catch (error) {
            const err = error as Error;
            // Mark failed attempts
            await prisma.productImage.createMany({
                data: files.map(file => ({
                    product_id: productId,
                    image: `failed-${file.originalname}`, // Required field
                    status: 'FAILED',
                    error: err.message.substring(0, 255) // Truncate if needed
                }))
            });
            throw error;
        }
    }

    async getProductById(id: string) {
        const product = await prisma.product.findUnique({
            where: { id },
            include: {
                unit: true,
                category: true,
                subcategory: true,
                tax: true,
                supplier: true,
                brand: true,
                color: true,
                size: true,
                order_items: true,
            },
        });

        if (!product) {
            throw new AppError(404, 'Product not found');
        }

        return product;
    }

    async updateProduct(id: string, data: UpdateProductInput) {
        const product = await this.getProductById(id);

        // Check if new SKU conflicts with existing
        if (data.sku && data.sku !== product.sku) {
            const existingSku = await prisma.product.findUnique({
                where: { sku: data.sku },
            });
            if (existingSku) {
                throw new AppError(400, 'Product with this SKU already exists');
            }
        }

        return prisma.product.update({
            where: { id },
            data: {
                // Scalar fields
                name: data.name,
                sku: data.sku,
                is_active: data.is_active,
                is_deal: data.is_deal,
                non_inventory_item: data.non_inventory_item,
                auto_fill_on_demand_sheet: data.auto_fill_on_demand_sheet,
                is_batch: data.is_batch,
                display_on_pos: data.display_on_pos,
                is_featured: data.is_featured,
                purchase_rate: data.purchase_rate !== undefined ? new Decimal(data.purchase_rate).toNumber() : undefined,
                sales_rate_exc_dis_and_tax: data.sales_rate_exc_dis_and_tax !== undefined ? new Decimal(data.sales_rate_exc_dis_and_tax).toNumber() : undefined,
                sales_rate_inc_dis_and_tax: data.sales_rate_inc_dis_and_tax !== undefined ? new Decimal(data.sales_rate_inc_dis_and_tax).toNumber() : undefined,
                discount_amount: data.discount_amount !== undefined ? new Decimal(data.discount_amount).toNumber() : undefined,

                // Relation fields using `connect`
                tax: data.tax_id ? { connect: { id: data.tax_id } } : undefined,
                size: data.size_id ? { connect: { id: data.size_id } } : undefined,
                color: data.color_id ? { connect: { id: data.color_id } } : undefined,
                supplier: data.supplier_id ? { connect: { id: data.supplier_id } } : undefined,
                unit: data.unit_id ? { connect: { id: data.unit_id } } : undefined,
                brand: data.brand_id ? { connect: { id: data.brand_id } } : undefined,
                subcategory: data.subcategory_id ? { connect: { id: data.subcategory_id } } : undefined,
                category: data.category_id ? { connect: { id: data.category_id } } : undefined,
            },
            include: {
                unit: true,
                category: true,
                subcategory: true,
                tax: true,
                supplier: true,
                brand: true,
                color: true,
                size: true,
            },
        });
    }

    async toggleProductStatus(id: string) {
        const product = await this.getProductById(id);
        return prisma.product.update({
            where: { id },
            data: { is_active: !product.is_active },
        });
    }

    async listProducts({
        page = 1,
        limit = 10,
        search,
        category_id,
        subcategory_id,
        is_active = true,
        display_on_pos = true,
    }: {
        page?: number;
        limit?: number;
        search?: string;
        category_id?: string;
        subcategory_id?: string;
        is_active?: boolean;
        display_on_pos?: boolean;
    }) {
        const where: Prisma.ProductWhereInput = {};

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (category_id) {
            where.category_id = category_id;
        }

        if (subcategory_id) {
            where.subcategory_id = subcategory_id;
        }

        if (is_active !== undefined) {
            where.is_active = is_active;
        }

        if (display_on_pos !== undefined) {
            where.display_on_pos = display_on_pos;
        }

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    unit: true,
                    category: true,
                    subcategory: true,
                    size: true,
                    supplier: true,
                    brand: true,
                    color: true,
                    tax: true,
                    _count: {
                        select: { order_items: true },
                    },
                },
            }),
            prisma.product.count({ where }),
        ]);

        return {
            data: products.map(p => ({
                ...p,
                order_count: p._count.order_items,
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

    async getFeaturedProducts() {
        // Fetch featured products from the database
        return await prisma.product.findMany({
            where: {
                is_featured: true,
                is_active: true,
            },
            orderBy: {
                created_at: "desc",
            },
            take: 10,
            include: {
                ProductImage: {
                    select: {
                        image: true,
                    },
                },
                category: {
                    select: { name: true }
                },
                subcategory: {
                    select: { name: true }
                },
            },
        });
    }

    async getBestSellingProducts(limit = 10) {
        const startDate = startOfMonth(new Date());
        const endDate = new Date();

        const bestSellingActiveProductsThisMonth = await prisma.product.findMany({
            where: {
                is_active: true,
                order_items: {
                    some: {
                        created_at: {
                            gte: startDate,
                            lte: endDate,
                        },
                    },
                },
            },
            include: {
                _count: {
                    select: {
                        order_items: {
                            where: {
                                created_at: {
                                    gte: startDate,
                                    lte: endDate,
                                },
                            },
                        },
                    },
                },
            },
            orderBy: {
                order_items: {
                    _count: 'desc',
                },
            },
            take: limit,
        });

        return bestSellingActiveProductsThisMonth;
    }

    async getProductByNameSearch(name: string) {
        const products = await prisma.product.findMany({
            where: {
                name: {
                    contains: name,
                    mode: 'insensitive',
                },
                is_active: true,
            },
            include: {
                category: true,
            },
            orderBy: {
                created_at: "desc",
            },
            take: 10,
        });

        return products;
    }
}