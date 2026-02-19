import { Request, Response } from 'express';
import { ProductService } from '../services/product.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';
import { parse as csvParse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const productService = new ProductService();

/**
 * Upload a single image to Cloudinary and return the URL.
 * This is called BEFORE create/update so the PATCH/POST body stays tiny.
 */
export const uploadProductImage = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        return new ApiResponse(null, 'No image file provided', 400).send(res);
    }
    const { imageService } = await import('../services/common/cloudinaryService');
    const url = await imageService.uploadImage(req.file);
    new ApiResponse({ url }, 'Image uploaded successfully').send(res);
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
    const { image_urls, ...productData } = req.body;
    const product = await productService.createProduct(productData);

    // Handle pre-uploaded image URLs (new flow)
    if (Array.isArray(image_urls) && image_urls.length > 0) {
        await productService.addProductImageUrls(product.id, image_urls);
    }

    // Legacy: Handle multer files (FormData uploads)
    if (req.files?.length) {
        await productService.processProductImages(
            product.id,
            req.files as Express.Multer.File[]
        );
    }

    new ApiResponse(product, 'Product created successfully', 201).send(res);
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.getProductById(req.params.id);
    new ApiResponse(product, 'Product retrieved successfully').send(res);
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
    // Separate image fields from product data
    const { new_images, existing_images, images, ...updateData } = req.body;

    const product = await productService.updateProduct(req.params.id, updateData);

    // Send response IMMEDIATELY — don't make the client wait for Cloudinary
    new ApiResponse(product, 'Product updated successfully').send(res);

    // Process images in the background AFTER response is sent
    let base64Images: string[] = [];
    if (Array.isArray(new_images) && new_images.length > 0) {
        base64Images = new_images;
    } else if (Array.isArray(images) && images.length > 0) {
        base64Images = images.filter((img: string) =>
            typeof img === 'string' && img.startsWith('data:')
        );
    }

    let keepImages: string[] = [];
    if (Array.isArray(existing_images)) {
        keepImages = existing_images;
    } else if (Array.isArray(images) && images.length > 0) {
        keepImages = images.filter((img: string) =>
            typeof img === 'string' && !img.startsWith('data:')
        );
    }

    const hasNewImages = base64Images.length > 0;
    const hasExistingImagesField = existing_images !== undefined || Array.isArray(images);

    if (hasNewImages || hasExistingImagesField) {
        productService.updateProductImagesFromBase64(product.id, base64Images, keepImages)
            .then(() => console.log(`✅ Images updated for product ${product.id}`))
            .catch((err) => console.error(`❌ Image update failed for product ${product.id}:`, err));
    }
});

export const toggleProductStatus = asyncHandler(async (req: Request, res: Response) => {
    await productService.toggleProductStatus(req.params.id);
    new ApiResponse(null, 'Product status changed successfully').send(res);
});

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
    const {
        page = 1,
        limit = 10,
        search,
        category_id,
        subcategory_id,
        is_active,
        display_on_pos,
        branch_id,
        fetch_all,
    } = req.query;

    const result = await productService.listProducts({
        page: Number(page),
        limit: Number(limit),
        search: search as string | undefined,
        category_id: category_id as string | undefined,
        subcategory_id: subcategory_id as string | undefined,
        is_active: is_active ? is_active === 'true' : undefined,
        display_on_pos: display_on_pos ? display_on_pos === 'true' : undefined,
        branch_id: branch_id as string | undefined,
        fetchAll: fetch_all ? fetch_all === 'true' : false,
    });
    console.log(result);

    new ApiResponse(result.data, 'Products retrieved successfully', 200, true, result.meta).send(res);
});

export const getFeaturedProducts = asyncHandler(async (req: Request, res: Response) => {
    console.log('Fetching featured products');
    
    const featuredProducts = await productService.getFeaturedProducts();
    new ApiResponse(featuredProducts, 'Featured products retrieved successfully', 200).send(res);
});

export const getBestSellingProducts = asyncHandler(async (req: Request, res: Response) => {
    const bestSellingProducts = await productService.getBestSellingProducts();
    new ApiResponse(bestSellingProducts, 'Best selling products retrieved successfully', 200).send(res);
});

