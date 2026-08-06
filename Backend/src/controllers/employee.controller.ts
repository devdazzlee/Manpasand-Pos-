import { Request, Response } from 'express';
import { EmployeeStatus, EmploymentType } from '@prisma/client';
import { EmployeeService } from '../services/employee.service';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';

const employeeService = new EmployeeService();

export const createEmployee = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.createEmployee(req.body, req.user?.branch_id!);
  new ApiResponse(employee, 'Employee created successfully', 201).send(res);
});

export const listEmployees = asyncHandler(async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 10,
    search,
    status,
    department_id,
    employee_type_id,
    employment_type,
    fetch_all,
  } = req.query;

  const result = await employeeService.listEmployees({
    branch_id: req.user?.branch_id,
    page: Number(page),
    limit: Number(limit),
    search: search as string | undefined,
    status: status as EmployeeStatus | undefined,
    department_id: department_id as string | undefined,
    employee_type_id: employee_type_id as string | undefined,
    employment_type: employment_type as EmploymentType | undefined,
    fetch_all: String(fetch_all) === 'true',
  });

  new ApiResponse(result.data, 'Employees fetched successfully', 200, true, result.meta).send(res);
});

export const getEmployeeById = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.getEmployeeById(req.params.id);
  new ApiResponse(employee, 'Employee fetched successfully', 200).send(res);
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updatedEmployee = await employeeService.updateEmployee(id, req.body);
  new ApiResponse(updatedEmployee, 'Employee updated successfully', 200).send(res);
});

export const deactivateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.deactivateEmployee(req.params.id, req.body);
  new ApiResponse(employee, 'Employee deactivated successfully', 200).send(res);
});

export const reactivateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.reactivateEmployee(req.params.id);
  new ApiResponse(employee, 'Employee reactivated successfully', 200).send(res);
});

export const deleteEmployee = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  await employeeService.deleteEmployee(id);
  new ApiResponse(null, 'Employee deleted successfully', 200).send(res);
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const department = await employeeService.createDepartment(req.body);
  new ApiResponse(department, 'Department created successfully', 201).send(res);
});

export const listDepartments = asyncHandler(async (req: Request, res: Response) => {
  const raw = req.query.fetch_all;
  const fetch_all = raw === undefined || String(raw) === 'true';
  const departments = await employeeService.listDepartments(fetch_all);
  new ApiResponse(departments, 'Departments fetched successfully', 200).send(res);
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  const department = await employeeService.updateDepartment(req.params.id, req.body);
  new ApiResponse(department, 'Department updated successfully', 200).send(res);
});

export const deleteDepartment = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeeService.deleteDepartment(req.params.id);
  new ApiResponse(result, 'Department deleted successfully', 200).send(res);
});

export const importEmployees = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeeService.importEmployees(req.body.rows, req.user?.branch_id!);
  new ApiResponse(result, 'Employee import completed', 200).send(res);
});
