"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashFlowService = void 0;
const client_1 = require("../prisma/client");
class CashFlowService {
    async createCashFlow(data) {
        const { opening, sales, closing, expenseIds } = data;
        // Create the cash flow first
        const cashFlow = await client_1.prisma.cashFlow.create({
            data: { opening, sales, closing },
        });
        // Then update each expense to link to this cash flow
        await client_1.prisma.expense.updateMany({
            where: { id: { in: expenseIds } },
            data: { cashflow_id: cashFlow.id },
        });
        // Return the cash flow with attached expenses
        const result = await client_1.prisma.cashFlow.findUnique({
            where: { id: cashFlow.id },
            include: { expenses: true },
        });
        return result;
    }
    async listCashFlows({ page = 1, limit = 10 }) {
        const [cashFlows, total] = await Promise.all([
            client_1.prisma.cashFlow.findMany({
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: { expenses: true },
            }),
            client_1.prisma.cashFlow.count(),
        ]);
        return {
            data: cashFlows,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}
exports.CashFlowService = CashFlowService;
//# sourceMappingURL=cashflow.service.js.map