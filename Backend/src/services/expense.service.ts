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
        const name = data.name.trim();
        if (name.length < 2) {
            throw new AppError(400, 'Name must be at least 2 characters');
        }
        const existing = await prisma.employeeType.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
        });
        if (existing) {
            throw new AppError(400, 'A designation with this name already exists');
        }
        return prisma.employeeType.create({
            data: {
                name,
                is_active: data.is_active ?? true,
            },
        });
    }

    async getAll(opts?: { search?: string; is_active?: boolean }) {
        const where: {
            name?: { contains: string; mode: 'insensitive' };
            is_active?: boolean;
        } = {};
        if (opts?.search?.trim()) {
            where.name = { contains: opts.search.trim(), mode: 'insensitive' };
        }
        if (opts?.is_active !== undefined) {
            where.is_active = opts.is_active;
        }

        const types = await prisma.employeeType.findMany({
            where,
            orderBy: { name: 'asc' },
            include: {
                _count: { select: { employees: true } },
            },
        });

        return types.map((t) => ({
            id: t.id,
            name: t.name,
            is_active: t.is_active,
            employee_count: t._count.employees,
        }));
    }

    async getById(id: string) {
        const type = await prisma.employeeType.findUnique({
            where: { id },
            include: { _count: { select: { employees: true } } },
        });
        if (!type) throw new AppError(404, 'Designation not found');
        return {
            id: type.id,
            name: type.name,
            is_active: type.is_active,
            employee_count: type._count.employees,
        };
    }

    async update(id: string, data: { name?: string; is_active?: boolean }) {
        const existing = await prisma.employeeType.findUnique({ where: { id } });
        if (!existing) throw new AppError(404, 'Designation not found');

        if (data.name !== undefined) {
            const name = data.name.trim();
            if (name.length < 2) {
                throw new AppError(400, 'Name must be at least 2 characters');
            }
            const clash = await prisma.employeeType.findFirst({
                where: {
                    name: { equals: name, mode: 'insensitive' },
                    NOT: { id },
                },
            });
            if (clash) {
                throw new AppError(400, 'A designation with this name already exists');
            }
            data.name = name;
        }

        const updated = await prisma.employeeType.update({
            where: { id },
            data,
            include: { _count: { select: { employees: true } } },
        });

        return {
            id: updated.id,
            name: updated.name,
            is_active: updated.is_active,
            employee_count: updated._count.employees,
        };
    }

    async toggleActive(id: string) {
        const existing = await prisma.employeeType.findUnique({ where: { id } });
        if (!existing) throw new AppError(404, 'Designation not found');
        return this.update(id, { is_active: !existing.is_active });
    }

    /** Safe delete — blocked while employees still use this designation. */
    async delete(id: string) {
        const type = await prisma.employeeType.findUnique({
            where: { id },
            include: { _count: { select: { employees: true } } },
        });
        if (!type) {
            throw new AppError(404, 'Designation not found');
        }
        if (type._count.employees > 0) {
            throw new AppError(
                400,
                `Cannot delete "${type.name}" — ${type._count.employees} employee(s) still use it. Reassign or deactivate them first.`,
            );
        }

        await prisma.employeeType.delete({ where: { id } });
        return { message: 'Designation deleted successfully', id: type.id, name: type.name };
    }
}
