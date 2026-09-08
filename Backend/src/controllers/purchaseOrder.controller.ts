import { Request, Response } from 'express';
import { PurchaseOrderStatus } from '@prisma/client';
import { PurchaseOrderService } from '../services/purchaseOrder.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';
import { resolveBranchId } from '../utils/resolveBranchId';

const service = new PurchaseOrderService();

export const listPurchaseOrders = asyncHandler(async (req: Request, res: Response) => {
    const result = await service.list({
        ...req.query,
        branch_id: (req.query.branch_id as string | undefined) || resolveBranchId(req),
    });
    new ApiResponse(result.data, 'Purchase orders retrieved', 200, true, result.meta).send(res);
});

export const getPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
    const data = await service.getById(req.params.id);
    new ApiResponse(data, 'Purchase order retrieved').send(res);
});

export const createPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
    const branch_id = req.body.branch_id || resolveBranchId(req);
    const data = await service.create({ ...req.body, branch_id }, req.user!.id);
    new ApiResponse(data, 'Purchase order created', 201).send(res);
});

export const updatePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
    const data = await service.update(req.params.id, req.body);
    new ApiResponse(data, 'Purchase order updated').send(res);
});

export const setPurchaseOrderStatus = asyncHandler(async (req: Request, res: Response) => {
    const data = await service.setStatus(req.params.id, req.body.status as PurchaseOrderStatus);
    new ApiResponse(data, 'Purchase order status updated').send(res);
});

export const receivePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
    const { lines, invoice_ref, notes } = req.body;
    const data = await service.receive(req.params.id, lines, req.user!.id, { invoice_ref, notes });
    new ApiResponse(data, 'Purchase order received').send(res);
});

export const cancelPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
    const data = await service.setStatus(req.params.id, 'CANCELLED');
    new ApiResponse(data, 'Purchase order cancelled').send(res);
});

export const deletePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
    const data = await service.remove(req.params.id);
    new ApiResponse(data, 'Purchase order deleted').send(res);
});
