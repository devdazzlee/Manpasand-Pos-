import { Request, Response } from 'express';
import { CashFlowService } from '../services/cashflow.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';

const cashFlowService = new CashFlowService();

export const createCashFlow = asyncHandler(async (req: Request, res: Response) => {
    const cashFlow = await cashFlowService.createCashFlow(req.body);
    new ApiResponse(cashFlow, 'Cash flow created successfully', 201).send(res);
});

export const listCashFlows = asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 10 } = req.query;
    const result = await cashFlowService.listCashFlows({
        page: Number(page),
        limit: Number(limit),
    });
    new ApiResponse(result.data, 'Cash flows retrieved successfully', 200).send(res);
});
