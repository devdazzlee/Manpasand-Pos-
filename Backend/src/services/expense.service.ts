import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
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

    async create(data: { name: string; is_active?: boolean }) {
        return prisma.employeeType.create({ data });
    }

    async getAll() {
        return prisma.employeeType.findMany();
    }

    async getById(id: string) {
        return prisma.employeeType.findUniqueOrThrow({ where: { id } });
    }

    async update(id: string, data: { name?: string; is_active?: boolean }) {
        return prisma.employeeType.update({ where: { id }, data });
    }

    async delete(id: string) {
        const type = await prisma.employeeType.findUnique({ where: { id } });
        if (!type) {
            throw new AppError(404, 'Employee type not found');
        }

        await prisma.$transaction(
            async (tx) => {
                await tx.salary.deleteMany({
                    where: { employee: { employee_type_id: id } },
                });
                await tx.shiftAssignment.deleteMany({
                    where: { employee: { employee_type_id: id } },
                });
                await tx.employee.deleteMany({ where: { employee_type_id: id } });
                await tx.employeeType.delete({ where: { id } });
            },
            {
                maxWait: 30000,
                timeout: 120000,
            },
        );

        return type;
    }
}
