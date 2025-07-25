import { Request, Response } from 'express';
import { CashFlowService } from '../services/cashflow.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';

const cashFlowService = new CashFlowService();

export const getCashFlowByDate = asyncHandler(async (req: Request, res: Response) => {
  const { date } = req.query;
  const result = await cashFlowService.getCashFlowByDate(date as string);

  if (!result.exists) {
    new ApiResponse({ exists: false, data: [] }, 'No cashflow found for date', 200).send(res);
  } else {
    new ApiResponse(result.data, 'Cashflow retrieved successfully', 200).send(res);
  }
});

export const createOpening = asyncHandler(async (req: Request, res: Response) => {
  const cashFlow = await cashFlowService.createOpeningCashFlow(req.body);
  new ApiResponse(cashFlow, 'Opening added', 201).send(res);
});

export const addExpense = asyncHandler(async (req: Request, res: Response) => {
  const expense = await cashFlowService.addExpense(req.body);
  new ApiResponse(expense, 'Expense added', 201).send(res);
});

export const addClosing = asyncHandler(async (req: Request, res: Response) => {
  const { cashflow_id, closing } = req.body;
  const result = await cashFlowService.addClosing(cashflow_id, closing);
  new ApiResponse(result, 'Closing added', 200).send(res);
});

export const listCashFlows = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10 } = req.query;
  const result = await cashFlowService.listCashFlows({
    page: Number(page),
    limit: Number(limit),
  });
  new ApiResponse(result.data, 'Cash flows retrieved successfully', 200).send(res);
});
