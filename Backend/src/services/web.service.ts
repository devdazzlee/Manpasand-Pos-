import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { withCache, WEB_CACHE_TTL, WEB_CACHE_PREFIXES } from '../utils/webCache';
import { subDays } from 'date-fns';

type SortKey =
  | 'newest'
  | 'oldest'
  | 'price-asc'
  | 'price-desc'
  | 'name-asc'
  | 'name-desc'
  | 'best-selling';

const SORT_MAP: Record<Exclude<SortKey, 'best-selling'>, Prisma.ProductOrderByWithRelationInput> = {
  newest: { created_at: 'desc' },
  oldest: { created_at: 'asc' },
  'price-asc': { sales_rate_inc_dis_and_tax: 'asc' },
  'price-desc': { sales_rate_inc_dis_and_tax: 'desc' },
  'name-asc': { name: 'asc' },
  'name-desc': { name: 'desc' },
};

/** Rolling window for “most selling” — long enough to be stable, short enough to stay current. */
const BEST_SELLING_WINDOW_DAYS = 90;

const PRODUCT_CARD_SELECT = {
  id: true,
  name: true,
  code: true,
  sku: true,
  description: true,
  sales_rate_exc_dis_and_tax: true,
  sales_rate_inc_dis_and_tax: true,
  discount_amount: true,
  is_featured: true,
  is_active: true,
  display_on_website: true,
  category_id: true,
  created_at: true,
  category: { select: { id: true, name: true, slug: true } },
  unit: { select: { id: true, name: true } },
  ProductImage: {
    where: { status: 'COMPLETE' as const },
    select: { image: true },
    take: 1,
  },
} satisfies Prisma.ProductSelect;

const CATEGORY_CARD_SELECT = {
  id: true,
  name: true,
  slug: true,
  code: true,
  is_active: true,
  CategoryImages: {
    where: { status: 'COMPLETE' as const },
    select: { image: true },
    take: 1,
  },
  _count: { select: { products: { where: { is_active: true, display_on_website: true } } } },
} satisfies Prisma.CategorySelect;

type ProductCard = Prisma.ProductGetPayload<{ select: typeof PRODUCT_CARD_SELECT }>;
type CategoryCard = Prisma.CategoryGetPayload<{ select: typeof CATEGORY_CARD_SELECT }>;

function shapeProduct(p: ProductCard) {
  const image = p.ProductImage?.[0]?.image ?? null;
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    sku: p.sku,
    description: p.description,
    price: p.sales_rate_inc_dis_and_tax,
    base_price: p.sales_rate_exc_dis_and_tax,
    discount_amount: p.discount_amount,
    is_featured: p.is_featured,
    is_active: p.is_active,
    category_id: p.category_id,
    category: p.category,
    unit: p.unit,
    image,
    images: p.ProductImage?.map((i) => i.image) ?? [],
    created_at: p.created_at,
  };
}

function shapeCategory(c: CategoryCard) {
  const image = c.CategoryImages?.[0]?.image ?? null;
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    code: c.code,
    is_active: c.is_active,
    image,
    product_count: c._count.products,
  };
}

function clampLimit(value: unknown, fallback: number, max = 100): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : (value as number);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function clampPage(value: unknown): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : (value as number);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

