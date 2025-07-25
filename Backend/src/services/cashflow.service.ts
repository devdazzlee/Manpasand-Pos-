import { prisma } from '../prisma/client';

export class CashFlowService {
  async getCashFlowByDate(date: string) {
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const cashFlow = await prisma.cashFlow.findFirst({
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

  async createOpeningCashFlow(data: { opening: number; sales: number }) {
    const cashFlow = await prisma.cashFlow.create({
      data: {
        opening: data.opening,
        sales: data.sales,
        closing: null,
      },
    });

    return cashFlow;
  }

  async addExpense(data: {
    cashflow_id: string;
    particular: string;
    amount: number;
  }) {
    const expense = await prisma.expense.create({
      data: {
        particular: data.particular,
        amount: data.amount,
        cashflow_id: data.cashflow_id,
      },
    });

    return expense;
  }

  async addClosing(cashflow_id: string, closing: number) {
    const updated = await prisma.cashFlow.update({
      where: { id: cashflow_id },
      data: { closing },
    });

    return updated;
  }

  async listCashFlows({
    page = 1,
    limit = 10,
  }: {
    page?: number;
    limit?: number;
  }) {
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
