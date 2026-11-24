import { z } from "zod";
import { createSaleSchema } from "./sale.validation";

const MAX_BATCH = 50;

const mutationSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1).max(64),
  payload: z.record(z.any()),
  createdAt: z.string().datetime().optional(),
  recordedBy: z
    .object({ userId: z.string().max(64), email: z.string().max(200).optional() })
    .optional(),
});

const syncPushSchema = z.object({
  body: z.object({
    deviceId: z.string().min(1).max(64),
    mutations: z.array(mutationSchema).min(1).max(MAX_BATCH),
  }),
});

const recordedOffline = z.boolean().optional();

/** Body of a `sale.create` mutation — same shape as POST /sale, plus till fields. */
const saleCreatePayloadSchema = createSaleSchema.shape.body.extend({
  clientId: z.string().uuid(),
  saleNumber: z.string().max(40),
  saleDate: z.string().datetime().optional(),
  branchId: z.string().optional(),
  recordedOffline,
});

const optionalText = z.string().max(500).nullish();

const customerCreatePayloadSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(200).nullish(),
  email: z.string().email().nullish().or(z.literal("")),
  phone_number: optionalText,
  address: optionalText,
  billing_address: optionalText,
  credit_limit: z.number().nonnegative().optional(),
  recordedOffline,
});

const holdSaleCreatePayloadSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().nullish(),
  items: z.array(z.record(z.any())).min(1),
  branchId: z.string().optional(),
});

const holdSaleDeletePayloadSchema = z.object({
  id: z.string().min(1),
});

export type SyncMutationInput = z.infer<typeof mutationSchema>;

export {
  syncPushSchema,
  saleCreatePayloadSchema,
  customerCreatePayloadSchema,
  holdSaleCreatePayloadSchema,
  holdSaleDeletePayloadSchema,
};
