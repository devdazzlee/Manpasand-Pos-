import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "../prisma/client";
import { AppError } from "../utils/apiError";
import { SaleService } from "./sales.service";
import CustomerService from "./customer.service";
import {
  customerCreatePayloadSchema,
  holdSaleCreatePayloadSchema,
  holdSaleDeletePayloadSchema,
  saleCreatePayloadSchema,
  SyncMutationInput,
} from "../validations/sync.validation";

/**
 * Outcome of one outbox entry:
 * - applied:   recorded now
 * - duplicate: already recorded by an earlier upload — the till can drop it
 * - rejected:  permanently invalid; the till keeps it for a manager to review
 * - retry:     transient server problem; the till sends it again later
 */
export type SyncResultStatus = "applied" | "duplicate" | "rejected" | "retry";

export interface SyncResult {
  id: string;
  status: SyncResultStatus;
  result?: unknown;
  error?: string;
}

export interface SyncActor {
  userId: string;
  role?: string;
  branchId?: string;
  authorization?: string;
  selfBase?: string;
}

interface Handler {
  roles: string[];
  run: (payload: Record<string, unknown>, actor: SyncActor, deviceId: string) => Promise<unknown>;
}

const saleService = new SaleService();
const customerService = new CustomerService();

const SALE_ROLES = ["SUPER_ADMIN", "ADMIN", "BRANCH_MANAGER", "CASHIER"];
const HOLD_SALE_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "BRANCH_MANAGER",
  "CASHIER",
  "WAREHOUSE_MANAGER",
  "PURCHASE_MANAGER",
];
const CUSTOMER_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "BRANCH_MANAGER",
  "WAREHOUSE_MANAGER",
  "PURCHASE_MANAGER",
  "CASHIER",
];

export const SYNC_ROLES = [...new Set([...SALE_ROLES, ...HOLD_SALE_ROLES, ...CUSTOMER_ROLES])];

const resolveBranchId = (actor: SyncActor, requested?: string) => {
  const isAdmin = actor.role === "SUPER_ADMIN" || actor.role === "ADMIN";
  if (isAdmin && requested && requested.trim() && requested !== "Not Found") return requested.trim();
  if (actor.branchId && actor.branchId.trim() && actor.branchId !== "Not Found") return actor.branchId.trim();
  return requested?.trim() || undefined;
};

const describeError = (error: unknown): string => {
  if (error instanceof AppError) return error.message;
  if (error instanceof ZodError) return error.issues.map((i) => i.message).join("; ");
  if (error instanceof Error) return error.message;
  return "Unknown sync error";
};

const isPermanentFailure = (error: unknown): boolean => {
  if (error instanceof ZodError) return true;
  if (error instanceof AppError) {
    return error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 408 && error.statusCode !== 429;
  }
  return false;
};

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;

const handlers: Record<string, Handler> = {
  "sale.create": {
    roles: SALE_ROLES,
    run: async (payload, actor, deviceId) => {
      const body = saleCreatePayloadSchema.parse(payload);
      const branchId = resolveBranchId(actor, body.branchId);
      if (!branchId) throw new AppError(400, "No branch for offline sale");

      const existing = await prisma.sale.findFirst({
        where: {
          OR: [{ client_id: body.clientId }, { sale_number: body.saleNumber }],
        },
      });
      if (existing) return { ...existing, duplicate: true };

      return saleService.createSale({
        branchId,
        customerId: body.customerId,
        salespersonId: body.salespersonId,
        paymentMethod: body.paymentMethod,
        payments: body.payments,
        items: body.items,
        discountAmount: body.discountAmount,
        waiveBranchDiscount: body.waiveBranchDiscount,
        createdBy: actor.userId,
        promotionCode: body.promotionCode,
        applyPromotions: body.applyPromotions,
        loyaltyPoints: body.loyaltyPoints,
        giftCards: body.giftCards,
        clientId: body.clientId,
        saleNumber: body.saleNumber,
        saleDate: body.saleDate ? new Date(body.saleDate) : undefined,
        deviceId,
        recordedOffline: body.recordedOffline ?? false,
      });
    },
  },

  "customer.create": {
    roles: CUSTOMER_ROLES,
    run: async (payload) => {
      const { recordedOffline, ...data } = customerCreatePayloadSchema.parse(payload);
      const existing = await prisma.customer.findUnique({ where: { id: data.id } });
      if (existing) return { customer: existing, duplicate: true };
      const email = data.email || null;
      try {
        return await customerService.createShopCustomer({ ...data, email, id: data.id } as any);
      } catch (error) {
        if (recordedOffline && email && error instanceof AppError && /already exists/i.test(error.message)) {
          const created = await customerService.createShopCustomer({
            ...data,
            email: null,
            id: data.id,
          } as any);
          return {
            ...created,
            warning: `Email ${email} already belongs to another customer; saved without it.`,
          };
        }
        throw error;
      }
    },
  },

  "holdSale.create": {
    roles: HOLD_SALE_ROLES,
    run: async (payload, actor) => {
      const body = holdSaleCreatePayloadSchema.parse(payload);
      const existing = await prisma.holdSale.findUnique({ where: { id: body.id } });
      if (existing) return { ...existing, duplicate: true };
      const branchId = resolveBranchId(actor, body.branchId);
      if (!branchId) throw new AppError(400, "No branch for hold sale");
      return saleService.createHoldSale({
        id: body.id,
        branchId,
        customerId: body.customerId ?? undefined,
        createdBy: actor.userId,
        items: body.items as any,
        skipRegisterCheck: true,
      });
    },
  },

  "holdSale.delete": {
    roles: HOLD_SALE_ROLES,
    run: async (payload) => {
      const { id } = holdSaleDeletePayloadSchema.parse(payload);
      const { count } = await prisma.holdSale.deleteMany({ where: { id } });
      return { id, deleted: count > 0 };
    },
  },
};

