import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import AppService from "../services/app.service";
import { ApiResponse } from "../utils/apiResponse";

const appService = new AppService();

export const getHomeData = asyncHandler(async (req: Request, res: Response) => {
    const homeData = await appService.getHomeData();
    new ApiResponse(homeData, 'Data fetched successfully', 200).send(res);
});

export const searchProducts = asyncHandler(async (req: Request, res: Response) => {
    const searchedProducts = await appService.searchProducts(req.query.search as string);
    new ApiResponse(searchedProducts, 'Data fetched successfully', 200).send(res);
});