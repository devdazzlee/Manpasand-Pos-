import { Request, Response } from 'express';
import { alfalahService } from '../services/alfalah.service';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/apiError';
import asyncHandler from '../middleware/asyncHandler';

export const getAlfalahConfig = asyncHandler(async (_req: Request, res: Response) => {
  new ApiResponse(alfalahService.getPublicConfig(), 'Alfalah payment config').send(res);
});

export const getAlfalahSsoForm = asyncHandler(async (req: Request, res: Response) => {
  const orderNumber = String(req.query.ref || req.body?.ref || '').trim();
  const authToken = String(
    req.query.auth_token || req.query.AuthToken || req.body?.auth_token || '',
  ).trim();
  if (!orderNumber) throw new AppError(400, 'Order reference is required');
  const payment = await alfalahService.getSsoFormForOrder(orderNumber, authToken);
  new ApiResponse(payment, 'Bank Alfalah checkout form').send(res);
});

export const verifyAlfalahPayment = asyncHandler(async (req: Request, res: Response) => {
  const explicit = String(req.body?.orderNumber || req.query.ref || req.query.O || '').trim();
  const orderNumber =
    explicit ||
    alfalahService.extractOrderNumber({
      query: { ...(req.query as Record<string, unknown>), ...(req.body || {}) },
      path: String(req.body?.path || req.originalUrl || ''),
    });
  const result = await alfalahService.inquireAndSettle(orderNumber);
  new ApiResponse(result, result.paid ? 'Payment confirmed' : 'Payment not completed').send(res);
});

export const handleAlfalahIpn = asyncHandler(async (req: Request, res: Response) => {
  const statusUrl = String(req.query.url || req.body?.url || '').trim();
  const result = await alfalahService.handleIpn(statusUrl);
  new ApiResponse(result, 'IPN processed').send(res);
});
