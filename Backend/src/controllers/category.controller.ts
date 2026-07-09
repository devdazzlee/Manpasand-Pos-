import { Request, Response } from 'express';
import { CategoryService, invalidateWebCategoryCache } from '../services/category.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';

const categoryService = new CategoryService();

export const uploadCategoryImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return new ApiResponse(null, 'No image file provided', 400, false).send(res);
  }

  const url = await categoryService.uploadCategoryImageFile(req.file);
  new ApiResponse({ url }, 'Category image uploaded successfully').send(res);
});

async function applyCategoryImageChanges(
  categoryId: string,
  body: { image_url?: string; remove_image?: boolean },
): Promise<void> {
  if (body.remove_image) {
    await categoryService.clearCategoryImages(categoryId);
    return;
  }

  if (typeof body.image_url === 'string' && body.image_url.trim()) {
    await categoryService.setCategoryImageUrl(categoryId, body.image_url.trim());
  }
}

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const { image_url, remove_image, ...categoryFields } = req.body;
  const category = await categoryService.createCategory(categoryFields);

  await applyCategoryImageChanges(category.id, { image_url, remove_image });
  await invalidateWebCategoryCache();

  const fresh = await categoryService.getCategoryById(category.id);
  new ApiResponse(fresh, 'Category created successfully', 201).send(res);
});

export const getCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.getCategoryById(req.params.id);
  new ApiResponse(category, 'Category retrieved successfully').send(res);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const { image_url, remove_image, ...categoryFields } = req.body;
  await categoryService.updateCategory(req.params.id, categoryFields);
  await applyCategoryImageChanges(req.params.id, { image_url, remove_image });
  await invalidateWebCategoryCache();

  const fresh = await categoryService.getCategoryById(req.params.id);
  new ApiResponse(fresh, 'Category updated successfully').send(res);
});

export const toggleCategoryStatus = asyncHandler(async (req: Request, res: Response) => {
  await categoryService.toggleCategoryStatus(req.params.id);
  await invalidateWebCategoryCache();
  new ApiResponse(null, 'Category status changed successfully').send(res);
});

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit, search, is_active, branch_id } = req.query;

  const parsedLimit =
    typeof limit === 'string' && limit.trim() !== '' ? Number(limit) : undefined;

  const result = await categoryService.listCategories({
    page: Number(page),
    limit: parsedLimit,
    search: search as string | undefined,
    is_active: is_active ? is_active === 'true' : undefined,
    branch_id: branch_id as string | undefined,
  });

  new ApiResponse(result.data, 'Categories retrieved successfully', 200).send(res);
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.deleteCategory(req.params.id);
  await invalidateWebCategoryCache();
  new ApiResponse(category, 'Category deleted successfully').send(res);
});

export const deleteAllCategories = asyncHandler(async (req: Request, res: Response) => {
  const result = await categoryService.deleteAllCategories();
  await invalidateWebCategoryCache();
  new ApiResponse(
    result,
    `Successfully deleted ${result.deletedCount} categories and ${result.deletedImages} category images`,
    200
  ).send(res);
});
