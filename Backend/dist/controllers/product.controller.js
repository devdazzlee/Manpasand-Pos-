"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAllProducts = exports.bulkUploadProducts = exports.getBestSellingProducts = exports.getFeaturedProducts = exports.listProducts = exports.toggleProductStatus = exports.updateProduct = exports.getProduct = exports.createProduct = void 0;
const product_service_1 = require("../services/product.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const sync_1 = require("csv-parse/sync");
const xlsx_1 = __importDefault(require("xlsx"));
const path_1 = __importDefault(require("path"));
const productService = new product_service_1.ProductService();
exports.createProduct = (0, asyncHandler_1.default)(async (req, res) => {
    const product = await productService.createProduct(req.body);
    new apiResponse_1.ApiResponse(product, 'Product created successfully', 201).send(res);
    if (req.files?.length) {
        await productService.processProductImages(product.id, req.files);
    }
});
exports.getProduct = (0, asyncHandler_1.default)(async (req, res) => {
    const product = await productService.getProductById(req.params.id);
    new apiResponse_1.ApiResponse(product, 'Product retrieved successfully').send(res);
});
exports.updateProduct = (0, asyncHandler_1.default)(async (req, res) => {
    const product = await productService.updateProduct(req.params.id, req.body);
    new apiResponse_1.ApiResponse(product, 'Product updated successfully').send(res);
});
exports.toggleProductStatus = (0, asyncHandler_1.default)(async (req, res) => {
    await productService.toggleProductStatus(req.params.id);
    new apiResponse_1.ApiResponse(null, 'Product status changed successfully').send(res);
});
exports.listProducts = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10, search, category_id, subcategory_id, is_active, display_on_pos, branch_id, fetch_all, } = req.query;
    const result = await productService.listProducts({
        page: Number(page),
        limit: Number(limit),
        search: search,
        category_id: category_id,
        subcategory_id: subcategory_id,
        is_active: is_active ? is_active === 'true' : undefined,
        display_on_pos: display_on_pos ? display_on_pos === 'true' : undefined,
        branch_id: branch_id,
        fetchAll: fetch_all ? fetch_all === 'true' : false,
    });
    console.log(result);
    new apiResponse_1.ApiResponse(result.data, 'Products retrieved successfully', 200, true, result.meta).send(res);
});
exports.getFeaturedProducts = (0, asyncHandler_1.default)(async (req, res) => {
    console.log('Fetching featured products');
    const featuredProducts = await productService.getFeaturedProducts();
    new apiResponse_1.ApiResponse(featuredProducts, 'Featured products retrieved successfully', 200).send(res);
});
exports.getBestSellingProducts = (0, asyncHandler_1.default)(async (req, res) => {
    const bestSellingProducts = await productService.getBestSellingProducts();
    new apiResponse_1.ApiResponse(bestSellingProducts, 'Best selling products retrieved successfully', 200).send(res);
});
exports.bulkUploadProducts = (0, asyncHandler_1.default)(async (req, res) => {
    if (!req.file) {
        return new apiResponse_1.ApiResponse(null, 'No file uploaded', 400).send(res);
    }
    const ext = path_1.default.extname(req.file.originalname).toLowerCase();
    let products = [];
    if (ext === '.csv') {
        const csvString = req.file.buffer.toString('utf-8');
        products = (0, sync_1.parse)(csvString, {
            columns: true,
            skip_empty_lines: true,
        });
    }
    else if (ext === '.xlsx' || ext === '.xls') {
        const workbook = xlsx_1.default.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        products = xlsx_1.default.utils.sheet_to_json(workbook.Sheets[sheetName]);
    }
    else {
        return new apiResponse_1.ApiResponse(null, 'Unsupported file type', 400).send(res);
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
        }
        catch (err) {
            results.push({
                success: false,
                error: err.message,
                data: prod
            });
        }
    }
    new apiResponse_1.ApiResponse(results, 'Bulk upload completed').send(res);
});
exports.deleteAllProducts = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await productService.deleteAllProducts();
    new apiResponse_1.ApiResponse(result, `Successfully deleted ${result.deletedCount} products, ${result.deletedImages} product images, ${result.deletedStocks} stock records, ${result.deletedStockMovements} stock movements, ${result.deletedSaleItems} sale items, ${result.deletedPurchaseOrderItems} purchase order items, and ${result.deletedOrderItems} order items`, 200).send(res);
});
//# sourceMappingURL=product.controller.js.map