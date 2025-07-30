import { Request, Response } from 'express';
import { ProductService } from '../services/product.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';
import { parse as csvParse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const productService = new ProductService();

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.createProduct(req.body);
    new ApiResponse(product, 'Product created successfully', 201).send(res);
    
    if (req.files?.length) {
        await productService.processProductImages(
            product.id,
            req.files as Express.Multer.File[]
        )
    }
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.getProductById(req.params.id);
    new ApiResponse(product, 'Product retrieved successfully').send(res);
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.updateProduct(req.params.id, req.body);
    new ApiResponse(product, 'Product updated successfully').send(res);
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
        branch_id
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
    });
    console.log(result);

    new ApiResponse(result.data, 'Products retrieved successfully', 200).send(res);
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

    // Validate and create products
    const results = [];
    for (const prod of products) {
        try {
            // Enhanced product data that can include relation names
            const enhancedProd = {
                name: prod.name,
                purchase_rate: Number(prod.purchase_rate),
                sales_rate_exc_dis_and_tax: Number(prod.sales_rate_exc_dis_and_tax),
                sales_rate_inc_dis_and_tax: Number(prod.sales_rate_inc_dis_and_tax),
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
                sku: prod.sku,
                discount_amount: prod.discount_amount ? Number(prod.discount_amount) : 0,
                // Relation names from sheet (will be converted to IDs)
                unit_name: prod.unit_name || prod.unit,
                category_name: prod.category_name || prod.category,
                subcategory_name: prod.subcategory_name || prod.subcategory,
                tax_name: prod.tax_name || prod.tax,
                supplier_name: prod.supplier_name || prod.supplier,
                brand_name: prod.brand_name || prod.brand,
                color_name: prod.color_name || prod.color,
                size_name: prod.size_name || prod.size,
            };

            // Validate required fields
            if (!enhancedProd.name || isNaN(enhancedProd.purchase_rate) || isNaN(enhancedProd.sales_rate_exc_dis_and_tax) || isNaN(enhancedProd.sales_rate_inc_dis_and_tax)) {
                throw new Error('Missing required fields: name, purchase_rate, sales_rate_exc_dis_and_tax, sales_rate_inc_dis_and_tax');
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