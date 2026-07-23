import asyncHandler from "../middleware/asyncHandler";
import { StatsService } from "../services/stats.service";
import { ApiResponse } from "../utils/apiResponse";
import { resolveBranchId } from "../utils/resolveBranchId";

const statsService = new StatsService();

export const dashboardStats = asyncHandler(async (req, res) => {
    const branchId = resolveBranchId(req);
    const stats = await statsService.getDashboardStats(branchId);
    new ApiResponse(stats, 'Dashboard stats fetched', 200).send(res);
})