"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeService = void 0;
const client_1 = require("../prisma/client");
class EmployeeService {
    async createEmployee(data, branch_id) {
        const employee = await client_1.prisma.employee.create({
            data: { ...data, branch_id },
        });
        return employee;
    }
    async listEmployees(branch_id, page = 1, limit = 10) {
        const [employees, total] = await Promise.all([
            client_1.prisma.employee.findMany({
                where: { branch_id },
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
            }),
            client_1.prisma.employee.count({ where: { branch_id } }),
        ]);
        return {
            data: employees,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}
exports.EmployeeService = EmployeeService;
//# sourceMappingURL=employee.service.js.map