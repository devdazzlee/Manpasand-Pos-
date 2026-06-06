import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { CreateSizeInput, UpdateSizeInput } from '../validations/size.validation';
import { catalogDefaults, catalogDeleteOptions } from './catalog-defaults.service';

export class SizeService {
    async createSize(data: CreateSizeInput) {
        const existingSize = await prisma.size.findFirst({
            where: {
                name: {
                    equals: data.name,
                    mode: 'insensitive',
                },
            },
        });

        if (existingSize) throw new AppError(400, 'Size already exists');

        const allSizes = await prisma.size.findMany({ select: { code: true } });
        const maxCode = allSizes.reduce((max, s) => {
            const parsed = parseInt(s.code, 10);
            return Number.isFinite(parsed) && parsed > max ? parsed : max;
        }, 999);
        const newCode = (maxCode + 1).toString();

        const size = await prisma.size.create({
            data: {
                ...data,
                code: newCode
            },
        });

        return size;
    }

    async getSizeById(id: string) {
        const size = await prisma.size.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });

        if (!size) throw new AppError(404, 'Size not found');
        return size;
    }

    async updateSize(id: string, data: UpdateSizeInput) {
        await this.getSizeById(id);
        return prisma.size.update({
            where: { id },
            data,
        });
    }

    async listSizes({
        page = 1,
        limit = 10,
        search,
        is_active,
        display_on_pos,
    }: {
        page?: number;
        limit?: number;
        search?: string;
        is_active?: boolean;
        display_on_pos?: boolean;
    }) {
        const where: Prisma.SizeWhereInput = {};

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (is_active !== undefined) {
            where.is_active = is_active;
        }

        if (display_on_pos !== undefined) {
            where.display_on_pos = display_on_pos;
        }

        const [sizes, total] = await Promise.all([
            prisma.size.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    _count: {
                        select: { products: true },
                    },
                },
            }),
            prisma.size.count({ where }),
        ]);

        return {
            data: sizes.map(s => ({
                ...s,
                product_count: s._count.products,
                _count: undefined,
            })),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async deleteSize(id: string) {
        const size = await prisma.size.findUnique({ where: { id } });
        if (!size) throw new AppError(404, 'Size not found');

        await prisma.$transaction(async (tx) => {
            const defaultSizeId = await catalogDefaults.ensureDefaultSize(tx, id);
            await tx.product.updateMany({
                where: { size_id: id },
                data: { size_id: defaultSizeId },
            });
            await tx.size.delete({ where: { id } });
        }, catalogDeleteOptions);

        return { message: 'Size deleted successfully' };
    }
}