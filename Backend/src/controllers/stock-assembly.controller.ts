import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { StockAssemblyService } from '../services/stock-assembly.service';

const assemblyService = new StockAssemblyService();

export const createAssembly = asyncHandler(async (req: Request, res: Response) => {
  const assembly = await assemblyService.createAssembly({
    ...req.body,
    createdBy: req.user!.id,
  });
  new ApiResponse(assembly, 'Product assembly saved', 201).send(res);
});

export const listAssemblies = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as any;
  const result = await assemblyService.listAssemblies({
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    branchId: query.branchId,
    productId: query.productId,
    startDate: query.startDate ? new Date(query.startDate) : undefined,
    endDate: query.endDate ? new Date(query.endDate) : undefined,
    search: query.search ? String(query.search) : undefined,
  });
  new ApiResponse(result.data, 'Assemblies retrieved', 200, true, result.meta).send(res);
});

export const getAssembly = asyncHandler(async (req: Request, res: Response) => {
  const assembly = await assemblyService.getAssembly(req.params.id);
  new ApiResponse(assembly, 'Assembly retrieved', 200).send(res);
});
