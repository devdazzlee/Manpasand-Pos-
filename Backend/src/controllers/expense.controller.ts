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

export const createEmployeeType = asyncHandler(async (req: Request, res: Response) => {
  const data = await expenseService.create(req.body);
  new ApiResponse(data, 'Employee type created successfully', 201).send(res);
});

export const getEmployeeTypes = asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string | undefined;
  const isActiveRaw = req.query.is_active as string | undefined;
  const is_active =
    isActiveRaw === 'true' ? true : isActiveRaw === 'false' ? false : undefined;
  const data = await expenseService.getAll({ search, is_active });
  new ApiResponse(data, 'Employee types retrieved successfully').send(res);
});

export const getEmployeeTypeById = asyncHandler(async (req: Request, res: Response) => {
  const data = await expenseService.getById(req.params.id);
  new ApiResponse(data, 'Employee type retrieved successfully').send(res);
});

export const updateEmployeeType = asyncHandler(async (req: Request, res: Response) => {
  const data = await expenseService.update(req.params.id, req.body);
  new ApiResponse(data, 'Employee type updated successfully').send(res);
});

export const toggleEmployeeType = asyncHandler(async (req: Request, res: Response) => {
  const data = await expenseService.toggleActive(req.params.id);
  new ApiResponse(data, 'Designation status updated successfully').send(res);
});

export const deleteEmployeeType = asyncHandler(async (req: Request, res: Response) => {
  const data = await expenseService.delete(req.params.id);
  new ApiResponse(data, 'Employee type deleted successfully').send(res);
});

