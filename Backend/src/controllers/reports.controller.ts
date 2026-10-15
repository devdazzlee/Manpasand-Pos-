import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ReportsService } from '../services/reports.service';
import { ApiResponse } from '../utils/apiResponse';
import { businessTodayYmd, isYmd, shiftBusinessYmd } from '../utils/timezone';

const reportsService = new ReportsService();

/**
 * Get reports data (sales, products, stats, employee performance)
 * Query: from, to (YYYY-MM-DD), limit
 */
export const getReportsData = asyncHandler(async (req: Request, res: Response) => {
  const branchId = (req.query.branch_id as string | undefined) || (req.user?.branch_id as string | undefined);
  const userRole = req.user?.role as string | undefined;
  const { limit } = req.query;

  const today = businessTodayYmd();
  let from = typeof req.query.from === 'string' && isYmd(req.query.from) ? req.query.from : shiftBusinessYmd(today, -29);
  let to = typeof req.query.to === 'string' && isYmd(req.query.to) ? req.query.to : today;
  if (to < from) {
    const swap = from;
    from = to;
    to = swap;
  }

  const q = { branchId, userRole, from, to };

  const [sales, bestSellingProducts, stats, employeePerformance] = await Promise.all([
    reportsService.getSalesForReports(q),
    reportsService.getBestSellingProducts({
      ...q,
      limit: limit ? Number(limit) : 10,
    }),
    reportsService.getReportsStats(q),
    reportsService.getEmployeePerformance(q),
  ]);

  new ApiResponse(
    {
      sales,
      bestSellingProducts,
      stats,
      employeePerformance,
      period: { from, to },
    },
    'Reports data fetched successfully',
  ).send(res);
});
