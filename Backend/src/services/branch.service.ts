import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { CreateBranchInput, UpdateBranchInput } from '../validations/branch.validation';

export class BranchService {
  public async createBranch(data: CreateBranchInput) {
    const lastBranch = await prisma.branch.findFirst({
      orderBy: {
        created_at: 'desc',
      },
    });

    console.log('Last Branch:', lastBranch);

    const code = lastBranch ? (parseInt(lastBranch.code) + 1).toString() : '1000';

    const branch = await prisma.branch.create({
      data: {
        ...data,
        code,
      },
    });

    return branch;
  }

  public async getBranchById(id: string) {
    const branch = await prisma.branch.findUnique({
      where: {
        id,
      },
    });

    if (!branch) {
      throw new AppError(404, 'Branch not found');
    }

    return branch;
  }

  public async updateBranch(id: string, data: UpdateBranchInput) {
    const branch = await prisma.branch.findUnique({
      where: {
        id,
      },
    });

    if (!branch) {
      throw new AppError(404, 'Branch not found');
    }

    const updatedBranch = await prisma.branch.update({
      where: {
        id,
      },
      data,
    });

    return updatedBranch;
  }

  async toggleBranchStatus(id: string) {
    // Check if branch exists
    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new AppError(404, 'Branch not found');
    }
    // Toggle the is_active status
    const updatedBranch = await prisma.branch.update({
      where: { id },
      data: { is_active: !branch.is_active },
    });
    console.log('Updated Branch:', updatedBranch, 'is_active:', updatedBranch.is_active, branch);
    return updatedBranch;
  }

  public async listBranches({
    page = 1,
    limit = 10,
    search,
    is_active = true,
  }: {
    page?: number;
    limit?: number;
    search?: string;
    is_active?: boolean;
  }) {
    const where: Prisma.BranchWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (is_active !== undefined) {
      where.is_active = is_active;
    }

    const [total, branches] = await Promise.all([
      prisma.branch.count({ where }),
      prisma.branch.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          created_at: 'desc',
        },
      }),
    ]);

    return {
      data: branches,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
