import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import AppService from "../services/app.service";
import { ApiResponse } from "../utils/apiResponse";
import { AppError } from "../utils/apiError";
import { toPublicCatalog } from "../utils/public-product";

const appService = new AppService();

// Public endpoints (website / customer app): every response goes through
// toPublicCatalog so purchase prices and supplier data never leave the server.

export const getHomeData = asyncHandler(async (req: Request, res: Response) => {
    const homeData = await appService.getHomeData();
    new ApiResponse(toPublicCatalog(homeData), 'Data fetched successfully', 200).send(res);
});

export const searchProducts = asyncHandler(async (req: Request, res: Response) => {
    const searchQuery = req.query.search as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const searchedProducts = await appService.searchProducts(searchQuery, limit);
    new ApiResponse(toPublicCatalog(searchedProducts), 'Data fetched successfully', 200).send(res);
});

export const getProductById = asyncHandler(async (req: Request, res: Response) => {
    const product = await appService.getProductById(req.params.id);
    if (!product || !product.is_active || product.display_on_website === false) {
        throw new AppError(404, "Product not found");
    }
    new ApiResponse(toPublicCatalog(product), 'Product fetched successfully', 200).send(res);
});

export const getCategories = asyncHandler(async (_req: Request, res: Response) => {
    const categories = await appService.getCategories();
    new ApiResponse(toPublicCatalog(categories), 'Categories fetched successfully', 200).send(res);
});