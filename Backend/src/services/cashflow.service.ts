import { prisma } from '../prisma/client';
import { CreateCashFlowInput } from '../validations/cashflow.validation';

export class CashFlowService {
    async createCashFlow(data: CreateCashFlowInput) {
        const { opening, sales, closing, expenseIds } = data;

        // Create the cash flow first
        const cashFlow = await prisma.cashFlow.create({
            data: { opening, sales, closing },
        });

        // Then update each expense to link to this cash flow
        await prisma.expense.updateMany({
            where: { id: { in: expenseIds } },
            data: { cashflow_id: cashFlow.id },
        });

        // Return the cash flow with attached expenses
        const result = await prisma.cashFlow.findUnique({
            where: { id: cashFlow.id },
            include: { expenses: true },
        });

        return result;
    }

    async listCashFlows({ page = 1, limit = 10 }: { page?: number; limit?: number }) {
        const [cashFlows, total] = await Promise.all([
            prisma.cashFlow.findMany({
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: { expenses: true },
            }),
            prisma.cashFlow.count(),
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
