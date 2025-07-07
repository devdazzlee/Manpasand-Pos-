import { Request, Response } from 'express';
import { EmployeeService } from '../services/employee.service';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';

const employeeService = new EmployeeService();

export const createEmployee = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.createEmployee(req.body, req.user?.branch_id!);
  new ApiResponse(employee, 'Employee created successfully', 201).send(res);
});

export const listEmployees = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10 } = req.query;
  const result = await employeeService.listEmployees(req.user?.branch_id!, Number(page), Number(limit));
  new ApiResponse(result.data, 'Employees fetched successfully', 200).send(res);
});