export class WebService {
  async getHome(opts: { featuredLimit?: number; bestLimit?: number; categoriesLimit?: number } = {}) {
    const featuredLimit = clampLimit(opts.featuredLimit, 8, 24);
    // Homepage “Manpasand Favorites” uses best sellers. Pass best_limit=0 to skip.
    const bestLimit =
      opts.bestLimit === 0 ? 0 : clampLimit(opts.bestLimit ?? featuredLimit, 0, 24);
    const categoriesLimit = clampLimit(opts.categoriesLimit, 24, 50);
    const cacheKey = `${WEB_CACHE_PREFIXES.HOME}v6:f${featuredLimit}:b${bestLimit}:c${categoriesLimit}`;

    return withCache(cacheKey, WEB_CACHE_TTL.HOME, async () => {
      const [featured, bestPack, categories, productCount, featuredTotal, categoriesTotal] =
        await Promise.all([
          this.loadFeatured(featuredLimit),
          bestLimit > 0
            ? this.loadBestSellers(bestLimit)
            : Promise.resolve({ products: [] as ReturnType<typeof shapeProduct>[], total: 0 }),
          this.loadHomeCategories(categoriesLimit),
          prisma.product.count({ where: { is_active: true, display_on_website: true } }),
          prisma.product.count({ where: { is_active: true, display_on_website: true, is_featured: true } }),
          prisma.category.count({ where: { is_active: true } }),
        ]);

      return {
        featuredProducts: featured,
        bestSellingProducts: bestPack.products,
        categories,
        product_count: productCount,
        featured_total: featuredTotal,
        best_selling_total: bestPack.total,
        categories_total: categoriesTotal,
      };
    });
  }

