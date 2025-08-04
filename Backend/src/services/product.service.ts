import { Prisma, Product } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { CreateProductInput, UpdateProductInput } from '../validations/product.validation';
import { Decimal } from 'decimal.js';
import { startOfMonth } from 'date-fns';
import { s3Service } from './common/s3BucketService';
import { randomUUID } from 'crypto';
import { asNumber } from '../utils/helpers';


type RelationField =
    | 'unit_id' | 'tax_id' | 'category_id' | 'subcategory_id'
    | 'supplier_id' | 'brand_id' | 'color_id' | 'size_id';

type Numeric = number | Prisma.Decimal

export class ProductService {
    private async getOrCreateUnknownEntry(modelName: string, codePrefix: string, tx?: any) {
        const unknownName = 'Unknown';
        const unknownCode = `${codePrefix}-UNKNOWN`;
        
        // Use transaction context if provided, otherwise use regular prisma
        const prismaClient = tx || prisma;
        
        try {
            console.log(`🔍 Looking for existing ${modelName} with name: "${unknownName}"`);
            
            // Try to find existing unknown entry
            let unknownEntry = await prismaClient[modelName].findFirst({
                where: { name: unknownName }
            });

            if (unknownEntry) {
                console.log(`✅ Found existing ${modelName} with ID: ${unknownEntry.id}`);
            } else {
                console.log(`❌ No existing ${modelName} found, creating new one...`);
                
                // If not found, create it
                const timestamp = Date.now().toString().slice(-6);
                const uniqueSlug = `unknown-${timestamp}`;
                
                // Create data object with any type to allow additional properties
                let modelData: any = {
                    name: unknownName,
                    code: unknownCode,
                    is_active: true,
                    display_on_pos: true,
                };

                // Add model-specific fields
                switch (modelName) {
                    case 'tax':
                        modelData.percentage = 0;
                        break;
                    case 'category':
                        modelData.slug = uniqueSlug;
                        break;
                    case 'subcategory':
                        // Subcategory doesn't have slug field, so just use base data
                        break;
                    case 'unit':
                    case 'supplier':
                    case 'brand':
                    case 'color':
                    case 'size':
                        // These models only need base data
                        break;
                }
                
                console.log(`📝 Creating ${modelName} with data:`, modelData);
                
                unknownEntry = await prismaClient[modelName].create({
                    data: modelData
                });
                
                console.log(`✅ Created ${modelName} with ID: ${unknownEntry.id}`);
            }

            return unknownEntry.id;
        } catch (error) {
            console.error(`❌ Error in getOrCreateUnknownEntry for ${modelName}:`, error);
            throw error;
        }
    }

    private async getOrCreateEntryByName(modelName: string, entryName: string, codePrefix: string, tx?: any) {
        if (!entryName || entryName.trim() === '') {
            // If no name provided, use unknown entry
            return await this.getOrCreateUnknownEntry(modelName, codePrefix, tx);
        }

        const trimmedName = entryName.trim();
        
        // Use transaction context if provided, otherwise use regular prisma
        const prismaClient = tx || prisma;
        
        try {
            console.log(`🔍 Looking for existing ${modelName} with name: "${trimmedName}"`);
            
            // Try to find existing entry by name
            let entry = await prismaClient[modelName].findFirst({
                where: { name: trimmedName }
            });

            if (entry) {
                console.log(`✅ Found existing ${modelName} with ID: ${entry.id}`);
            } else {
                console.log(`❌ No existing ${modelName} found, creating new one...`);
                
                // If not found, create it
                const timestamp = Date.now().toString().slice(-6);
                const uniqueSlug = `${trimmedName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}`;
                
                // Get last entry for code generation
                const lastEntry = await prismaClient[modelName].findFirst({
                    orderBy: { created_at: 'desc' },
                    select: { code: true }
                });
                
                let newCode = `${Date.now().toString().slice(-4)}-${randomUUID().slice(0, 5)}`;

                if (lastEntry && lastEntry.code) {
                    const lastCodeNum = parseInt(lastEntry.code);
                    newCode = !isNaN(lastCodeNum) ? (lastCodeNum + 1).toString() : `${Date.now().toString().slice(-6)}`;
                }                
                
                // Create data object with any type to allow additional properties
                let modelData: any = {
                    name: trimmedName,
                    code: newCode,
                    is_active: true,
                    display_on_pos: true,
                };

                // Add model-specific fields
                switch (modelName) {
                    case 'tax':
                        modelData.percentage = 0;
                        break;
                    case 'category':
                        modelData.slug = uniqueSlug;
                        break;
                    case 'subcategory':
                        // Subcategory doesn't have slug field, so just use base data
                        break;
                    case 'unit':
                    case 'supplier':
                    case 'brand':
                    case 'color':
                    case 'size':
                        // These models only need base data
                        break;
                }
                
                console.log(`📝 Creating ${modelName} with data:`, modelData);
                
                entry = await prismaClient[modelName].create({
                    data: modelData
                });
                
                console.log(`✅ Created ${modelName} with ID: ${entry.id}`);
            }

            return entry.id;
        } catch (error) {
            console.error(`❌ Error in getOrCreateEntryByName for ${modelName}:`, error);
            throw error;
        }
    }

