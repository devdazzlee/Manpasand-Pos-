import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { SaleService } from "../services/sales.service";
import { ApiResponse } from "../utils/apiResponse";

const saleService = new SaleService();

const getSalesController = asyncHandler(async (req: Request, res: Response) => {
    // Priority: query parameter (branchId from localStorage) > JWT token branch_id
    // If branchId is provided in query, use it to filter (even for admins)
    // If no branchId in query and user is admin, return all sales
    // If no branchId in query and user is not admin, use JWT token branch_id
    
    const isAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
    const queryBranchId = req.query.branchId as string;
    const jwtBranchId = req.user?.branch_id as string;
    
    let branchId: string | undefined;
    
    // If branchId is provided in query parameter (from localStorage), use it to filter
    if (queryBranchId && queryBranchId.trim() && queryBranchId.trim() !== "Not Found") {
        branchId = queryBranchId.trim();
        console.log("Filtering by branchId from query parameter (localStorage):", branchId);
    } else if (!isAdmin) {
        // Non-admin users: use JWT token branch_id if no query param
        branchId = jwtBranchId?.trim();
        console.log("Non-admin user - filtering by JWT branch_id:", branchId);
        
        // If still no branchId, return empty array
        if (!branchId || branchId === "Not Found") {
            console.warn("No valid branchId found for non-admin user");
            return new ApiResponse([], "No branch ID found for user").send(res);
        }
    } else {
        // Admin user with no branchId in query - return all sales
        branchId = undefined;
        console.log("Admin user - no branchId in query, returning all sales");
    }
    
    const sales = await saleService.getSales({ branchId });
    console.log(`Returning ${sales.length} sales for branchId: ${branchId || 'ALL'}`);
    new ApiResponse(sales, "Sales fetched successfully").send(res);
});

const getSalesForReturnsController = asyncHandler(async (req: Request, res: Response) => {
    const sales = await saleService.getSalesForReturns({ branchId: req.user?.branch_id as string as string });
    new ApiResponse(sales, "Sales eligible for returns fetched successfully").send(res);
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
    const { customerId, returnedItems = [], exchangedItems = [], notes } = req.body;
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
    getSalesForReturnsController,
    getSaleByIdController,
    createSaleController,
    refundSaleController,
    getTodaySalesController,
    getRecentSaleItemProductNameAndPrice
};