import { Request, Response } from 'express';
import { ExpenseService } from '../services/expense.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';

const expenseService = new ExpenseService();

export const createExpense = asyncHandler(async (req: Request, res: Response) => {
    const expense = await expenseService.createExpense(req.body);
    new ApiResponse(expense, 'Expense created successfully', 201).send(res);
});

export const listExpenses = asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 10 } = req.query;
    const result = await expenseService.listExpenses({
        page: Number(page),
        limit: Number(limit),
    });
    new ApiResponse(result.data, 'Expenses retrieved successfully', 200).send(res);
});
