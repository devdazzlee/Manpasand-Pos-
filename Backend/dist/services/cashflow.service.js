"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashFlowService = void 0;
const client_1 = require("../prisma/client");
class CashFlowService {
    async getCashFlowByDate(date) {
        const targetDate = new Date(date);
        const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
        const cashFlow = await client_1.prisma.cashFlow.findFirst({
            where: {
                created_at: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
            include: { expenses: true },
        });
        if (!cashFlow) {
            return { exists: false, data: null };
        }
        return { exists: true, data: cashFlow };
    }
    async createOpeningCashFlow(data) {
        const cashFlow = await client_1.prisma.cashFlow.create({
            data: {
                opening: data.opening,
                sales: data.sales,
                closing: null,
            },
        });
        return cashFlow;
    }
    async addExpense(data) {
        const expense = await client_1.prisma.expense.create({
            data: {
                particular: data.particular,
                amount: data.amount,
                cashflow_id: data.cashflow_id,
            },
        });
        return expense;
    }
    async addClosing(cashflow_id, closing) {
        const updated = await client_1.prisma.cashFlow.update({
            where: { id: cashflow_id },
            data: { closing },
        });
        return updated;
    }
    async listCashFlows({ page = 1, limit = 10, }) {
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