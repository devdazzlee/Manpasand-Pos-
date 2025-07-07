import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { SaleService } from "../services/sales.service";
import { ApiResponse } from "../utils/apiResponse";

const saleService = new SaleService();

const getSalesController = asyncHandler(async (req: Request, res: Response) => {
    const sales = await saleService.getSales({ branchId: req.user?.branch_id as string as string });
    new ApiResponse(sales, "Sales fetched successfully").send(res);
});

const getSaleByIdController = asyncHandler(async (req: Request, res: Response) => {
    const sale = await saleService.getSaleById(req.params.saleId);
    new ApiResponse(sale, "Sale details fetched").send(res);
});

const createSaleController = asyncHandler(async (req: Request, res: Response) => {
    const sale = await saleService.createSale({
        ...req.body,
        branchId: req.user?.branch_id as string,
        createdBy: req.user!.id
    });
    new ApiResponse(sale, "Sale created successfully", 201).send(res);
});

const refundSaleController = asyncHandler(async (req: Request, res: Response) => {
    const { customerId, returnedItems = [], exchangedItems = [] } = req.body;
    const originalSaleId = req.params.saleId;
    const createdBy = req.user!.id;
    const branchId = req.user?.branch_id as string;

    const sale = await saleService.createExchangeOrReturnSale({
        originalSaleId,
        branchId,
        customerId,
        returnedItems,
        exchangedItems,
        createdBy,
    });

    new ApiResponse(sale, "Sale refunded/exchanged successfully").send(res);
});

const getTodaySalesController = asyncHandler(async (req: Request, res: Response) => {
    const sales = await saleService.getTodaySales({ branchId: req.user?.branch_id as string as string });
    new ApiResponse(sales, "Today's sales fetched successfully").send(res);
});

const getRecentSaleItemProductNameAndPrice = asyncHandler(async (req: Request, res: Response) => {
    const branchId = req.user?.branch_id as string;
    const recentSaleItem = await saleService.getRecentSaleItemsProductNameAndPrice(branchId);
    new ApiResponse(recentSaleItem, "Recent sale item product name and price fetched successfully").send(res);
});

export {
    getSalesController,
    getSaleByIdController,
    createSaleController,
    refundSaleController,
    getTodaySalesController,
    getRecentSaleItemProductNameAndPrice
};