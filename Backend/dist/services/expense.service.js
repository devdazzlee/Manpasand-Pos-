"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
class ExpenseService {
    async createExpense(data) {
        return await client_1.prisma.expense.create({ data });
    }
    async listExpenses({ page = 1, limit = 10 }) {
        const [expenses, total] = await Promise.all([
            client_1.prisma.expense.findMany({
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
            }),
            client_1.prisma.expense.count(),
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
    async create(data) {
        return client_1.prisma.employeeType.create({ data });
    }
    async getAll() {
        return client_1.prisma.employeeType.findMany();
    }
    async getById(id) {
        return client_1.prisma.employeeType.findUniqueOrThrow({ where: { id } });
    }
    async update(id, data) {
        return client_1.prisma.employeeType.update({ where: { id }, data });
    }
    async delete(id) {
        const type = await client_1.prisma.employeeType.findUnique({ where: { id } });
        if (!type) {
            throw new apiError_1.AppError(404, 'Employee type not found');
        }
        await client_1.prisma.$transaction(async (tx) => {
            await tx.salary.deleteMany({
                where: { employee: { employee_type_id: id } },
            });
            await tx.shiftAssignment.deleteMany({
                where: { employee: { employee_type_id: id } },
            });
            await tx.employee.deleteMany({ where: { employee_type_id: id } });
            await tx.employeeType.delete({ where: { id } });
        }, {
            maxWait: 30000,
            timeout: 120000,
        });
        return type;
    }
}
exports.ExpenseService = ExpenseService;
//# sourceMappingURL=expense.service.js.map