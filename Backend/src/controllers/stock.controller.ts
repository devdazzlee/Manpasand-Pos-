import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { StockService } from "../services/stock.service";
import { AppError } from "../utils/apiError";

const stockService = new StockService();

const createStockController = asyncHandler(async (req: Request, res: Response) => {
    console.log("User ID:", req.user?.id, req.user?.role);
    
    const stock = await stockService.createStock({ ...req.body, createdBy: req.user!.id });
    new ApiResponse(stock, "Stock added successfully", 201).send(res);
});

const adjustStockController = asyncHandler(async (req: Request, res: Response) => {
    const stock = await stockService.adjustStock({ ...req.body, createdBy: req.user!.id });
    new ApiResponse(stock, "Stock adjusted successfully").send(res);
});

const getStocksController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = (req.query.branchId as string) || req.user?.branch_id;
    if (!branchId) throw new AppError(400, "Branch ID is required");
    const stocks = await stockService.getStockByBranch(branchId);
    new ApiResponse(stocks, "Stocks retrieved successfully").send(res);
});

const getStockMovementsController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = (req.query.branchId as string) || req.user?.branch_id;
    if (!branchId) throw new AppError(400, "Branch ID is required");
    const movements = await stockService.getStockMovements(branchId);
    new ApiResponse(movements, "Stock movement history retrieved").send(res);
});

export {
    createStockController,
    adjustStockController,
    getStocksController,
    getStockMovementsController,
};