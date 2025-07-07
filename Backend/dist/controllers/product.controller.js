"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBestSellingProducts = exports.getFeaturedProducts = exports.listProducts = exports.toggleProductStatus = exports.updateProduct = exports.getProduct = exports.createProduct = void 0;
const product_service_1 = require("../services/product.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
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
    const { page = 1, limit = 10, search, category_id, subcategory_id, is_active, display_on_pos } = req.query;
    const result = await productService.listProducts({
        page: Number(page),
        limit: Number(limit),
        search: search,
        category_id: category_id,
        subcategory_id: subcategory_id,
        is_active: is_active ? is_active === 'true' : undefined,
        display_on_pos: display_on_pos ? display_on_pos === 'true' : undefined,
    });
    console.log(result);
    new apiResponse_1.ApiResponse(result.data, 'Products retrieved successfully', 200).send(res);
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
//# sourceMappingURL=product.controller.js.map