export const bulkUploadProducts = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        return new ApiResponse(null, 'No file uploaded', 400).send(res);
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let products: any[] = [];

    if (ext === '.csv') {
        const csvString = req.file.buffer.toString('utf-8');
        products = csvParse(csvString, {
            columns: true,
            skip_empty_lines: true,
        });
    } else if (ext === '.xlsx' || ext === '.xls') {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        products = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    } else {
        return new ApiResponse(null, 'Unsupported file type', 400).send(res);
    }

    // Validate and create/update products
    const results = [];
    for (const prod of products) {
        try {
            // Map XLSX column names to our data structure
            // Handle both standard format and XLSX format (e.g., "Purchase Rate", "Selling Price")
            const purchaseRate = prod.purchase_rate || prod['Purchase Rate'] || prod['Purchase Rate'] || 0;
            const sellingPrice = prod.sales_rate_exc_dis_and_tax || prod.sales_rate_inc_dis_and_tax || 
                                prod['Selling Price'] || prod['selling_price'] || 0;
            
            // Enhanced product data that can include relation names
            const enhancedProd = {
                name: prod.name || prod.Name,
                purchase_rate: Number(purchaseRate) || 0,
                // Set both sales rates to the same value if only one is provided
                sales_rate_exc_dis_and_tax: Number(prod.sales_rate_exc_dis_and_tax || sellingPrice) || 0,
                sales_rate_inc_dis_and_tax: Number(prod.sales_rate_inc_dis_and_tax || sellingPrice) || 0,
                min_qty: Number(prod.min_qty) || 10,
                max_qty: Number(prod.max_qty) || 10,
                is_active: prod.is_active !== undefined ? Boolean(prod.is_active) : true,
                display_on_pos: prod.display_on_pos !== undefined ? Boolean(prod.display_on_pos) : true,
                is_batch: prod.is_batch !== undefined ? Boolean(prod.is_batch) : false,
                auto_fill_on_demand_sheet: prod.auto_fill_on_demand_sheet !== undefined ? Boolean(prod.auto_fill_on_demand_sheet) : false,
                non_inventory_item: prod.non_inventory_item !== undefined ? Boolean(prod.non_inventory_item) : false,
                is_deal: prod.is_deal !== undefined ? Boolean(prod.is_deal) : false,
                is_featured: prod.is_featured !== undefined ? Boolean(prod.is_featured) : false,
                description: prod.description,
                pct_or_hs_code: prod.pct_or_hs_code,
                sku: prod.sku || prod.SKU,
                discount_amount: prod.discount_amount ? Number(prod.discount_amount) : 0,
                // Relation names from sheet (will be converted to IDs)
                // Handle both standard format and XLSX format
                unit_name: prod.unit_name || prod.unit || prod.Unit,
                category_name: prod.category_name || prod.category || prod.Category,
                subcategory_name: prod.subcategory_name || prod.subcategory || prod.Subcategory,
                tax_name: prod.tax_name || prod.tax || prod.Tax,
                supplier_name: prod.supplier_name || prod.supplier || prod.Supplier,
                brand_name: prod.brand_name || prod.brand || prod.Brand,
                color_name: prod.color_name || prod.color || prod.Color,
                size_name: prod.size_name || prod.size || prod.Size,
            };

            // Validate required fields (name and at least one price)
            if (!enhancedProd.name) {
                throw new Error('Missing required field: name');
            }
            
            // For updates, we can allow missing prices (they'll just not be updated)
            // For new products, we need at least selling price
            if (!enhancedProd.sales_rate_exc_dis_and_tax && !enhancedProd.sales_rate_inc_dis_and_tax) {
                throw new Error('Missing required field: selling price');
            }

            const created = await productService.createProductFromBulkUpload(enhancedProd);
            results.push({ 
                success: true, 
                id: created.id, 
                name: created.name,
                unit: created.unit?.name || 'Unknown',
                category: created.category?.name || 'Unknown'
            });
        } catch (err) {
            results.push({ 
                success: false, 
                error: (err as Error).message, 
                data: prod 
            });
        }
    }

    new ApiResponse(results, 'Bulk upload completed').send(res);
});

export const deleteAllProducts = asyncHandler(async (req: Request, res: Response) => {
    const result = await productService.deleteAllProducts();
    new ApiResponse(
        result, 
        `Successfully deleted ${result.deletedCount} products, ${result.deletedImages} product images, ${result.deletedStocks} stock records, ${result.deletedStockMovements} stock movements, ${result.deletedSaleItems} sale items, ${result.deletedPurchaseOrderItems} purchase order items, and ${result.deletedOrderItems} order items`,
        200
    ).send(res);
});