import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { asNumber } from '../utils/helpers';
import { CreateSalaryInput, UpdateSalaryInput } from '../validations/salary.validation';

export class SalaryService {
  async createSalary(data: CreateSalaryInput) {
    const employee = await prisma.employee.findUnique({
      where: { id: data.employee_id },
      select: { id: true, name: true },
    });
    if (!employee) throw new AppError(404, 'Employee not found');

    const existing = await prisma.salary.findUnique({
      where: {
        employee_id_month_year: {
          employee_id: data.employee_id,
          month: data.month,
          year: data.year,
        },
      },
    });
    if (existing) {
      throw new AppError(
        400,
        `A salary record already exists for ${employee.name} in ${data.month}/${data.year}`,
      );
    }

    const isPaid = data.is_paid ?? false;
    const paidDate = isPaid
      ? data.paid_date
        ? new Date(data.paid_date)
        : new Date()
      : null;

    const salary = await prisma.salary.create({
      data: {
        employee_id: data.employee_id,
        month: data.month,
        year: data.year,
        amount: data.amount,
        is_paid: isPaid,
        paid_date: paidDate,
        notes: data.notes || null,
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employee_code: true,
            department: { select: { id: true, name: true } },
            employee_type: { select: { id: true, name: true } },
          },
        },
      },
    });

    return this.serialize(salary);
  }

  async listSalaries(params: {
    branch_id?: string;
    page?: number;
    limit?: number;
    employee_id?: string;
    month?: number;
    year?: number;
    is_paid?: boolean;
    search?: string;
    fetch_all?: boolean;
  }) {
    const page = params.page || 1;
    const limit = params.fetch_all ? 2000 : params.limit || 20;
    const skip = params.fetch_all ? 0 : (page - 1) * limit;

    const where: Prisma.SalaryWhereInput = {};
    if (params.employee_id) where.employee_id = params.employee_id;
    if (params.month) where.month = params.month;
    if (params.year) where.year = params.year;
    if (params.is_paid !== undefined) where.is_paid = params.is_paid;

    const employeeWhere: Prisma.EmployeeWhereInput = {};
    if (params.branch_id) employeeWhere.branch_id = params.branch_id;
    if (params.search?.trim()) {
      employeeWhere.OR = [
        { name: { contains: params.search.trim(), mode: 'insensitive' } },
        { employee_code: { contains: params.search.trim(), mode: 'insensitive' } },
      ];
    }
    if (Object.keys(employeeWhere).length > 0) {
      where.employee = employeeWhere;
    }

    const [salaries, total, aggregates, paidCount] = await Promise.all([
      prisma.salary.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employee_code: true,
              department: { select: { id: true, name: true } },
              employee_type: { select: { id: true, name: true } },
            },
          },
        },
        skip,
        take: limit,
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { created_at: 'desc' }],
      }),
      prisma.salary.count({ where }),
      prisma.salary.aggregate({
        where,
        _sum: { amount: true },
      }),
      prisma.salary.count({ where: { ...where, is_paid: true } }),
    ]);

    const paidWhere: Prisma.SalaryWhereInput = { ...where, is_paid: true };
    const unpaidWhere: Prisma.SalaryWhereInput = { ...where, is_paid: false };
    const [paidSum, unpaidSum] = await Promise.all([
      prisma.salary.aggregate({ where: paidWhere, _sum: { amount: true } }),
      prisma.salary.aggregate({ where: unpaidWhere, _sum: { amount: true } }),
    ]);

    return {
      data: salaries.map((s) => this.serialize(s)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        summary: {
          totalAmount: asNumber(aggregates._sum.amount),
          paidAmount: asNumber(paidSum._sum.amount),
          unpaidAmount: asNumber(unpaidSum._sum.amount),
          paidCount,
          unpaidCount: total - paidCount,
        },
      },
    };
  }

  async getSalaryById(id: string) {
    const salary = await prisma.salary.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employee_code: true,
            department: { select: { id: true, name: true } },
            employee_type: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!salary) throw new AppError(404, 'Salary record not found');
    return this.serialize(salary);
  }

  async updateSalary(id: string, data: UpdateSalaryInput) {
    const existing = await prisma.salary.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Salary record not found');

    const updateData: Prisma.SalaryUpdateInput = {};

    if (data.amount !== undefined) {
      if (!Number.isFinite(data.amount) || data.amount <= 0) {
        throw new AppError(400, 'Amount must be greater than 0');
      }
      updateData.amount = data.amount;
    }
    if (data.month !== undefined) updateData.month = data.month;
    if (data.year !== undefined) updateData.year = data.year;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.employee_id !== undefined) {
      updateData.employee = { connect: { id: data.employee_id } };
    }

    if (data.is_paid !== undefined) {
      updateData.is_paid = data.is_paid;
      if (data.is_paid) {
        updateData.paid_date = data.paid_date
          ? new Date(data.paid_date)
          : existing.paid_date || new Date();
      } else {
        updateData.paid_date = null;
      }
    } else if (data.paid_date !== undefined) {
      updateData.paid_date = data.paid_date ? new Date(data.paid_date) : null;
    }

    // Unique constraint check if period/employee changes
    const nextEmployeeId = data.employee_id || existing.employee_id;
    const nextMonth = data.month ?? existing.month;
    const nextYear = data.year ?? existing.year;
    if (
      nextEmployeeId !== existing.employee_id ||
      nextMonth !== existing.month ||
      nextYear !== existing.year
    ) {
      const clash = await prisma.salary.findFirst({
        where: {
          employee_id: nextEmployeeId,
          month: nextMonth,
          year: nextYear,
          NOT: { id },
        },
      });
      if (clash) {
        throw new AppError(
          400,
          `A salary record already exists for this employee in ${nextMonth}/${nextYear}`,
        );
      }
    }

    const salary = await prisma.salary.update({
      where: { id },
      data: updateData,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employee_code: true,
            department: { select: { id: true, name: true } },
            employee_type: { select: { id: true, name: true } },
          },
        },
      },
    });

    return this.serialize(salary);
  }

  async markPaid(id: string, paid_date?: string) {
    return this.updateSalary(id, {
      is_paid: true,
      paid_date: paid_date || new Date().toISOString(),
    });
  }

  async markUnpaid(id: string) {
    return this.updateSalary(id, { is_paid: false, paid_date: null });
  }

  async deleteSalary(id: string) {
    const existing = await prisma.salary.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Salary record not found');
    await prisma.salary.delete({ where: { id } });
    return { message: 'Salary deleted successfully' };
  }

  private serialize(salary: any) {
    return {
      ...salary,
      amount: asNumber(salary.amount),
    };
  }
}
