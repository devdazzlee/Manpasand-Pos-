import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { CreateCategoryInput, UpdateCategoryInput } from '../validations/category.validation';
import { imageService } from './common/cloudinaryService';
import { catalogDefaults, catalogDeleteOptions } from './catalog-defaults.service';
import { invalidatePattern } from '../utils/webCache';

const CATEGORY_CLOUDINARY_FOLDER = 'manpasand/categories';

const CATEGORY_IMAGE_INCLUDE = {
  CategoryImages: {
    where: { status: 'COMPLETE' as const },
    select: { image: true },
    take: 1,
    orderBy: { created_at: 'desc' as const },
  },
} satisfies Prisma.CategoryInclude;

/** Single source of truth: CategoryImages table (Cloudinary URLs). */
function resolveCategoryImage(
  category: { CategoryImages?: { image: string }[] },
): string | null {
  return category.CategoryImages?.[0]?.image ?? null;
}

export async function invalidateWebCategoryCache(): Promise<void> {
  await Promise.all([
    invalidatePattern('home:'),
    invalidatePattern('categories:'),
    invalidatePattern('category:'),
  ]);
}

export class CategoryService {
  async createCategory(data: CreateCategoryInput) {
    const { image_url: _imageUrl, remove_image: _removeImage, ...fields } = data;

    const [existingSlug, allCategories] = await Promise.all([
      prisma.category.findUnique({
        where: { slug: fields.slug },
      }),
      prisma.category.findMany({
        select: { code: true },
      }),
    ]);

    if (existingSlug) {
      throw new AppError(400, 'Category with this slug already exists');
    }

    let maxCode = 999;
    allCategories.forEach(cat => {
      const codeNum = parseInt(cat.code, 10);
      if (!isNaN(codeNum) && codeNum.toString() === cat.code) {
        if (codeNum > maxCode) maxCode = codeNum;
      }
    });

    const newCode = (maxCode + 1).toString();

    return prisma.category.create({
      data: {
        ...fields,
        code: newCode,
        display_on_branches: fields.display_on_branches || [],
      },
    });
  }

  async getCategoryById(id: string) {
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        branch: true,
        products: {
          where: { is_active: true },
          select: { id: true, name: true },
        },
        ...CATEGORY_IMAGE_INCLUDE,
      },
    });

    if (!category) {
      throw new AppError(404, 'Category not found');
    }

    const { CategoryImages, ...rest } = category;
    return {
      ...rest,
      image: resolveCategoryImage(category),
    };
  }

  async updateCategory(id: string, data: UpdateCategoryInput) {
    const { image_url: _imageUrl, remove_image: _removeImage, ...fields } = data;
    const category = await this.getCategoryById(id);

    if (fields.slug && fields.slug !== category.slug) {
      const existingSlug = await prisma.category.findUnique({
        where: { slug: fields.slug },
      });
      if (existingSlug) {
        throw new AppError(400, 'Category with this slug already exists');
      }
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...fields,
        display_on_branches: fields.display_on_branches || category.display_on_branches,
      },
      include: CATEGORY_IMAGE_INCLUDE,
    });

    const { CategoryImages, ...rest } = updated;
    return {
      ...rest,
      image: resolveCategoryImage(updated),
    };
  }

  async toggleCategoryStatus(id: string) {
    const category = await this.getCategoryById(id);
    return prisma.category.update({
      where: { id },
      data: { is_active: !category.is_active },
    });
  }

  async listCategories({
    page = 1,
    limit,
    search,
    is_active,
    branch_id,
  }: {
    page?: number;
    limit?: number;
    search?: string;
    is_active?: boolean;
    branch_id?: string;
  }) {
    const where: Prisma.CategoryWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (is_active !== undefined) {
      where.is_active = is_active;
    }

    if (branch_id) {
      where.branch_id = branch_id;
    }

    const shouldPaginate =
      typeof limit === 'number' && Number.isFinite(limit) && limit > 0;

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        skip: shouldPaginate ? (page - 1) * limit : undefined,
        take: shouldPaginate ? limit : undefined,
        orderBy: { created_at: 'desc' },
        include: {
          branch: {
            select: { id: true, name: true, code: true },
          },
          ...CATEGORY_IMAGE_INCLUDE,
          _count: {
            select: { products: true },
          },
        },
      }),
      prisma.category.count({ where }),
    ]);

    return {
      data: categories.map(c => {
        const { CategoryImages, _count, ...rest } = c;
        return {
          ...rest,
          image: resolveCategoryImage(c),
          product_count: _count.products,
        };
      }),
      meta: {
        total,
        page,
        limit: shouldPaginate ? limit : total,
        totalPages: shouldPaginate ? Math.ceil(total / limit) : 1,
      },
    };
  }

  async getCategories() {
    return prisma.category.findMany({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
      include: CATEGORY_IMAGE_INCLUDE,
    });
  }

  /**
   * Link a Cloudinary URL to a category (same pattern as product image_urls).
   * Replaces any existing category images.
   */
  async setCategoryImageUrl(categoryId: string, imageUrl: string) {
    const existing = await prisma.categoryImages.findMany({
      where: { category_id: categoryId, status: 'COMPLETE' },
      select: { image: true },
    });

    const oldCloudinaryUrls = existing
      .map(row => row.image)
      .filter(url => url.includes('cloudinary.com'));

    await prisma.$transaction([
      prisma.categoryImages.deleteMany({ where: { category_id: categoryId } }),
      prisma.categoryImages.create({
        data: {
          category_id: categoryId,
          image: imageUrl,
          status: 'COMPLETE',
        },
      }),
    ]);

    if (oldCloudinaryUrls.length > 0) {
      await imageService.deleteMultipleImages(oldCloudinaryUrls);
    }
  }

  async clearCategoryImages(categoryId: string) {
    const existing = await prisma.categoryImages.findMany({
      where: { category_id: categoryId, status: 'COMPLETE' },
      select: { image: true },
    });

    await prisma.categoryImages.deleteMany({ where: { category_id: categoryId } });

    const cloudinaryUrls = existing
      .map(row => row.image)
      .filter(url => url.includes('cloudinary.com'));

    if (cloudinaryUrls.length > 0) {
      await imageService.deleteMultipleImages(cloudinaryUrls);
    }
  }

  async uploadCategoryImageFile(file: Express.Multer.File): Promise<string> {
    return imageService.uploadImage(file, { folder: CATEGORY_CLOUDINARY_FOLDER });
  }

  async deleteCategory(id: string) {
    const category = await this.getCategoryById(id);
    await this.clearCategoryImages(id);

    await prisma.$transaction(async (tx) => {
      const defaultCategoryId = await catalogDefaults.ensureDefaultCategory(tx, id);

      await tx.product.updateMany({
        where: { category_id: id },
        data: { category_id: defaultCategoryId },
      });
      await tx.categoryImages.deleteMany({ where: { category_id: id } });
      await tx.category.delete({ where: { id: category.id } });
    }, catalogDeleteOptions);

    return category;
  }

  async deleteAllCategories(): Promise<{
    deletedCount: number;
    deletedImages: number;
  }> {
    return prisma.$transaction(async (tx) => {
      const deletedImages = await tx.categoryImages.deleteMany({});
      const deletedCategories = await tx.category.deleteMany({});

      return {
        deletedCount: deletedCategories.count,
        deletedImages: deletedImages.count,
      };
    });
  }
}
