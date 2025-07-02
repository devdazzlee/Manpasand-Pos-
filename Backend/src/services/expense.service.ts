import { prisma } from '../prisma/client';
import { CreateExpenseInput } from '../validations/expense.validation';

export class ExpenseService {
    async createExpense(data: CreateExpenseInput) {
        return await prisma.expense.create({ data });
    }

    async listExpenses({ page = 1, limit = 10 }: { page?: number; limit?: number }) {
        const [expenses, total] = await Promise.all([
            prisma.expense.findMany({
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
            }),
            prisma.expense.count(),
        ]);

        return {
            data: expenses,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}
