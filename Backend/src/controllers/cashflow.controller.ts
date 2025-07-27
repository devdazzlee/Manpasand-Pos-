import { Request, Response } from 'express';
import { CashFlowService } from '../services/cashflow.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';
import { prisma } from '../prisma/client';

const cashFlowService = new CashFlowService();

export const getCashFlowByDate = asyncHandler(async (req: Request, res: Response) => {
  const { date } = req.query;
  const branchId = req.user?.branch_id;
  
  if (!branchId) {
    return res.status(400).json({ message: 'Branch not found in request.' });
  }
  
  console.log('getCashFlowByDate controller - received:', { date, branchId }); // Debug log
  
  // Let's also check what's in the database directly
  const allCashFlows = await prisma.cashFlow.findMany({
    where: { branch_id: branchId },
    orderBy: { opened_at: 'desc' },
    take: 5,
  });
  console.log('All cashflows for this branch:', allCashFlows); // Debug log
  
  const result = await cashFlowService.getCashFlowByDate(branchId, date as string);
  console.log('getCashFlowByDate result:', result); // Debug log

  // Always return consistent structure
  new ApiResponse(result, 'Cashflow retrieved successfully', 200).send(res);
});

export const createOpening = asyncHandler(async (req: Request, res: Response) => {
  const branchId = req.user?.branch_id;
  if (!branchId) {
    return res.status(400).json({ message: 'Branch not found in request.' });
  }
  // Check for open drawer for this branch
  const openDrawer = await cashFlowService.findOpenDrawer(branchId);
  if (openDrawer) {
    return res.status(400).json({ message: 'Drawer already open for today for this branch. Please close it before opening a new one.' });
  }
  const cashFlow = await cashFlowService.createOpeningCashFlow({
    opening: req.body.opening,
    sales: req.body.sales,
    branch_id: branchId,
  });
  new ApiResponse(cashFlow, 'Opening added', 201).send(res);
});

export const addExpense = asyncHandler(async (req: Request, res: Response) => {
  const branchId = req.user?.branch_id;
  if (!branchId) {
    return res.status(400).json({ message: 'Branch not found in request.' });
  }
  // Find open drawer for this branch
  const openDrawer = await cashFlowService.findOpenDrawer(branchId);
  if (!openDrawer) {
    return res.status(400).json({ message: 'No open drawer for this branch. Cannot add expense.' });
  }
  const expense = await cashFlowService.addExpense({
    cashflow_id: openDrawer.id,
    particular: req.body.particular,
    amount: req.body.amount,
  });
  new ApiResponse(expense, 'Expense added', 201).send(res);
});

export const addClosing = asyncHandler(async (req: Request, res: Response) => {
  const { cashflow_id, closing } = req.body;
  const result = await cashFlowService.addClosing(cashflow_id, closing);
  new ApiResponse(result, 'Closing added', 200).send(res);
});

export const listCashFlows = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10 } = req.query;
  const branchId = req.user?.branch_id;
  
  const result = await cashFlowService.listCashFlows({
    page: Number(page),
    limit: Number(limit),
    branch_id: branchId,
  });
  new ApiResponse(result.data, 'Cash flows retrieved successfully', 200).send(res);
});

export const getExpensesByDate = asyncHandler(async (req: Request, res: Response) => {
  const branchId = req.user?.branch_id;
  if (!branchId) {
    return res.status(400).json({ message: 'Branch not found in request.' });
  }
  
  console.log('getExpensesByDate controller - received:', { branchId, date: req.query.date }); // Debug log
  
  // Let's also check all expenses in the database
  const allExpenses = await prisma.expense.findMany({
    include: {
      cashflow: {
        select: {
          id: true,
          branch_id: true,
          status: true,
          opened_at: true,
        }
      }
    },
    orderBy: { created_at: 'desc' },
    take: 10,
  });
  console.log('All expenses in database:', allExpenses); // Debug log
  
  const date = req.query.date as string | undefined;
  const expenses = await cashFlowService.getExpensesByDate(branchId, date);
  console.log('getExpensesByDate - returning expenses:', expenses.length); // Debug log
  
  new ApiResponse(expenses, 'Expenses retrieved successfully', 200).send(res);
});

// Debug endpoint to check database state
export const debugCashFlows = asyncHandler(async (req: Request, res: Response) => {
  const branchId = req.user?.branch_id;
  if (!branchId) {
    return res.status(400).json({ message: 'Branch not found in request.' });
  }
  
  const allCashFlows = await prisma.cashFlow.findMany({
    where: { branch_id: branchId },
    orderBy: { opened_at: 'desc' },
    take: 10,
  });
  
  const openDrawers = await prisma.cashFlow.findMany({
    where: { 
      branch_id: branchId,
      status: 'OPEN'
    },
    include: { expenses: true },
  });
  
  const allExpenses = await prisma.expense.findMany({
    include: {
      cashflow: {
        select: {
          id: true,
          branch_id: true,
          status: true,
        }
      }
    },
    orderBy: { created_at: 'desc' },
    take: 20,
  });
  
  new ApiResponse({
    allCashFlows,
    openDrawers,
    allExpenses,
    branchId,
    currentDate: new Date().toISOString(),
  }, 'Debug info retrieved', 200).send(res);
});