export class SyncService {
  async push(deviceId: string, mutations: SyncMutationInput[], actor: SyncActor): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const mutation of mutations) {
      results.push(await this.applyOne(deviceId, mutation, actor));
    }
    return results;
  }

  async listReviews({ includeResolved = false }: { includeResolved?: boolean } = {}) {
    const rows = await prisma.syncMutation.findMany({
      where: {
        OR: [{ warning: { not: null } }, { status: "REJECTED" }],
        ...(includeResolved ? {} : { reviewed_at: null }),
      },
      orderBy: { processed_at: "desc" },
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      warning: row.warning,
      error: row.error,
      deviceId: row.device_id,
      userId: row.user_id,
      clientTime: row.client_time,
      processedAt: row.processed_at,
      reviewedAt: row.reviewed_at,
    }));
  }

  async resolveReview(id: string, userId: string) {
    const row = await prisma.syncMutation.findUnique({ where: { id } });
    if (!row) throw new AppError(404, "Review item not found");
    return prisma.syncMutation.update({
      where: { id },
      data: { reviewed_at: row.reviewed_at ?? new Date(), reviewed_by: row.reviewed_by ?? userId },
    });
  }

  private async applyOne(deviceId: string, mutation: SyncMutationInput, actor: SyncActor): Promise<SyncResult> {
    const seen = await prisma.syncMutation.findUnique({ where: { id: mutation.id } });
    if (seen) {
      return seen.status === "APPLIED"
        ? { id: mutation.id, status: "duplicate", result: seen.result }
        : { id: mutation.id, status: "rejected", error: seen.error ?? "Rejected" };
    }

    const handler = handlers[mutation.type];
    if (!handler) {
      return { id: mutation.id, status: "retry", error: `Unsupported mutation type: ${mutation.type}` };
    }

    const clientTime = mutation.createdAt ? new Date(mutation.createdAt) : null;
    try {
      if (!actor.role || !handler.roles.includes(actor.role)) {
        throw new AppError(403, `Your role may not perform ${mutation.type}`);
      }
      let result: unknown;
      try {
        result = await handler.run(mutation.payload, actor, deviceId);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
        result = await handler.run(mutation.payload, actor, deviceId);
      }
      const duplicate = Boolean((result as { duplicate?: boolean } | null)?.duplicate);
      const warning =
        !duplicate && (result as { warning?: string } | null)?.warning
          ? String((result as { warning?: string }).warning)
          : undefined;
      await this.record(mutation, deviceId, actor, clientTime, "APPLIED", toJson(result), undefined, warning);
      return { id: mutation.id, status: duplicate ? "duplicate" : "applied", result };
    } catch (error) {
      const message = describeError(error);
      if (!isPermanentFailure(error)) {
        console.error(`Sync mutation ${mutation.id} (${mutation.type}) failed, will retry:`, error);
        return { id: mutation.id, status: "retry", error: message };
      }
      await this.record(mutation, deviceId, actor, clientTime, "REJECTED", undefined, message);
      return { id: mutation.id, status: "rejected", error: message };
    }
  }

  private async record(
    mutation: SyncMutationInput,
    deviceId: string,
    actor: SyncActor,
    clientTime: Date | null,
    status: "APPLIED" | "REJECTED",
    result?: Prisma.InputJsonValue,
    error?: string,
    warning?: string,
  ) {
    try {
      await prisma.syncMutation.create({
        data: {
          id: mutation.id,
          device_id: deviceId,
          user_id: actor.userId,
          type: mutation.type,
          status,
          result,
          error,
          warning,
          client_time: clientTime && !Number.isNaN(clientTime.getTime()) ? clientTime : null,
        },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
}
