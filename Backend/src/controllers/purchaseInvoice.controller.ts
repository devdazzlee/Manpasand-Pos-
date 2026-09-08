import { Request, Response } from 'express';
import { PurchaseInvoiceService } from '../services/purchaseInvoice.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';
import { resolveBranchId } from '../utils/resolveBranchId';

const service = new PurchaseInvoiceService();

export const listPurchaseInvoices = asyncHandler(async (req: Request, res: Response) => {
    const result = await service.list({
        ...req.query,
        branch_id: (req.query.branch_id as string | undefined) || resolveBranchId(req),
    });
    new ApiResponse(result.data, 'Purchase invoices retrieved', 200, true, result.meta).send(res);
});

export const getPurchaseInvoice = asyncHandler(async (req: Request, res: Response) => {
    const data = await service.getById(req.params.id);
    new ApiResponse(data, 'Purchase invoice retrieved').send(res);
});

export const getUninvoicedPurchases = asyncHandler(async (req: Request, res: Response) => {
    const data = await service.uninvoicedPurchases(req.params.supplierId);
    new ApiResponse(data, 'Uninvoiced deliveries retrieved').send(res);
});

export const createPurchaseInvoice = asyncHandler(async (req: Request, res: Response) => {
    const branch_id = req.body.branch_id ?? resolveBranchId(req) ?? null;
    const data = await service.create({ ...req.body, branch_id }, req.user!.id);
    new ApiResponse(data, 'Purchase invoice created', 201).send(res);
});

export const updatePurchaseInvoice = asyncHandler(async (req: Request, res: Response) => {
    const data = await service.update(req.params.id, req.body);
    new ApiResponse(data, 'Purchase invoice updated').send(res);
});

export const deletePurchaseInvoice = asyncHandler(async (req: Request, res: Response) => {
    const data = await service.remove(req.params.id);
    new ApiResponse(data, 'Purchase invoice deleted').send(res);
});