    private async generateSKU(productName: string): Promise<string> {
        // Generate a simple SKU based on product name and timestamp
        const timestamp = Date.now().toString().slice(-6);
        const namePrefix = productName.substring(0, 3).toUpperCase().replace(/\s/g, '');
        const sku = `${namePrefix}${timestamp}`;
        
        // Check if SKU already exists
        const existingSku = await prisma.product.findUnique({
            where: { sku },
            select: { id: true }
        });

        if (existingSku) {
            // If exists, add a random suffix
            const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
            return `${sku}${randomSuffix}`;
        }

        return sku;
    }

    private buildProductData(data: CreateProductInput, code: string) {
        const productData: any = {
            name: data.name,
            sku: data.sku || '', // Will be set in createProduct method
            code,
            purchase_rate: data.purchase_rate,
            sales_rate_exc_dis_and_tax: data.sales_rate_exc_dis_and_tax,
            sales_rate_inc_dis_and_tax: data.sales_rate_inc_dis_and_tax,
            discount_amount: data.discount_amount ?? 0,
            min_qty: data.min_qty ?? 10,
            max_qty: data.max_qty ?? 10,
            is_active: data.is_active ?? true,
            display_on_pos: data.display_on_pos ?? true,
            is_batch: data.is_batch ?? false,
            auto_fill_on_demand_sheet: data.auto_fill_on_demand_sheet ?? false,
            non_inventory_item: data.non_inventory_item ?? false,
            is_deal: data.is_deal ?? false,
            is_featured: data.is_featured ?? false,
        };

        // Only add optional fields if they have values
        if (data.pct_or_hs_code !== undefined) {
            productData.pct_or_hs_code = data.pct_or_hs_code;
        }
        if (data.description !== undefined) {
            productData.description = data.description;
        }

        return productData;
    }

    private buildUpdateProductData(data: UpdateProductInput) {
        const updateData: any = {};
        
        if (data.name !== undefined) updateData.name = data.name;
        if (data.sku !== undefined) updateData.sku = data.sku;
        if (data.pct_or_hs_code !== undefined) updateData.pct_or_hs_code = data.pct_or_hs_code;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.purchase_rate !== undefined) updateData.purchase_rate = new Decimal(data.purchase_rate).toNumber();
        if (data.sales_rate_exc_dis_and_tax !== undefined) updateData.sales_rate_exc_dis_and_tax = new Decimal(data.sales_rate_exc_dis_and_tax).toNumber();
        if (data.sales_rate_inc_dis_and_tax !== undefined) updateData.sales_rate_inc_dis_and_tax = new Decimal(data.sales_rate_inc_dis_and_tax).toNumber();
        if (data.discount_amount !== undefined) updateData.discount_amount = new Decimal(data.discount_amount).toNumber();
        if (data.min_qty !== undefined) updateData.min_qty = data.min_qty;
        if (data.max_qty !== undefined) updateData.max_qty = data.max_qty;
        if (data.is_active !== undefined) updateData.is_active = data.is_active;
        if (data.display_on_pos !== undefined) updateData.display_on_pos = data.display_on_pos;
        if (data.is_batch !== undefined) updateData.is_batch = data.is_batch;
        if (data.auto_fill_on_demand_sheet !== undefined) updateData.auto_fill_on_demand_sheet = data.auto_fill_on_demand_sheet;
        if (data.non_inventory_item !== undefined) updateData.non_inventory_item = data.non_inventory_item;
        if (data.is_deal !== undefined) updateData.is_deal = data.is_deal;
        if (data.is_featured !== undefined) updateData.is_featured = data.is_featured;

