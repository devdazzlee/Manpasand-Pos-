import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { asNumber } from '../utils/helpers';
import { applyWeightedAverageCost, productOnHandQty } from './product-cost.service';

type ComponentLine = { productId: string; quantity: number };

type CreateAssemblyInput = {
  branchId: string;
  finishedProductId: string;
  finishedQuantity: number;
  components: ComponentLine[];
  notes?: string;
  referenceNo?: string;
  createdBy: string;
};

const round = (n: number) => Math.round(n * 1000) / 1000;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

const generateRef = () =>
  `ASM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

async function changeStock(
  tx: Prisma.TransactionClient,
  opts: {
    productId: string;
    branchId: string;
    delta: number;
    movementType: 'ASSEMBLY_IN' | 'ASSEMBLY_OUT';
    referenceId: string;
    notes: string;
    unitCost?: number | null;
    createdBy: string;
    productName: string;
  },
) {
  const stock = await tx.stock.findUnique({
    where: { product_id_branch_id: { product_id: opts.productId, branch_id: opts.branchId } },
  });
  const previous = stock ? asNumber(stock.current_quantity) : 0;
  const next = round(previous + opts.delta);
  if (next < -0.0001) {
    throw new AppError(
      400,
      `${opts.productName}: only ${previous} in stock — need ${Math.abs(opts.delta)}`,
    );
  }
  const newQty = Math.max(0, next);

  if (stock) {
    await tx.stock.update({
      where: { product_id_branch_id: { product_id: opts.productId, branch_id: opts.branchId } },
      data: { current_quantity: newQty },
    });
  } else {
    await tx.stock.create({
      data: {
        product_id: opts.productId,
        branch_id: opts.branchId,
        current_quantity: newQty,
      },
    });
  }

  await tx.stockMovement.create({
    data: {
      product_id: opts.productId,
      branch_id: opts.branchId,
      movement_type: opts.movementType,
      reference_id: opts.referenceId,
      reference_type: 'assembly',
      quantity_change: opts.delta,
      previous_qty: previous,
      new_qty: newQty,
      unit_cost: opts.unitCost != null ? opts.unitCost : undefined,
      notes: opts.notes,
      created_by: opts.createdBy,
    },
  });

  return { previous, newQty };
}

export class StockAssemblyService {
  async createAssembly(data: CreateAssemblyInput) {
    const finishedQty = round(Number(data.finishedQuantity));
    if (!Number.isFinite(finishedQty) || finishedQty <= 0) {
      throw new AppError(400, 'Finished quantity must be greater than 0');
    }
    if (!data.components?.length) throw new AppError(400, 'Add at least one component product');

    const seen = new Set<string>();
    const components: ComponentLine[] = [];
    for (const line of data.components) {
      if (line.productId === data.finishedProductId) {
        throw new AppError(400, 'Finished product cannot also be a component');
      }
      if (seen.has(line.productId)) {
        throw new AppError(400, 'Each component can only appear once');
      }
      const qty = round(Number(line.quantity));
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new AppError(400, 'Each component needs a quantity greater than 0');
      }
      seen.add(line.productId);
      components.push({ productId: line.productId, quantity: qty });
    }

    const branch = await prisma.branch.findUnique({ where: { id: data.branchId }, select: { id: true, name: true } });
    if (!branch) throw new AppError(404, 'Branch not found');

    const productIds = [data.finishedProductId, ...components.map((c) => c.productId)];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, purchase_rate: true, is_active: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const finished = byId.get(data.finishedProductId);
    if (!finished) throw new AppError(404, 'Finished product not found');
    if (!finished.is_active) throw new AppError(400, `${finished.name} is inactive`);
    for (const c of components) {
      const p = byId.get(c.productId);
      if (!p) throw new AppError(404, 'A component product was not found');
      if (!p.is_active) throw new AppError(400, `${p.name} is inactive`);
    }

    const referenceNo = data.referenceNo?.trim() || generateRef();
    const noteBase = data.notes?.trim() || `Assembled ${finished.name}`;

    return prisma.$transaction(async (tx) => {
      // Cost of finished unit = sum(component qty * component cost) / finished qty
      let totalComponentCost = 0;
      const pricedComponents: Array<ComponentLine & { unitCost: number; name: string }> = [];
      for (const c of components) {
        const p = byId.get(c.productId)!;
        const unitCost = asNumber(p.purchase_rate);
        totalComponentCost += unitCost * c.quantity;
        pricedComponents.push({ ...c, unitCost, name: p.name });
      }
      const finishedUnitCost = round4(totalComponentCost / finishedQty);

      const onHandBefore = await productOnHandQty(tx, data.finishedProductId);

      const assembly = await tx.stockAssembly.create({
        data: {
          reference_no: referenceNo,
          branch_id: data.branchId,
          finished_product_id: data.finishedProductId,
          finished_quantity: finishedQty,
          unit_cost: finishedUnitCost,
          notes: data.notes?.trim() || null,
          created_by: data.createdBy,
          lines: {
            create: pricedComponents.map((c) => ({
              product_id: c.productId,
              quantity: c.quantity,
              unit_cost: c.unitCost,
            })),
          },
        },
        include: {
          finished_product: { select: { id: true, name: true, sku: true, code: true } },
          branch: { select: { id: true, name: true } },
          user: { select: { email: true, name: true } },
          lines: {
            include: { product: { select: { id: true, name: true, sku: true, code: true } } },
          },
        },
      });

      for (const c of pricedComponents) {
        await changeStock(tx, {
          productId: c.productId,
          branchId: data.branchId,
          delta: -c.quantity,
          movementType: 'ASSEMBLY_OUT',
          referenceId: assembly.id,
          notes: `${noteBase} · Ref: ${referenceNo} · used in ${finished.name}`,
          unitCost: c.unitCost,
          createdBy: data.createdBy,
          productName: c.name,
        });
      }

      await changeStock(tx, {
        productId: data.finishedProductId,
        branchId: data.branchId,
        delta: finishedQty,
        movementType: 'ASSEMBLY_IN',
        referenceId: assembly.id,
        notes: `${noteBase} · Ref: ${referenceNo}`,
        unitCost: finishedUnitCost,
        createdBy: data.createdBy,
        productName: finished.name,
      });

      await applyWeightedAverageCost(tx, {
        productId: data.finishedProductId,
        onHandBefore,
        incomingQty: finishedQty,
        unitCost: finishedUnitCost,
        userId: data.createdBy,
        source: 'ASSEMBLY',
      });

      return assembly;
    });
  }

  async listAssemblies(params: {
    page?: number;
    limit?: number;
    branchId?: string;
    productId?: string;
    startDate?: Date;
    endDate?: Date;
    search?: string;
  }) {
    const page = Math.max(params.page || 1, 1);
    const limit = Math.min(Math.max(params.limit || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.StockAssemblyWhereInput = {};
    if (params.branchId) where.branch_id = params.branchId;
    if (params.productId) {
      where.OR = [
        { finished_product_id: params.productId },
        { lines: { some: { product_id: params.productId } } },
      ];
    }
    if (params.startDate || params.endDate) {
      where.created_at = {};
      if (params.startDate) where.created_at.gte = params.startDate;
      if (params.endDate) where.created_at.lte = params.endDate;
    }
    const search = params.search?.trim();
    if (search) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { reference_no: { contains: search, mode: 'insensitive' } },
            { notes: { contains: search, mode: 'insensitive' } },
            { finished_product: { name: { contains: search, mode: 'insensitive' } } },
            { finished_product: { sku: { contains: search, mode: 'insensitive' } } },
            { finished_product: { code: { contains: search, mode: 'insensitive' } } },
            { branch: { name: { contains: search, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.stockAssembly.count({ where }),
      prisma.stockAssembly.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          finished_product: { select: { id: true, name: true, sku: true, code: true } },
          branch: { select: { id: true, name: true } },
          user: { select: { email: true, name: true } },
          lines: {
            include: { product: { select: { id: true, name: true, sku: true, code: true } } },
          },
        },
      }),
    ]);

    return {
      data: rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getAssembly(id: string) {
    const row = await prisma.stockAssembly.findUnique({
      where: { id },
      include: {
        finished_product: { select: { id: true, name: true, sku: true, code: true, purchase_rate: true } },
        branch: { select: { id: true, name: true } },
        user: { select: { email: true, name: true } },
        lines: {
          include: { product: { select: { id: true, name: true, sku: true, code: true, purchase_rate: true } } },
        },
      },
    });
    if (!row) throw new AppError(404, 'Assembly not found');
    return row;
  }
}
