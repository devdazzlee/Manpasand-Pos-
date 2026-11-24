import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { SyncService } from "../services/sync.service";
import { ApiResponse } from "../utils/apiResponse";

const syncService = new SyncService();

const pushController = asyncHandler(async (req: Request, res: Response) => {
  const { deviceId, mutations } = req.body;
  const results = await syncService.push(deviceId, mutations, {
    userId: req.user!.id,
    role: req.user?.role,
    branchId: req.user?.branch_id as string | undefined,
    authorization: req.headers.authorization,
  });
  new ApiResponse({ results }, "Sync batch processed").send(res);
});

/** Cheap authenticated round-trip the till uses to tell online from Wi-Fi-up/server-down. */
const pingController = asyncHandler(async (_req: Request, res: Response) => {
  new ApiResponse({ serverTime: new Date().toISOString() }, "ok").send(res);
});

const listReviewsController = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await syncService.listReviews({
    includeResolved: req.query.includeResolved === "true",
  });
  new ApiResponse(reviews, "Sync reviews fetched").send(res);
});

const resolveReviewController = asyncHandler(async (req: Request, res: Response) => {
  const row = await syncService.resolveReview(String(req.params.id), req.user!.id);
  new ApiResponse(row, "Marked as reviewed").send(res);
});

export { pushController, pingController, listReviewsController, resolveReviewController };
