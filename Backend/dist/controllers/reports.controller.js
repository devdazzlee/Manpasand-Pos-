"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReportsData = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const reports_service_1 = require("../services/reports.service");
const apiResponse_1 = require("../utils/apiResponse");
const timezone_1 = require("../utils/timezone");
const reportsService = new reports_service_1.ReportsService();
/**
 * Get reports data (sales, products, stats, employee performance)
 * Query: from, to (YYYY-MM-DD), limit
 */
exports.getReportsData = (0, asyncHandler_1.default)(async (req, res) => {
    const branchId = req.query.branch_id || req.user?.branch_id;
    const userRole = req.user?.role;
    const { limit } = req.query;
    const today = (0, timezone_1.businessTodayYmd)();
    let from = typeof req.query.from === 'string' && (0, timezone_1.isYmd)(req.query.from) ? req.query.from : (0, timezone_1.shiftBusinessYmd)(today, -29);
    let to = typeof req.query.to === 'string' && (0, timezone_1.isYmd)(req.query.to) ? req.query.to : today;
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
    new apiResponse_1.ApiResponse({
        sales,
        bestSellingProducts,
        stats,
        employeePerformance,
        period: { from, to },
    }, 'Reports data fetched successfully').send(res);
});
//# sourceMappingURL=reports.controller.js.map