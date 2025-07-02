import { Request, Response } from 'express';
import { BranchService } from '../services/branch.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';

const branchService = new BranchService();

export const createBranch = asyncHandler(async (req: Request, res: Response) => {
    const branch = await branchService.createBranch(req.body);
    new ApiResponse(branch, 'Branch created successfully', 201).send(res);
});

export const getBranch = asyncHandler(async (req: Request, res: Response) => {
    const branch = await branchService.getBranchById(req.params.id);
    new ApiResponse(branch, 'Branch retrieved successfully').send(res);
});

export const updateBranch = asyncHandler(async (req: Request, res: Response) => {
    const branch = await branchService.updateBranch(req.params.id, req.body);
    new ApiResponse(branch, 'Branch updated successfully').send(res);
});

export const toggleBranchStatus = asyncHandler(async (req: Request, res: Response) => {
    await branchService.toggleBranchStatus(req.params.id);
    new ApiResponse(null, 'Branch status changed successfully').send(res);
});

export const listBranches = asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 10, search, is_active } = req.query;

    const result = await branchService.listBranches({
        page: Number(page),
        limit: Number(limit),
        search: search as string | undefined,
        is_active: is_active ? is_active === 'true' : undefined,
    });

    new ApiResponse(result.data, 'Branches retrieved successfully', 200).send(res);
});