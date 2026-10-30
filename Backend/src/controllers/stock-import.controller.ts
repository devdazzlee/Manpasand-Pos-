import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { StockImportService } from '../services/stock-import.service';

const service = new StockImportService();

export const previewStockImport = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.preview(req.body.rows, req.body.options);
  new ApiResponse(result, 'Preview ready').send(res);
});

export const createStockImport = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.create({ ...req.body, userId: req.user!.id });
  new ApiResponse(result, 'Import started', 201).send(res);
});

export const processStockImport = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.process(req.params.id, req.user!.id);
  new ApiResponse(result, result.done ? 'Import finished' : 'Chunk applied').send(res);
});

export const reverseStockImport = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.reverse(req.params.id, req.user!.id);
  new ApiResponse(result, 'Import undone').send(res);
});

export const listStockImports = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.list(req.query);
  new ApiResponse(result.data, 'Imports retrieved', 200, true, result.meta).send(res);
});

export const getStockImport = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.progress(req.params.id);
  new ApiResponse(result, 'Import retrieved').send(res);
});

export const listStockImportLines = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.lines(req.params.id, req.query as Record<string, string>);
  new ApiResponse(result.data, 'Lines retrieved', 200, true, result.meta).send(res);
});

export const lookupStockProduct = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.lookup(String(req.query.code), req.query.branchId ? String(req.query.branchId) : undefined);
  new ApiResponse(result, 'Product found').send(res);
});
