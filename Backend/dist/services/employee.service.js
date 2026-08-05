"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
class EmployeeService {
    async resolveEmployeeTypeId(employeeTypeId) {
        if (employeeTypeId)
            return employeeTypeId;
        const existing = await client_1.prisma.employeeType.findFirst({
            where: { is_active: true },
            orderBy: { name: 'asc' },
        });
        if (existing)
            return existing.id;
        const created = await client_1.prisma.employeeType.create({
            data: { name: 'General' },
        });
        return created.id;
    }
    async createEmployee(data, branch_id) {
        const joinDate = data.join_date ? new Date(data.join_date) : new Date();
        const employee_type_id = await this.resolveEmployeeTypeId(data.employee_type_id);
        const employee = await client_1.prisma.employee.create({
            data: {
                name: data.name.trim(),
                email: data.email,
                phone_number: data.phone_number,
                cnic: data.cnic,
                gender: data.gender,
                join_date: joinDate,
                employee_type_id,
                branch_id,
            },
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
    async updateEmployee(id, data) {
        const employee = await client_1.prisma.employee.update({
            where: { id },
            data,
        });
        return employee;
    }
    async deleteEmployee(id) {
        const employee = await client_1.prisma.employee.findUnique({ where: { id } });
        if (!employee) {
            throw new apiError_1.AppError(404, 'Employee not found');
        }
        await client_1.prisma.$transaction(async (tx) => {
            await tx.salary.deleteMany({ where: { employee_id: id } });
            await tx.shiftAssignment.deleteMany({ where: { employee_id: id } });
            await tx.employee.delete({ where: { id } });
        }, {
            maxWait: 30000,
            timeout: 120000,
        });
        return employee;
    }
}
exports.EmployeeService = EmployeeService;
//# sourceMappingURL=employee.service.js.map