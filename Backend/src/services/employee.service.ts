import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { CreateEmployeeInput } from '../validations/employee.validation';

export class EmployeeService {
  private async resolveEmployeeTypeId(employeeTypeId?: string) {
    if (employeeTypeId) return employeeTypeId;

    const existing = await prisma.employeeType.findFirst({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
    if (existing) return existing.id;

    const created = await prisma.employeeType.create({
      data: { name: 'General' },
    });
    return created.id;
  }

  async createEmployee(data: CreateEmployeeInput, branch_id: string) {
    const joinDate = data.join_date ? new Date(data.join_date) : new Date();
    const employee_type_id = await this.resolveEmployeeTypeId(data.employee_type_id);

    const employee = await prisma.employee.create({
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

  async listEmployees(branch_id: string, page = 1, limit = 10) {
    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where: { branch_id },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      prisma.employee.count({ where: { branch_id } }),
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

  async updateEmployee(id: string, data: Partial<CreateEmployeeInput>) {
    const employee = await prisma.employee.update({
      where: { id },
      data,
    });
    return employee;
  }

  async deleteEmployee(id: string) {
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      throw new AppError(404, 'Employee not found');
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.salary.deleteMany({ where: { employee_id: id } });
        await tx.shiftAssignment.deleteMany({ where: { employee_id: id } });
        await tx.employee.delete({ where: { id } });
      },
      {
        maxWait: 30000,
        timeout: 120000,
      },
    );

    return employee;
  }
}