        return updateData;
    }

    private buildRelationIncludes(data: CreateProductInput) {
        const includes: Record<string, boolean> = {};
        const relationFields: RelationField[] = [
            'unit_id', 'tax_id', 'category_id', 'subcategory_id',
            'supplier_id', 'brand_id', 'color_id', 'size_id'
        ];

        relationFields.forEach(field => {
                const relationName = field.split('_')[0];
                includes[relationName] = true;
        });

        return includes;
    }

    async createProduct(data: CreateProductInput): Promise<Product> {
        // Generate SKU if not provided
        const sku = data.sku || await this.generateSKU(data.name);

        // Check SKU uniqueness
        const existingSku = await prisma.product.findUnique({
            where: { sku },
                select: { id: true }
        });

        if (existingSku) {
            throw new AppError(400, 'Product with this SKU already exists');
        }

        // Get last product code
        const lastProduct = await prisma.product.findFirst({
            orderBy: { created_at: 'desc' },
            select: { code: true }
        });

        const newCode = lastProduct ? (parseInt(lastProduct.code) + 1).toString() : '1000';

        // Start transaction for atomic operations
        return await prisma.$transaction(async (tx) => {
            console.log('🚀 Starting transaction for product creation...');
            
            // First, ensure all "Unknown" entries exist
            const unknownEntries = await this.ensureUnknownEntriesExist(tx);
            console.log('✅ Unknown entries ensured:', unknownEntries);
            
            // Build product data
            const productData = this.buildProductData(data, newCode);

            // Build relations using existing or unknown entries
            const relations = await this.verifyAndFixRelationsForCreate(data, this.buildRelationsWithUnknownEntries(data, unknownEntries), tx);
            console.log('📦 Relations built:', JSON.stringify(relations, null, 2));

            // Combine all data
            const finalData = {
                ...productData,
                sku,
                ...relations
            };

            console.log('📤 Final data being sent to Prisma:');
            console.log(JSON.stringify(finalData, null, 2));

            // Create the product
            const product = await tx.product.create({
                data: finalData,
                include: this.buildRelationIncludes(data)
            });

            console.log('✅ Product created successfully with ID:', product.id);
            return product;
        }, {
            maxWait: 20000, // 20 seconds
            timeout: 15000  // 15 seconds,
        });
    }

    private async ensureUnknownEntriesExist(tx: any) {
        const unknownEntries: Record<string, string> = {};
        
        const models = [
            { name: 'unit', codePrefix: 'UNIT' },
            { name: 'category', codePrefix: 'CAT' },
            { name: 'tax', codePrefix: 'TAX' },
            { name: 'supplier', codePrefix: 'SUP' },
            { name: 'brand', codePrefix: 'BRA' },
            { name: 'color', codePrefix: 'COL' },
            { name: 'size', codePrefix: 'SIZ' },
            { name: 'subcategory', codePrefix: 'SUB' }
        ];

        for (const model of models) {
            const unknownId = await this.getOrCreateUnknownEntry(model.name, model.codePrefix, tx);
            unknownEntries[model.name] = unknownId;
        }

        return unknownEntries;
    }

    private buildRelationsWithUnknownEntries(data: CreateProductInput, unknownEntries: Record<string, string>) {
        const relations: Record<string, { connect: { id: string } }> = {};
        
        // Map of field names to their corresponding model names
        const fieldToModel: Record<string, string> = {
            'unit_id': 'unit',
            'category_id': 'category',
            'tax_id': 'tax',
            'supplier_id': 'supplier',
            'brand_id': 'brand',
            'color_id': 'color',
            'size_id': 'size',
            'subcategory_id': 'subcategory'
        };

        // Process each field
        for (const [field, modelName] of Object.entries(fieldToModel)) {
            const value = (data as any)[field];
            const relationName = field.split('_')[0];
            
            if (value) {
                // Use provided ID - but we'll verify it exists in the transaction
                relations[relationName] = { connect: { id: value } };
                console.log(`✅ Using provided ${relationName} with ID: ${value}`);
            } else {
                // Use unknown entry
                const unknownId = unknownEntries[modelName];
                relations[relationName] = { connect: { id: unknownId } };
                console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
            }
        }

        console.log('📦 Final relations object:', JSON.stringify(relations, null, 2));
        return relations;
    }

    private async verifyAndFixRelationsForCreate(data: CreateProductInput, initialRelations: Record<string, { connect: { id: string } }>, tx: any) {
        const verifiedRelations: Record<string, { connect: { id: string } }> = {};
        
        // Map of field names to their corresponding model names
        const fieldToModel: Record<string, string> = {
            'unit_id': 'unit',
            'category_id': 'category',
            'tax_id': 'tax',
            'supplier_id': 'supplier',
            'brand_id': 'brand',
            'color_id': 'color',
            'size_id': 'size',
            'subcategory_id': 'subcategory'
        };

        // Verify each relation
        for (const [field, modelName] of Object.entries(fieldToModel)) {
            const value = (data as any)[field];
            const relationName = field.split('_')[0];
            
            if (value) {
                // Verify the provided ID exists
                try {
                    const existingRecord = await tx[modelName].findUnique({
                        where: { id: value },
                        select: { id: true }
                    });
                    
                    if (existingRecord) {
                        verifiedRelations[relationName] = { connect: { id: value } };
                        console.log(`✅ Verified existing ${relationName} with ID: ${value}`);
                    } else {
                        // ID doesn't exist, use unknown entry
                        const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                        verifiedRelations[relationName] = { connect: { id: unknownId } };
                        console.log(`❌ Provided ${relationName} ID ${value} not found, using unknown with ID: ${unknownId}`);
                    }
                } catch (error) {
                    // Error occurred, use unknown entry
                    const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                    verifiedRelations[relationName] = { connect: { id: unknownId } };
                    console.log(`❌ Error verifying ${relationName} ID ${value}, using unknown with ID: ${unknownId}`);
                }
            } else {
                // Use unknown entry
                const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                verifiedRelations[relationName] = { connect: { id: unknownId } };
                console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
            }
        }

        return verifiedRelations;
    }

    private async verifyAndFixRelationsForUpdate(data: UpdateProductInput, initialRelations: Record<string, { connect: { id: string } }>, tx: any) {
        const verifiedRelations: Record<string, { connect: { id: string } }> = {};
        
        // Map of field names to their corresponding model names
        const fieldToModel: Record<string, string> = {
            'unit_id': 'unit',
            'category_id': 'category',
            'tax_id': 'tax',
            'supplier_id': 'supplier',
            'brand_id': 'brand',
            'color_id': 'color',
            'size_id': 'size',
            'subcategory_id': 'subcategory'
        };

        // Verify each relation that was provided in the update
        for (const [field, modelName] of Object.entries(fieldToModel)) {
            const value = (data as any)[field];
            if (value !== undefined) { // Only process fields that are explicitly provided
                const relationName = field.split('_')[0];
                
                if (value) {
                    // Verify the provided ID exists
                    try {
                        const existingRecord = await tx[modelName].findUnique({
                            where: { id: value },
                            select: { id: true }
                        });
                        
                        if (existingRecord) {
                            verifiedRelations[relationName] = { connect: { id: value } };
                            console.log(`✅ Verified existing ${relationName} with ID: ${value}`);
                        } else {
                            // ID doesn't exist, use unknown entry
                            const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                            verifiedRelations[relationName] = { connect: { id: unknownId } };
                            console.log(`❌ Provided ${relationName} ID ${value} not found, using unknown with ID: ${unknownId}`);
                        }
                    } catch (error) {
                        // Error occurred, use unknown entry
                        const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                        verifiedRelations[relationName] = { connect: { id: unknownId } };
                        console.log(`❌ Error verifying ${relationName} ID ${value}, using unknown with ID: ${unknownId}`);
                    }
                } else {
                    // Use unknown entry for null/empty values
                    const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                    verifiedRelations[relationName] = { connect: { id: unknownId } };
                    console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
                }
            }
        }

        return verifiedRelations;
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

        // Use transaction for atomic operations
        return await prisma.$transaction(async (tx) => {
            console.log('🚀 Starting transaction for product update...');
            
            // First, ensure all "Unknown" entries exist
            const unknownEntries = await this.ensureUnknownEntriesExist(tx);
            console.log('✅ Unknown entries ensured:', unknownEntries);
            
            // Build relations using existing or unknown entries
            const relations = await this.verifyAndFixRelationsForUpdate(data, this.buildUpdateRelationsWithUnknownEntries(data, unknownEntries), tx);
            console.log('📦 Update relations built:', JSON.stringify(relations, null, 2));

            return tx.product.update({
            where: { id },
            data: {
                // Scalar fields
                    ...this.buildUpdateProductData(data),

                    // Relation fields using the relations object
                    ...relations,
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
        }, {
            maxWait: 20000, // 20 seconds
            timeout: 15000  // 15 seconds,
        });
    }

    private buildUpdateRelationsWithUnknownEntries(data: UpdateProductInput, unknownEntries: Record<string, string>) {
        const relations: Record<string, { connect: { id: string } }> = {};
        
        // Map of field names to their corresponding model names
        const fieldToModel: Record<string, string> = {
            'unit_id': 'unit',
            'category_id': 'category',
            'tax_id': 'tax',
            'supplier_id': 'supplier',
            'brand_id': 'brand',
            'color_id': 'color',
            'size_id': 'size',
            'subcategory_id': 'subcategory'
        };

        // Process each field that is provided in the update
        for (const [field, modelName] of Object.entries(fieldToModel)) {
            const value = (data as any)[field];
            if (value !== undefined) { // Only process fields that are explicitly provided
                const relationName = field.split('_')[0];
                
                if (value) {
                    // Use provided ID - will be verified in verifyAndFixRelations
                    relations[relationName] = { connect: { id: value } };
                    console.log(`✅ Using provided ${relationName} with ID: ${value}`);
                } else {
                    // Use unknown entry for null/empty values
                    const unknownId = unknownEntries[modelName];
                    relations[relationName] = { connect: { id: unknownId } };
                    console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
                }
            }
        }

        return relations;
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
        branch_id,
    }: {
        page?: number;
        limit?: number;
        search?: string;
        category_id?: string;
        subcategory_id?: string;
        is_active?: boolean;
        display_on_pos?: boolean;
        branch_id?: string;
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
                    stock: branch_id ? {
                        where: { branch_id },
                        select: {
                            current_quantity: true,
                            reserved_quantity: true,
                            minimum_quantity: true,
                            maximum_quantity: true,
                        }
                    } : true,
                    _count: {
                        select: { order_items: true },
                    },
                },
            }),
            prisma.product.count({ where }),
        ]);
        console.log("products >>>", products)
        return {
            data: products.map(p => {
                // Calculate available stock
                let currentStock: Numeric = 0;
                let reservedStock: Numeric = 0;
                let minimumStock: Numeric = 0;
                let maximumStock: Numeric = 0;

                if (branch_id && p.stock && Array.isArray(p.stock) && p.stock.length > 0) {
                    // Single branch stock
                    const stockData = p.stock[0];
                    currentStock = stockData.current_quantity || 0;
                    reservedStock = stockData.reserved_quantity || 0;
                    minimumStock = stockData.minimum_quantity || 0;
                    maximumStock = stockData.maximum_quantity || 0;
                } else if (p.stock && Array.isArray(p.stock)) {
                    // Multiple branches - sum up all stock
                    p.stock.forEach((stockItem: any) => {
                        currentStock += stockItem.current_quantity || 0;
                        reservedStock += stockItem.reserved_quantity || 0;
                        minimumStock += stockItem.minimum_quantity || 0;
                        maximumStock += stockItem.maximum_quantity || 0;
                    });
                }

                return {
                    ...p,
                    current_stock: asNumber(currentStock),
                    reserved_stock: asNumber(reservedStock),
                    available_stock: asNumber(currentStock) - asNumber(reservedStock),
                    minimum_stock: asNumber(minimumStock),
                    maximum_stock: asNumber(maximumStock),
                    order_count: p._count.order_items,
                    _count: undefined,
                    stock: undefined, // Remove the raw stock data
                };
            }),
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

    async createProductFromBulkUpload(data: any): Promise<Product & {
        unit: any;
        category: any;
        subcategory: any;
        tax: any;
        supplier: any;
        brand: any;
        color: any;
        size: any;
    }> {
        // Generate SKU if not provided
        const sku = data.sku || await this.generateSKU(data.name);

        // Check SKU uniqueness
        const existingSku = await prisma.product.findUnique({
            where: { sku },
            select: { id: true }
        });

        if (existingSku) {
            throw new AppError(400, 'Product with this SKU already exists');
        }

        // Get last product code
        const lastProduct = await prisma.product.findFirst({
            orderBy: { created_at: 'desc' },
            select: { code: true }
        });

        const newCode = lastProduct ? (parseInt(lastProduct.code) + 1).toString() : '1000';

        // Start transaction for atomic operations
        return await prisma.$transaction(async (tx) => {
            console.log('🚀 Starting transaction for bulk product creation...');
            
            // Build product data
            const productData = this.buildProductData(data, newCode);

            // Build relations using names from the sheet
            const relations = await this.buildRelationsFromNames(data, tx);
            console.log('📦 Relations built from names:', JSON.stringify(relations, null, 2));

            // Combine all data
            const finalData = {
                ...productData,
                sku,
                ...relations
            };

            console.log('📤 Final data being sent to Prisma:');
            console.log(JSON.stringify(finalData, null, 2));

            // Create the product
            const product = await tx.product.create({
                data: finalData,
                include: {
                    unit: true,
                    category: true,
                    subcategory: true,
                    tax: true,
                    supplier: true,
                    brand: true,
                    color: true,
                    size: true,
                }
            }) as Product & {
                unit: any;
                category: any;
                subcategory: any;
                tax: any;
                supplier: any;
                brand: any;
                color: any;
                size: any;
            };

            console.log('✅ Product created successfully with ID:', product.id);
            return product;
        }, {
            maxWait: 20000, // 20 seconds
            timeout: 15000  // 15 seconds,
        });
    }

    private async buildRelationsFromNames(data: any, tx: any) {
        const relations: Record<string, { connect: { id: string } }> = {};
        
        // Map of field names to their corresponding model names and code prefixes
        const fieldToModel: Record<string, { model: string, codePrefix: string }> = {
            'unit_name': { model: 'unit', codePrefix: 'UNIT' },
            'category_name': { model: 'category', codePrefix: 'CAT' },
            'tax_name': { model: 'tax', codePrefix: 'TAX' },
            'supplier_name': { model: 'supplier', codePrefix: 'SUP' },
            'brand_name': { model: 'brand', codePrefix: 'BRA' },
            'color_name': { model: 'color', codePrefix: 'COL' },
            'size_name': { model: 'size', codePrefix: 'SIZ' },
            'subcategory_name': { model: 'subcategory', codePrefix: 'SUB' }
        };

        // Process each field
        for (const [fieldName, modelInfo] of Object.entries(fieldToModel)) {
            const value = data[fieldName];
            const relationName = modelInfo.model;
            
            if (value) {
                // Use name-based lookup and creation
                const entryId = await this.getOrCreateEntryByName(modelInfo.model, value, modelInfo.codePrefix, tx);
                relations[relationName] = { connect: { id: entryId } };
                console.log(`✅ Using ${relationName} with name: "${value}" and ID: ${entryId}`);
            } else {
                // Use unknown entry
                const unknownId = await this.getOrCreateUnknownEntry(modelInfo.model, modelInfo.codePrefix, tx);
                relations[relationName] = { connect: { id: unknownId } };
                console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
            }
        }

        console.log('📦 Final relations object from names:', JSON.stringify(relations, null, 2));
        return relations;
    }
}