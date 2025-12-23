"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const decimal_js_1 = require("decimal.js");
const date_fns_1 = require("date-fns");
const s3BucketService_1 = require("./common/s3BucketService");
const crypto_1 = require("crypto");
const helpers_1 = require("../utils/helpers");
class ProductService {
    async getOrCreateUnknownEntry(modelName, codePrefix, tx) {
        const unknownName = 'Unknown';
        const unknownCode = `${codePrefix}-UNKNOWN`;
        // Use transaction context if provided, otherwise use regular prisma
        const prismaClient = tx || client_2.prisma;
        try {
            console.log(`🔍 Looking for existing ${modelName} with name: "${unknownName}"`);
            // Try to find existing unknown entry
            let unknownEntry = await prismaClient[modelName].findFirst({
                where: { name: unknownName }
            });
            if (unknownEntry) {
                console.log(`✅ Found existing ${modelName} with ID: ${unknownEntry.id}`);
            }
            else {
                console.log(`❌ No existing ${modelName} found, creating new one...`);
                // If not found, create it
                const timestamp = Date.now().toString().slice(-6);
                const uniqueSlug = `unknown-${timestamp}`;
                // Create data object with any type to allow additional properties
                let modelData = {
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
        }
        catch (error) {
            console.log(`❌ Error in getOrCreateUnknownEntry for ${modelName}:`, error);
            throw error;
        }
    }
    async getOrCreateEntryByName(modelName, entryName, codePrefix, tx) {
        if (!entryName || entryName.trim() === '') {
            // If no name provided, use unknown entry
            return await this.getOrCreateUnknownEntry(modelName, codePrefix, tx);
        }
        const trimmedName = entryName.trim();
        // Use transaction context if provided, otherwise use regular prisma
        const prismaClient = tx || client_2.prisma;
        try {
            console.log(`🔍 Looking for existing ${modelName} with name: "${trimmedName}"`);
            // Try to find existing entry by name
            let entry = await prismaClient[modelName].findFirst({
                where: { name: trimmedName }
            });
            if (entry) {
                console.log(`✅ Found existing ${modelName} with ID: ${entry.id}`);
            }
            else {
                console.log(`❌ No existing ${modelName} found, creating new one...`);
                // If not found, create it
                const timestamp = Date.now().toString().slice(-6);
                const uniqueSlug = `${trimmedName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}`;
                // Get last entry for code generation
                const lastEntry = await prismaClient[modelName].findFirst({
                    orderBy: { created_at: 'desc' },
                    select: { code: true }
                });
                let newCode = `${Date.now().toString().slice(-4)}-${(0, crypto_1.randomUUID)().slice(0, 5)}`;
                if (lastEntry && lastEntry.code) {
                    const lastCodeNum = parseInt(lastEntry.code);
                    newCode = !isNaN(lastCodeNum) ? (lastCodeNum + 1).toString() : `${Date.now().toString().slice(-6)}`;
                }
                // Create data object with any type to allow additional properties
                let modelData = {
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
        }
        catch (error) {
            console.log(`❌ Error in getOrCreateEntryByName for ${modelName}:`, error);
            throw error;
        }
    }
    async generateSKU(productName) {
        // Generate a simple SKU based on product name and timestamp
        const timestamp = Date.now().toString().slice(-6);
        const namePrefix = productName.substring(0, 3).toUpperCase().replace(/\s/g, '');
        const sku = `${namePrefix}${timestamp}`;
        // Check if SKU already exists
        const existingSku = await client_2.prisma.product.findUnique({
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
    buildProductData(data, code) {
        const productData = {
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
    buildUpdateProductData(data) {
        const updateData = {};
        if (data.name !== undefined)
            updateData.name = data.name;
        // Only update SKU if explicitly provided and not empty
        if (data.sku !== undefined && data.sku !== null && data.sku !== '')
            updateData.sku = data.sku;
        if (data.pct_or_hs_code !== undefined)
            updateData.pct_or_hs_code = data.pct_or_hs_code;
        if (data.description !== undefined)
            updateData.description = data.description;
        if (data.purchase_rate !== undefined)
            updateData.purchase_rate = new decimal_js_1.Decimal(data.purchase_rate).toNumber();
        if (data.sales_rate_exc_dis_and_tax !== undefined)
            updateData.sales_rate_exc_dis_and_tax = new decimal_js_1.Decimal(data.sales_rate_exc_dis_and_tax).toNumber();
        if (data.sales_rate_inc_dis_and_tax !== undefined)
            updateData.sales_rate_inc_dis_and_tax = new decimal_js_1.Decimal(data.sales_rate_inc_dis_and_tax).toNumber();
        if (data.discount_amount !== undefined)
            updateData.discount_amount = new decimal_js_1.Decimal(data.discount_amount).toNumber();
        if (data.min_qty !== undefined)
            updateData.min_qty = data.min_qty;
        if (data.max_qty !== undefined)
            updateData.max_qty = data.max_qty;
        if (data.is_active !== undefined)
            updateData.is_active = data.is_active;
        if (data.display_on_pos !== undefined)
            updateData.display_on_pos = data.display_on_pos;
        if (data.is_batch !== undefined)
            updateData.is_batch = data.is_batch;
        if (data.auto_fill_on_demand_sheet !== undefined)
            updateData.auto_fill_on_demand_sheet = data.auto_fill_on_demand_sheet;
        if (data.non_inventory_item !== undefined)
            updateData.non_inventory_item = data.non_inventory_item;
        if (data.is_deal !== undefined)
            updateData.is_deal = data.is_deal;
        if (data.is_featured !== undefined)
            updateData.is_featured = data.is_featured;
        return updateData;
    }
    buildRelationIncludes(data) {
        const includes = {};
        const relationFields = [
            'unit_id', 'tax_id', 'category_id', 'subcategory_id',
            'supplier_id', 'brand_id', 'color_id', 'size_id'
        ];
        relationFields.forEach(field => {
            const relationName = field.split('_')[0];
            includes[relationName] = true;
        });
        return includes;
    }
    async createProduct(data) {
        // Generate SKU if not provided
        const sku = data.sku || await this.generateSKU(data.name);
        // Check SKU uniqueness
        const existingSku = await client_2.prisma.product.findUnique({
            where: { sku },
            select: { id: true }
        });
        if (existingSku) {
            throw new apiError_1.AppError(400, 'Product with this SKU already exists');
        }
        // Get last product code
        const lastProduct = await client_2.prisma.product.findFirst({
            orderBy: { created_at: 'desc' },
            select: { code: true }
        });
        const newCode = lastProduct ? (parseInt(lastProduct.code) + 1).toString() : '1000';
        // Start transaction for atomic operations
        return await client_2.prisma.$transaction(async (tx) => {
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
            timeout: 15000 // 15 seconds,
        });
    }
    async ensureUnknownEntriesExist(tx) {
        const unknownEntries = {};
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
    buildRelationsWithUnknownEntries(data, unknownEntries) {
        const relations = {};
        // Map of field names to their corresponding model names
        const fieldToModel = {
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
            const value = data[field];
            const relationName = field.split('_')[0];
            if (value) {
                // Use provided ID - but we'll verify it exists in the transaction
                relations[relationName] = { connect: { id: value } };
                console.log(`✅ Using provided ${relationName} with ID: ${value}`);
            }
            else {
                // Use unknown entry
                const unknownId = unknownEntries[modelName];
                relations[relationName] = { connect: { id: unknownId } };
                console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
            }
        }
        console.log('📦 Final relations object:', JSON.stringify(relations, null, 2));
        return relations;
    }
    async verifyAndFixRelationsForCreate(data, initialRelations, tx) {
        const verifiedRelations = {};
        // Map of field names to their corresponding model names
        const fieldToModel = {
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
            const value = data[field];
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
                    }
                    else {
                        // ID doesn't exist, use unknown entry
                        const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                        verifiedRelations[relationName] = { connect: { id: unknownId } };
                        console.log(`❌ Provided ${relationName} ID ${value} not found, using unknown with ID: ${unknownId}`);
                    }
                }
                catch (error) {
                    // Error occurred, use unknown entry
                    const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                    verifiedRelations[relationName] = { connect: { id: unknownId } };
                    console.log(`❌ Error verifying ${relationName} ID ${value}, using unknown with ID: ${unknownId}`);
                }
            }
            else {
                // Use unknown entry
                const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                verifiedRelations[relationName] = { connect: { id: unknownId } };
                console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
            }
        }
        return verifiedRelations;
    }
    async verifyAndFixRelationsForUpdate(data, initialRelations, tx) {
        const verifiedRelations = {};
        // Map of field names to their corresponding model names
        const fieldToModel = {
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
            const value = data[field];
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
                        }
                        else {
                            // ID doesn't exist, use unknown entry
                            const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                            verifiedRelations[relationName] = { connect: { id: unknownId } };
                            console.log(`❌ Provided ${relationName} ID ${value} not found, using unknown with ID: ${unknownId}`);
                        }
                    }
                    catch (error) {
                        // Error occurred, use unknown entry
                        const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                        verifiedRelations[relationName] = { connect: { id: unknownId } };
                        console.log(`❌ Error verifying ${relationName} ID ${value}, using unknown with ID: ${unknownId}`);
                    }
                }
                else {
                    // Use unknown entry for null/empty values
                    const unknownId = await this.getOrCreateUnknownEntry(modelName, modelName.toUpperCase(), tx);
                    verifiedRelations[relationName] = { connect: { id: unknownId } };
                    console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
                }
            }
        }
        return verifiedRelations;
    }
    async processProductImages(productId, files) {
        try {
            // 1. Upload images
            const imageUrls = await s3BucketService_1.s3Service.uploadMultipleImages(files);
            // 2. Create image records
            await client_2.prisma.productImage.createMany({
                data: imageUrls.map(url => ({
                    product_id: productId,
                    image: url,
                    status: 'COMPLETE'
                }))
            });
            // 3. Optional: Update product to indicate images are ready
            await client_2.prisma.product.update({
                where: { id: productId },
                data: { has_images: true }
            });
            console.log('Images processed successfully:', imageUrls);
        }
        catch (error) {
            const err = error;
            // Mark failed attempts
            await client_2.prisma.productImage.createMany({
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
    async getProductById(id) {
        const product = await client_2.prisma.product.findUnique({
            where: { id },
            include: {
                unit: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                subcategory: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                ProductImage: {
                    select: {
                        image: true,
                    },
                },
                tax: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                supplier: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                brand: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                color: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                size: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });
        if (!product) {
            throw new apiError_1.AppError(404, 'Product not found');
        }
        return product;
    }
    async updateProduct(id, data) {
        const product = await this.getProductById(id);
        // Check if new SKU conflicts with existing
        if (data.sku && data.sku !== product.sku) {
            const existingSku = await client_2.prisma.product.findUnique({
                where: { sku: data.sku },
            });
            if (existingSku) {
                throw new apiError_1.AppError(400, 'Product with this SKU already exists');
            }
        }
        // Use transaction for atomic operations
        return await client_2.prisma.$transaction(async (tx) => {
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
            timeout: 15000 // 15 seconds,
        });
    }
    buildUpdateRelationsWithUnknownEntries(data, unknownEntries) {
        const relations = {};
        // Map of field names to their corresponding model names
        const fieldToModel = {
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
            const value = data[field];
            if (value !== undefined) { // Only process fields that are explicitly provided
                const relationName = field.split('_')[0];
                if (value) {
                    // Use provided ID - will be verified in verifyAndFixRelations
                    relations[relationName] = { connect: { id: value } };
                    console.log(`✅ Using provided ${relationName} with ID: ${value}`);
                }
                else {
                    // Use unknown entry for null/empty values
                    const unknownId = unknownEntries[modelName];
                    relations[relationName] = { connect: { id: unknownId } };
                    console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
                }
            }
        }
        return relations;
    }
    async toggleProductStatus(id) {
        const product = await this.getProductById(id);
        return client_2.prisma.product.update({
            where: { id },
            data: { is_active: !product.is_active },
        });
    }
    async listProducts({ page = 1, limit = 10, search, category_id, subcategory_id, is_active = true, display_on_pos = true, branch_id, fetchAll = false, }) {
        const where = {};
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
        const normalizedLimit = limit && limit > 0 ? limit : 10;
        const pageSize = fetchAll ? 100 : normalizedLimit;
        const minimalSelect = {
            id: true,
            name: true,
            sku: true,
            purchase_rate: true,
            sales_rate_exc_dis_and_tax: true,
            sales_rate_inc_dis_and_tax: true,
            discount_amount: true,
            is_active: true,
            display_on_pos: true,
            created_at: true,
            updated_at: true,
            category: {
                select: {
                    id: true,
                    name: true,
                },
            },
            subcategory: {
                select: {
                    id: true,
                    name: true,
                },
            },
            unit: {
                select: {
                    id: true,
                    name: true,
                },
            },
            ProductImage: {
                select: {
                    image: true,
                },
            },
            stock: branch_id
                ? {
                    where: { branch_id },
                    select: {
                        current_quantity: true,
                        reserved_quantity: true,
                        minimum_quantity: true,
                        maximum_quantity: true,
                    },
                }
                : {
                    select: {
                        current_quantity: true,
                        reserved_quantity: true,
                        minimum_quantity: true,
                        maximum_quantity: true,
                        branch_id: true,
                    },
                },
            _count: {
                select: { order_items: true },
            },
        };
        const detailedSelect = {
            ...minimalSelect,
            description: true,
            tax_id: true,
            category_id: true,
            subcategory_id: true,
            supplier_id: true,
            brand_id: true,
            color_id: true,
            size_id: true,
            brand: {
                select: {
                    id: true,
                    name: true,
                },
            },
            supplier: {
                select: {
                    id: true,
                    name: true,
                },
            },
            color: {
                select: {
                    id: true,
                    name: true,
                },
            },
            size: {
                select: {
                    id: true,
                    name: true,
                },
            },
            tax: {
                select: {
                    id: true,
                    name: true,
                    percentage: true,
                },
            },
        };
        const select = fetchAll ? minimalSelect : detailedSelect;
        const fetchPage = async (pageNumber) => client_2.prisma.product.findMany({
            where,
            orderBy: { created_at: 'desc' },
            skip: (pageNumber - 1) * pageSize,
            take: pageSize,
            select,
        });
        const total = await client_2.prisma.product.count({ where });
        const chunkPageCount = Math.max(1, Math.ceil(total / pageSize));
        const paginatedTotalPages = Math.max(1, Math.ceil(total / Math.max(normalizedLimit, 1)));
        const pagesToFetch = fetchAll ? Array.from({ length: chunkPageCount }, (_, i) => i + 1) : [page];
        const pageResults = await Promise.all(pagesToFetch.map((pageNumber) => fetchPage(pageNumber)));
        const products = fetchAll ? pageResults.flat() : pageResults[0] || [];
        const mapped = products.map((p) => {
            let currentStock = new client_1.Prisma.Decimal(0);
            let reservedStock = new client_1.Prisma.Decimal(0);
            let minimumStock = new client_1.Prisma.Decimal(0);
            let maximumStock = new client_1.Prisma.Decimal(0);
            const rawStock = p.stock;
            const rawCount = p._count;
            if (branch_id && rawStock && Array.isArray(rawStock) && rawStock.length > 0) {
                const stockData = rawStock[0];
                currentStock = stockData.current_quantity || new client_1.Prisma.Decimal(0);
                reservedStock = stockData.reserved_quantity || new client_1.Prisma.Decimal(0);
                minimumStock = stockData.minimum_quantity || new client_1.Prisma.Decimal(0);
                maximumStock = stockData.maximum_quantity || new client_1.Prisma.Decimal(0);
            }
            else if (rawStock && Array.isArray(rawStock)) {
                rawStock.forEach((stockItem) => {
                    currentStock = currentStock.plus(stockItem.current_quantity || 0);
                    reservedStock = reservedStock.plus(stockItem.reserved_quantity || 0);
                    minimumStock = minimumStock.plus(stockItem.minimum_quantity || 0);
                    maximumStock = maximumStock.plus(stockItem.maximum_quantity || 0);
                });
            }
            return {
                ...p,
                current_stock: (0, helpers_1.asNumber)(currentStock),
                reserved_stock: (0, helpers_1.asNumber)(reservedStock),
                available_stock: (0, helpers_1.asNumber)(currentStock.minus(reservedStock)),
                minimum_stock: (0, helpers_1.asNumber)(minimumStock),
                maximum_stock: (0, helpers_1.asNumber)(maximumStock),
                order_count: rawCount?.order_items ?? 0,
            };
        });
        return {
            data: mapped,
            meta: {
                total,
                page: fetchAll ? 1 : page,
                limit: fetchAll ? mapped.length : normalizedLimit,
                totalPages: fetchAll ? 1 : paginatedTotalPages,
                fetchAll,
            },
        };
    }
    async getFeaturedProducts() {
        // Fetch featured products from the database
        let featuredProducts = await client_2.prisma.product.findMany({
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
        // If no featured products, return some active products as fallback
        if (featuredProducts.length === 0) {
            featuredProducts = await client_2.prisma.product.findMany({
                where: {
                    is_active: true,
                    display_on_pos: true,
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
        return featuredProducts;
    }
    async getBestSellingProducts(limit = 10) {
        const startDate = (0, date_fns_1.startOfMonth)(new Date());
        const endDate = new Date();
        const bestSellingActiveProductsThisMonth = await client_2.prisma.product.findMany({
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
    async getProductByNameSearch(name, limit) {
        const products = await client_2.prisma.product.findMany({
            where: {
                name: {
                    contains: name,
                    mode: 'insensitive',
                },
                is_active: true,
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                unit: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                ProductImage: {
                    select: {
                        image: true,
                    },
                },
            },
            orderBy: {
                created_at: "desc",
            },
            take: limit || 10,
        });
        return products;
    }
    async createProductFromBulkUpload(data) {
        // Check if product exists by SKU or name
        let existingProduct = null;
        if (data.sku) {
            existingProduct = await client_2.prisma.product.findUnique({
                where: { sku: data.sku },
                select: { id: true, code: true, sku: true }
            });
        }
        // If not found by SKU, try to find by name
        if (!existingProduct && data.name) {
            existingProduct = await client_2.prisma.product.findFirst({
                where: {
                    name: {
                        equals: data.name,
                        mode: 'insensitive'
                    }
                },
                select: { id: true, code: true, sku: true }
            });
        }
        // Generate SKU if not provided and product doesn't exist
        let sku = data.sku;
        if (!sku) {
            if (existingProduct) {
                sku = existingProduct.sku; // Use existing SKU
            }
            else {
                sku = await this.generateSKU(data.name); // Generate new SKU
            }
        }
        // Get product code
        let productCode;
        if (existingProduct) {
            productCode = existingProduct.code;
        }
        else {
            const lastProduct = await client_2.prisma.product.findFirst({
                orderBy: { created_at: 'desc' },
                select: { code: true }
            });
            productCode = lastProduct ? (parseInt(lastProduct.code) + 1).toString() : '1000';
        }
        // Start transaction for atomic operations
        return await client_2.prisma.$transaction(async (tx) => {
            console.log(existingProduct ? '🔄 Starting transaction for bulk product update...' : '🚀 Starting transaction for bulk product creation...');
            // Build product data
            const productData = existingProduct
                ? this.buildUpdateProductData(data)
                : this.buildProductData(data, productCode);
            // Build relations using names from the sheet
            const relations = await this.buildRelationsFromNames(data, tx);
            console.log('📦 Relations built from names:', JSON.stringify(relations, null, 2));
            // Combine all data
            // For updates, don't include SKU if it's empty or not provided
            // For creates, always include SKU and code
            const finalData = {
                ...productData,
                ...(existingProduct ? {} : { sku, code: productCode }),
                ...relations
            };
            // Remove empty SKU from update data to avoid conflicts
            if (existingProduct && (!data.sku || data.sku === '')) {
                delete finalData.sku;
            }
            console.log('📤 Final data being sent to Prisma:');
            console.log(JSON.stringify(finalData, null, 2));
            // Update or create the product
            const product = existingProduct
                ? await tx.product.update({
                    where: { id: existingProduct.id },
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
                })
                : await tx.product.create({
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
                });
            console.log(existingProduct ? `✅ Product updated successfully with ID: ${product.id}` : `✅ Product created successfully with ID: ${product.id}`);
            return product;
        }, {
            maxWait: 20000, // 20 seconds
            timeout: 15000 // 15 seconds,
        });
    }
    async buildRelationsFromNames(data, tx) {
        const relations = {};
        // Map of field names to their corresponding model names and code prefixes
        const fieldToModel = {
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
            }
            else {
                // Use unknown entry
                const unknownId = await this.getOrCreateUnknownEntry(modelInfo.model, modelInfo.codePrefix, tx);
                relations[relationName] = { connect: { id: unknownId } };
                console.log(`✅ Using unknown ${relationName} with ID: ${unknownId}`);
            }
        }
        console.log('📦 Final relations object from names:', JSON.stringify(relations, null, 2));
        return relations;
    }
    async deleteAllProducts() {
        // Delete all products and their related records in a transaction
        // Order matters due to foreign key constraints (ON DELETE RESTRICT)
        return await client_2.prisma.$transaction(async (tx) => {
            // 1. Delete ProductImage records (no FK constraint issues)
            const deletedImages = await tx.productImage.deleteMany({});
            // 2. Delete StockMovement records (references Product with ON DELETE RESTRICT)
            const deletedStockMovements = await tx.stockMovement.deleteMany({});
            // 3. Delete Stock records (references Product with ON DELETE RESTRICT)
            const deletedStocks = await tx.stock.deleteMany({});
            // 4. Delete SaleItem records (references Product with ON DELETE RESTRICT)
            const deletedSaleItems = await tx.saleItem.deleteMany({});
            // 5. Delete PurchaseOrderItem records (references Product with ON DELETE RESTRICT)
            const deletedPurchaseOrderItems = await tx.purchaseOrderItem.deleteMany({});
            // 6. Delete OrderItem records (references Product with ON DELETE RESTRICT)
            const deletedOrderItems = await tx.orderItem.deleteMany({});
            // 7. Finally, delete all Products
            const deletedProducts = await tx.product.deleteMany({});
            return {
                deletedCount: deletedProducts.count,
                deletedImages: deletedImages.count,
                deletedStocks: deletedStocks.count,
                deletedStockMovements: deletedStockMovements.count,
                deletedSaleItems: deletedSaleItems.count,
                deletedPurchaseOrderItems: deletedPurchaseOrderItems.count,
                deletedOrderItems: deletedOrderItems.count,
            };
        });
    }
}
exports.ProductService = ProductService;
//# sourceMappingURL=product.service.js.map