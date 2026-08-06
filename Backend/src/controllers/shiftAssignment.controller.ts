import { Request, Response } from 'express';
import { ShiftAssignmentService } from '../services/shiftAssignment.service';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';

const shiftAssignmentService = new ShiftAssignmentService();

export const assignShift = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await shiftAssignmentService.assignShift(req.body);
  new ApiResponse(assignment, 'Shift assigned successfully', 201).send(res);
});

export const getCurrentShift = asyncHandler(async (req: Request, res: Response) => {
  const { employee_id } = req.params;
  const currentShift = await shiftAssignmentService.getCurrentShift(employee_id);
  new ApiResponse(currentShift, 'Current shift fetched successfully', 200).send(res);
});

export const getShiftHistory = asyncHandler(async (req: Request, res: Response) => {
  const { employee_id } = req.params;
  const history = await shiftAssignmentService.getShiftHistory(employee_id);
  new ApiResponse(history, 'Shift history fetched successfully', 200).send(res);
});

export const endCurrentShift = asyncHandler(async (req: Request, res: Response) => {
  const { employee_id } = req.params;
  const sales =
    req.body?.sales !== undefined && req.body?.sales !== null
      ? Number(req.body.sales)
      : undefined;
  const updated = await shiftAssignmentService.endCurrentShift(
    employee_id,
    new Date(),
    sales,
  );
  new ApiResponse(updated, 'Current shift ended successfully', 200).send(res);
});

export const endShiftById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const sales =
    req.body?.sales !== undefined && req.body?.sales !== null
      ? Number(req.body.sales)
      : undefined;
  const updated = await shiftAssignmentService.endShiftById(id, sales);
  new ApiResponse(updated, 'Shift ended successfully', 200).send(res);
});

export const getAllShifts = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, unknown>;
  const fetchAllRaw = q.fetch_all;
  const fetch_all =
    fetchAllRaw === true ||
    fetchAllRaw === 'true' ||
    (!q.page && !q.limit);

  const result = await shiftAssignmentService.listShifts({
    page: q.page ? Number(q.page) : undefined,
    limit: q.limit ? Number(q.limit) : undefined,
    fetch_all,
    search: typeof q.search === 'string' ? q.search : undefined,
    employee_id: typeof q.employee_id === 'string' ? q.employee_id : undefined,
    status: q.status as any,
    date_from: typeof q.date_from === 'string' ? q.date_from : undefined,
    date_to: typeof q.date_to === 'string' ? q.date_to : undefined,
    period: q.period as any,
  });
  new ApiResponse(
    result.data,
    'All shifts fetched successfully',
    200,
    true,
    result.meta,
  ).send(res);
});

export const updateShift = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updated = await shiftAssignmentService.updateShift(id, req.body);
  new ApiResponse(updated, 'Shift updated successfully', 200).send(res);
});

export const deleteShift = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await shiftAssignmentService.deleteShift(id);
  new ApiResponse(result, 'Shift deleted successfully', 200).send(res);
});
