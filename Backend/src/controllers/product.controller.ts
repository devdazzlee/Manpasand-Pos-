import { Request, Response } from 'express';
import { ProductService } from '../services/product.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';

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
        display_on_pos
    } = req.query;

    const result = await productService.listProducts({
        page: Number(page),
        limit: Number(limit),
        search: search as string | undefined,
        category_id: category_id as string | undefined,
        subcategory_id: subcategory_id as string | undefined,
        is_active: is_active ? is_active === 'true' : undefined,
        display_on_pos: display_on_pos ? display_on_pos === 'true' : undefined,
    });
    console.log(result);

    new ApiResponse(result.data, 'Products retrieved successfully', 200).send(res);
});