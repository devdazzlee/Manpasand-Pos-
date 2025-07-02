import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { SaleService } from "../services/sales.service";
import { ApiResponse } from "../utils/apiResponse";

const saleService = new SaleService();

const getSalesController = asyncHandler(async (req: Request, res: Response) => {
    const sales = await saleService.getSales({ branchId: req.query.branchId as string });
    new ApiResponse(sales, "Sales fetched successfully").send(res);
});

const getSaleByIdController = asyncHandler(async (req: Request, res: Response) => {
    const sale = await saleService.getSaleById(req.params.saleId);
    new ApiResponse(sale, "Sale details fetched").send(res);
});

const createSaleController = asyncHandler(async (req: Request, res: Response) => {
    const sale = await saleService.createSale(req.body);
    new ApiResponse(sale, "Sale created successfully", 201).send(res);
});

const refundSaleController = asyncHandler(async (req: Request, res: Response) => {
    const sale = await saleService.refundSale(req.params.saleId, req.user!.id);
    new ApiResponse(sale, "Sale refunded successfully").send(res);
});

export {
    getSalesController,
    getSaleByIdController,
    createSaleController,
    refundSaleController,
};