  /**
   * Rank website products by units sold in the last N days.
   * Primary signal: POS completed sales (SaleItem). Secondary: paid/processing web orders.
   * Returns product ids sorted most → least sold.
   */
  private async rankBestSellingIds(opts: {
    take: number;
    skip?: number;
    /** Extra ProductWhere filters (category, search, price…). */
    productWhere?: Prisma.ProductWhereInput;
  }): Promise<{ ids: string[]; totalWithSales: number }> {
    const since = subDays(new Date(), BEST_SELLING_WINDOW_DAYS);
    const productFilter: Prisma.ProductWhereInput = {
      is_active: true,
      display_on_website: true,
      ...(opts.productWhere || {}),
    };

    const [posRows, webRows] = await Promise.all([
      prisma.saleItem.groupBy({
        by: ['product_id'],
        where: {
          item_type: 'ORIGINAL',
          quantity: { gt: 0 },
          created_at: { gte: since },
          sale: { status: 'COMPLETED' },
          product: productFilter,
        },
        _sum: { quantity: true },
      }),
      prisma.orderItem.groupBy({
        by: ['product_id'],
        where: {
          quantity: { gt: 0 },
          created_at: { gte: since },
          order: { status: { in: ['COMPLETED', 'PROCESSING'] } },
          product: productFilter,
        },
        _sum: { quantity: true },
      }),
    ]);

    const scores = new Map<string, number>();
    for (const row of posRows) {
      const qty = Number(row._sum.quantity ?? 0);
      if (qty > 0) scores.set(row.product_id, qty);
    }
    for (const row of webRows) {
      const qty = Number(row._sum.quantity ?? 0);
      if (qty <= 0) continue;
      scores.set(row.product_id, (scores.get(row.product_id) || 0) + qty);
    }

    const ranked = [...scores.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

    const skip = Math.max(0, opts.skip ?? 0);
    const ids = ranked.slice(skip, skip + opts.take).map(([id]) => id);
    return { ids, totalWithSales: ranked.length };
  }

  /** Fetch product cards and keep the caller’s id order (Prisma findMany does not). */
  private async productsInOrder(ids: string[]) {
    if (!ids.length) return [] as ReturnType<typeof shapeProduct>[];
    const rows = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: PRODUCT_CARD_SELECT,
    });
    const byId = new Map(rows.map((p) => [p.id, shapeProduct(p)]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as ReturnType<typeof shapeProduct>[];
  }

  private async loadFeatured(limit: number) {
    const featured = await prisma.product.findMany({
      where: { is_featured: true, is_active: true, display_on_website: true },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: PRODUCT_CARD_SELECT,
    });

    if (featured.length >= limit) return featured.map(shapeProduct);

    const need = limit - featured.length;
    const excludeIds = featured.map((p) => p.id);
    const fillers = await prisma.product.findMany({
      where: {
        is_active: true,
        display_on_website: true,
        id: excludeIds.length ? { notIn: excludeIds } : undefined,
      },
      orderBy: { created_at: 'desc' },
      take: need,
      select: PRODUCT_CARD_SELECT,
    });

    return [...featured, ...fillers].map(shapeProduct);
  }

  private async loadBestSellers(limit: number) {
    const { ids, totalWithSales } = await this.rankBestSellingIds({ take: limit });
    let products = await this.productsInOrder(ids);

    // Not enough sales history yet — fill with featured, then newest active SKUs.
    if (products.length < limit) {
      const exclude = new Set(products.map((p) => p.id));
      const need = limit - products.length;
      const featuredFill = await prisma.product.findMany({
        where: {
          is_featured: true,
          is_active: true,
          display_on_website: true,
          id: exclude.size ? { notIn: [...exclude] } : undefined,
        },
        orderBy: { created_at: 'desc' },
        take: need,
        select: PRODUCT_CARD_SELECT,
      });
      for (const p of featuredFill) {
        products.push(shapeProduct(p));
        exclude.add(p.id);
      }
      if (products.length < limit) {
        const stillNeed = limit - products.length;
        const newestFill = await prisma.product.findMany({
          where: {
            is_active: true,
            display_on_website: true,
            id: exclude.size ? { notIn: [...exclude] } : undefined,
          },
          orderBy: { created_at: 'desc' },
          take: stillNeed,
          select: PRODUCT_CARD_SELECT,
        });
        products = [...products, ...newestFill.map(shapeProduct)];
      }
    }

    // Load-more total: products with real sales in the window (not filler-only SKUs).
    // If nothing has sold yet, expose website catalog size so the grid can still paginate.
    const websiteTotal = await prisma.product.count({
      where: { is_active: true, display_on_website: true },
    });
    const total = totalWithSales > 0 ? Math.max(totalWithSales, products.length) : websiteTotal;

    return { products, total };
  }

  private async loadHomeCategories(limit: number) {
    const categories = await prisma.category.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      take: limit,
      select: CATEGORY_CARD_SELECT,
    });
    return categories.map(shapeCategory);
  }

  async listCategories(opts: { page?: number; limit?: number; search?: string; all?: boolean }) {
    const all = !!opts.all;
    const limit = all ? 200 : clampLimit(opts.limit, 12, 50);
    const page = clampPage(opts.page);
    const search = (opts.search ?? '').trim();

    const cacheKey = all
      ? `${WEB_CACHE_PREFIXES.CATEGORIES_LIST}v2:all`
      : `${WEB_CACHE_PREFIXES.CATEGORIES_LIST}v2:p${page}:l${limit}:q${search.toLowerCase()}`;

    return withCache(cacheKey, WEB_CACHE_TTL.CATEGORIES_LIST, async () => {
      const where: Prisma.CategoryWhereInput = { is_active: true };
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [rows, total] = await Promise.all([
        prisma.category.findMany({
          where,
          orderBy: { name: 'asc' },
          skip: all ? undefined : (page - 1) * limit,
          take: all ? undefined : limit,
          select: CATEGORY_CARD_SELECT,
        }),
        prisma.category.count({ where }),
      ]);

      return {
        data: rows.map(shapeCategory),
        meta: {
          total,
          page: all ? 1 : page,
          limit: all ? total : limit,
          totalPages: all ? 1 : Math.max(1, Math.ceil(total / limit)),
        },
      };
    });
  }

  async getCategoryBySlug(slug: string, opts: { page?: number; limit?: number; sort?: SortKey }) {
    const trimmed = slug?.trim();
    if (!trimmed) throw new AppError(400, 'Category slug is required');

    const limit = clampLimit(opts.limit, 12, 48);
    const page = clampPage(opts.page);
    const sort: SortKey =
      opts.sort === 'best-selling' || (opts.sort && opts.sort in SORT_MAP) ? (opts.sort as SortKey) : 'newest';
    const cacheKey = `${WEB_CACHE_PREFIXES.CATEGORY_DETAIL}${trimmed}:p${page}:l${limit}:s${sort}`;

    return withCache(cacheKey, WEB_CACHE_TTL.CATEGORY_DETAIL, async () => {
      const category = await prisma.category.findUnique({
        where: { slug: trimmed },
        select: CATEGORY_CARD_SELECT,
      });

      if (!category || !category.is_active) {
        throw new AppError(404, 'Category not found');
      }

      const productsWhere: Prisma.ProductWhereInput = {
        category_id: category.id,
        is_active: true,
        display_on_website: true,
      };

      if (sort === 'best-selling') {
        const ranked = await this.listByBestSelling(productsWhere, page, limit);
        return {
          category: shapeCategory(category),
          products: ranked.data,
          meta: { ...ranked.meta, sort },
        };
      }

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where: productsWhere,
          orderBy: SORT_MAP[sort],
          skip: (page - 1) * limit,
          take: limit,
          select: PRODUCT_CARD_SELECT,
        }),
        prisma.product.count({ where: productsWhere }),
      ]);

      return {
        category: shapeCategory(category),
        products: products.map(shapeProduct),
        meta: {
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          sort,
        },
      };
    });
  }

  /** Page through best sellers while preserving rank order and optional filters. */
  private async listByBestSelling(productWhere: Prisma.ProductWhereInput, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const { ids, totalWithSales } = await this.rankBestSellingIds({
      take: limit,
      skip,
      productWhere: {
        // productWhere already includes is_active / display_on_website for callers that set them;
        // strip duplicates by spreading after base flags in rankBestSellingIds.
        ...productWhere,
      },
    });

    let data = await this.productsInOrder(ids);

    // Later pages / cold catalogs: fill remaining slots with newest matching products.
    if (data.length < limit && page === 1) {
      const exclude = data.map((p) => p.id);
      const fillers = await prisma.product.findMany({
        where: {
          ...productWhere,
          id: exclude.length ? { notIn: exclude } : undefined,
        },
        orderBy: { created_at: 'desc' },
        take: limit - data.length,
        select: PRODUCT_CARD_SELECT,
      });
      data = [...data, ...fillers.map(shapeProduct)];
    }

    const filteredTotal = await prisma.product.count({ where: productWhere });
    const total = totalWithSales > 0 ? Math.min(filteredTotal, Math.max(totalWithSales, data.length)) : filteredTotal;

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        sort: 'best-selling' as const,
      },
    };
  }

  async listProducts(opts: {
    page?: number;
    limit?: number;
    search?: string;
    category_id?: string;
    category_slug?: string;
    subcategory_id?: string;
    min_price?: number;
    max_price?: number;
    sort?: SortKey;
    featured?: boolean;
  }) {
    const limit = clampLimit(opts.limit, 12, 48);
    const page = clampPage(opts.page);
    const sort: SortKey =
      opts.sort === 'best-selling' || (opts.sort && opts.sort in SORT_MAP) ? (opts.sort as SortKey) : 'newest';
    const search = (opts.search ?? '').trim();

    const where: Prisma.ProductWhereInput = { is_active: true, display_on_website: true };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (opts.featured) where.is_featured = true;

    if (opts.category_id) {
      where.category_id = opts.category_id;
    } else if (opts.category_slug) {
      where.category = { slug: opts.category_slug };
    }

    if (opts.subcategory_id) where.subcategory_id = opts.subcategory_id;

    const min = typeof opts.min_price === 'number' && Number.isFinite(opts.min_price) ? opts.min_price : undefined;
    const max = typeof opts.max_price === 'number' && Number.isFinite(opts.max_price) ? opts.max_price : undefined;
    if (min !== undefined || max !== undefined) {
      where.sales_rate_inc_dis_and_tax = {
        ...(min !== undefined ? { gte: min } : {}),
        ...(max !== undefined ? { lte: max } : {}),
      };
    }

    const cacheKey = `${WEB_CACHE_PREFIXES.PRODUCT_LIST}v2:p${page}:l${limit}:s${sort}:q${search.toLowerCase()}:c${
      opts.category_id ?? opts.category_slug ?? ''
    }:sc${opts.subcategory_id ?? ''}:min${min ?? ''}:max${max ?? ''}:f${opts.featured ? 1 : 0}`;

    return withCache(cacheKey, WEB_CACHE_TTL.PRODUCT_LIST, async () => {
      if (sort === 'best-selling') {
        return this.listByBestSelling(where, page, limit);
      }

      const [rows, total] = await Promise.all([
        prisma.product.findMany({
          where,
          orderBy: SORT_MAP[sort],
          skip: (page - 1) * limit,
          take: limit,
          select: PRODUCT_CARD_SELECT,
        }),
        prisma.product.count({ where }),
      ]);

      return {
        data: rows.map(shapeProduct),
        meta: {
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          sort,
        },
      };
    });
  }

  async getProductById(id: string) {
    const trimmed = id?.trim();
    if (!trimmed) throw new AppError(400, 'Product id is required');

    return withCache(`${WEB_CACHE_PREFIXES.PRODUCT_DETAIL}${trimmed}`, WEB_CACHE_TTL.PRODUCT_DETAIL, async () => {
      const product = await prisma.product.findUnique({
        where: { id: trimmed },
        select: {
          ...PRODUCT_CARD_SELECT,
          ProductImage: {
            where: { status: 'COMPLETE' as const },
            select: { image: true },
          },
          tax: { select: { id: true, name: true, percentage: true } },
          brand: { select: { id: true, name: true } },
          subcategory: { select: { id: true, name: true } },
          stock: { select: { current_quantity: true, reserved_quantity: true } },
          website_quantity_options: true,
        },
      });

      if (!product || !product.is_active || product.display_on_website === false) {
        throw new AppError(404, 'Product not found');
      }

      const totalStock = (product.stock ?? []).reduce(
        (sum, s) => sum + Number(s.current_quantity ?? 0) - Number(s.reserved_quantity ?? 0),
        0
      );

      const shaped = shapeProduct(product as ProductCard);
      return {
        ...shaped,
        images: product.ProductImage?.map((i) => i.image) ?? [],
        tax: product.tax,
        brand: product.brand,
        subcategory: product.subcategory,
        in_stock: totalStock > 0,
        available_stock: totalStock,
        // Product's own website quantity choices (product unit); empty = website default list.
        website_quantity_options: product.website_quantity_options ?? [],
      };
    });
  }

  async suggestProducts(query: string, limit = 8) {
    const trimmed = query?.trim();
    if (!trimmed || trimmed.length < 2) return [];

    const safeLimit = clampLimit(limit, 8, 20);
    const cacheKey = `${WEB_CACHE_PREFIXES.SEARCH_SUGGEST}${trimmed.toLowerCase()}:l${safeLimit}`;

    return withCache(cacheKey, WEB_CACHE_TTL.SEARCH_SUGGEST, async () => {
      const rows = await prisma.product.findMany({
        where: {
          is_active: true,
          display_on_website: true,
          OR: [
            { name: { contains: trimmed, mode: 'insensitive' } },
            { sku: { contains: trimmed, mode: 'insensitive' } },
          ],
        },
        orderBy: { created_at: 'desc' },
        take: safeLimit,
        select: {
          id: true,
          name: true,
          sales_rate_inc_dis_and_tax: true,
          category: { select: { id: true, name: true, slug: true } },
          ProductImage: {
            where: { status: 'COMPLETE' as const },
            select: { image: true },
            take: 1,
          },
        },
      });

      return rows.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.sales_rate_inc_dis_and_tax,
        category: p.category,
        image: p.ProductImage?.[0]?.image ?? null,
      }));
    });
  }

  async getProductCount() {
    return withCache(`${WEB_CACHE_PREFIXES.PRODUCT_COUNT}product-count`, WEB_CACHE_TTL.PRODUCT_COUNT, async () => {
      const count = await prisma.product.count({ where: { is_active: true, display_on_website: true } });
      return { count };
    });
  }
}

export default WebService;
