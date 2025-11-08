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

const transferStockController = asyncHandler(async (req: Request, res: Response) => {
    const result = await stockService.transferStock({ ...req.body, createdBy: req.user!.id });
    new ApiResponse(result, "Stock transferred successfully").send(res);
});

const getStocksController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = req.query.branchId as string;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string | undefined;
    
    const result = await stockService.getStockByBranch(branchId || "", page, limit, search);
    new ApiResponse(result.data, "Stocks retrieved successfully", 200, true, result.meta).send(res);
});

const getStockMovementsController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = req.query.branchId as string;
    const movements = await stockService.getStockMovements(branchId || "");
    new ApiResponse(movements, "Stock movement history retrieved").send(res);
});

const getTodayStockMovementsController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = req.query.branchId as string;
    const movements = await stockService.getTodayStockMovements(branchId || undefined);
    new ApiResponse(movements, "Today's stock movements retrieved").send(res);
});

export {
    createStockController,
    adjustStockController,
    transferStockController,
    getStocksController,
    getStockMovementsController,
    getTodayStockMovementsController,
};