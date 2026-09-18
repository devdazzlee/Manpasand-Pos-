import axios from 'axios';
import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { EmailService } from '../utils/email.service';
import { getAlfalahConfig } from '../config/alfalah';
import { hashAlfalahFields } from '../utils/alfalahHash';

export type AlfalahFormPayload = {
  provider: 'alfalah';
  actionUrl: string;
  method: 'POST';
  fields: Record<string, string>;
};

type OrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: { include: { product: { include: { unit: true } } } };
  };
}> & {
  payment_status: string;
  apg_transaction_id: string | null;
};

type OrderWithProducts = Prisma.OrderGetPayload<{
  include: { items: { include: { product: true } } };
}> & {
  payment_status: string;
  apg_transaction_id: string | null;
};

function orderPaymentUpdate(data: {
  payment_status?: 'PAID' | 'PENDING' | 'FAILED' | 'PARTIAL' | 'OVERDUE';
  apg_transaction_id?: string | null;
  status?: OrderStatus;
}): Prisma.OrderUpdateInput {
  return data as Prisma.OrderUpdateInput;
}

function formatGuestOrder(order: any) {
  const fullName = order.customer_name || '';
  const [firstName, ...lastNameParts] = fullName.trim().split(' ').filter(Boolean);
  return {
    ...order,
    customer: {
      firstName: firstName || '',
      lastName: lastNameParts.join(' ') || '',
      email: order.customer_email || '',
      phone: order.customer_phone || '',
    },
    shipping: {
      address: order.delivery_address || '',
      city: order.delivery_city || '',
      postalCode: order.delivery_postal_code || '',
    },
    orderNotes: order.order_notes || '',
    payment_status: order.payment_status,
  };
}

function formatAmount(amount: number): string {
  return Number(amount).toFixed(2);
}

function parseOrderRefFromApgReturn(input: {
  query: Record<string, unknown>;
  path?: string;
}): string {
  const queryKeys = ['O', 'o', 'order', 'orderId', 'ref', 'TransactionReferenceNumber'];
  for (const key of queryKeys) {
    const value = input.query[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  const rawPath = input.path || '';
  const fromPath = rawPath.match(/(?:^|[/?])O=([^/?&]+)/i);
  if (fromPath?.[1]) return decodeURIComponent(fromPath[1]);

  return '';
}

function parseGatewayPayload(data: unknown): Record<string, any> {
  let payload: unknown = data;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return {};
    }
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, any>;
  }
  return {};
}

function isPaidStatus(status?: string | null): boolean {
  return String(status || '').trim().toLowerCase() === 'paid';
}

function isFailedStatus(status?: string | null): boolean {
  return ['failed', 'unpaid', 'declined', 'cancelled', 'canceled', 'expired'].includes(
    String(status || '').trim().toLowerCase(),
  );
}

class AlfalahService {
  isEnabled() {
    return getAlfalahConfig().enabled;
  }

  getPublicConfig() {
    const config = getAlfalahConfig();
    return {
      enabled: config.enabled,
      env: config.env,
      provider: 'alfalah' as const,
    };
  }

  buildHandshakeForm(orderNumber: string): AlfalahFormPayload {
    const config = this.requireConfig();
    const fieldsWithoutHash = {
      HS_ChannelId: config.channelId,
      HS_MerchantId: config.merchantId,
      HS_StoreId: config.storeId,
      HS_ReturnURL: `${config.websiteUrl}/checkout/alfalah/complete`,
      HS_MerchantHash: config.merchantHash,
      HS_MerchantUsername: config.merchantUsername,
      HS_MerchantPassword: config.merchantPassword,
      HS_TransactionReferenceNumber: orderNumber,
      HS_IsRedirectionRequest: '0',
    };

    return {
      provider: 'alfalah',
      actionUrl: config.handshakeUrl,
      method: 'POST',
      fields: {
        ...fieldsWithoutHash,
        HS_RequestHash: this.hashFields(fieldsWithoutHash, config.key1, config.key2),
      },
    };
  }

  buildSsoForm(orderNumber: string, authToken: string, amount: number): AlfalahFormPayload {
    const config = this.requireConfig();
    const token = authToken.trim();
    if (!token) throw new AppError(400, 'Missing Bank Alfalah auth token');

    const fieldsWithoutHash = {
      AuthToken: token,
      ChannelId: config.channelId,
      Currency: config.currency,
      ReturnURL: `${config.websiteUrl}/checkout/alfalah/complete`,
      MerchantId: config.merchantId,
      StoreId: config.storeId,
      MerchantHash: config.merchantHash,
      MerchantUsername: config.merchantUsername,
      MerchantPassword: config.merchantPassword,
      IsBIN: config.isBin,
      TransactionTypeId: config.cardTransactionTypeId,
      TransactionReferenceNumber: orderNumber,
      TransactionAmount: formatAmount(amount),
    };

    return {
      provider: 'alfalah',
      actionUrl: config.ssoUrl,
      method: 'POST',
      fields: {
        ...fieldsWithoutHash,
        RequestHash: this.hashFields(fieldsWithoutHash, config.key1, config.key2),
      },
    };
  }

  async getSsoFormForOrder(orderNumber: string, authToken: string): Promise<AlfalahFormPayload> {
    const order = await this.findOrderByNumber(orderNumber);
    if (order.payment_method !== 'CARD') {
      throw new AppError(400, 'This order is not a card payment');
    }
    if (order.payment_status === 'PAID') {
      throw new AppError(409, 'This order is already paid');
    }
    return this.buildSsoForm(order.order_number, authToken, Number(order.total_amount));
  }

  async startCardCheckout(orderNumber: string): Promise<AlfalahFormPayload> {
    const order = await this.findOrderByNumber(orderNumber);
    if (order.payment_method !== 'CARD') {
      throw new AppError(400, 'This order is not a card payment');
    }
    if (order.payment_status === 'PAID') {
      throw new AppError(409, 'This order is already paid');
    }

    const handshake = this.buildHandshakeForm(order.order_number);
    const { data } = await axios.post(
      handshake.actionUrl,
      new URLSearchParams(handshake.fields).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 20000,
        validateStatus: () => true,
      },
    );

    let payload: any = data;
    if (typeof data === 'string') {
      try {
        payload = JSON.parse(data);
      } catch {
        payload = {};
      }
    }

    const success = String(payload?.success).toLowerCase() === 'true';
    const authToken = String(payload?.AuthToken || payload?.authToken || '').trim();
    if (!success || !authToken) {
      throw new AppError(502, 'Bank Alfalah handshake failed. Please try card payment again.');
    }

    return this.buildSsoForm(order.order_number, authToken, Number(order.total_amount));
  }

  async inquireAndSettle(orderNumber: string) {
    await this.expireUnpaidCardOrders();
    const config = this.requireConfig();
    const order = await this.findOrderByNumber(orderNumber);

    const { data } = await axios.get(config.ipnOrderStatusUrl(order.order_number), {
      timeout: 20000,
      validateStatus: () => true,
    });

    const gateway = parseGatewayPayload(data);
    const status =
      gateway.TransactionStatus || gateway.transaction_status || gateway.transactionStatus;
    const transactionId =
      gateway.TransactionId || gateway.unique_tran_id || gateway.transaction_id || null;
    const paid = isPaidStatus(status);
    const failed = isFailedStatus(status);

    if (paid) {
      await this.markPaid(order.id, String(transactionId || ''));
    } else if (failed && order.payment_status !== 'PAID') {
      await prisma.order.update({
        where: { id: order.id },
        data: orderPaymentUpdate({ payment_status: 'FAILED' }),
      });
    }

    const fresh = await this.findOrderByNumber(order.order_number);
    return {
      order: formatGuestOrder(fresh),
      transactionStatus: status || (paid ? 'Paid' : 'Failed'),
      paid,
    };
  }

  async handleIpn(statusUrl?: string) {
    if (!statusUrl?.trim()) {
      throw new AppError(400, 'Missing IPN status URL');
    }

    let parsed: URL;
    try {
      parsed = new URL(statusUrl);
    } catch {
      throw new AppError(400, 'Invalid IPN status URL');
    }

    const allowedHosts = new Set(['sandbox.bankalfalah.com', 'payments.bankalfalah.com']);
    if (!allowedHosts.has(parsed.hostname)) {
      throw new AppError(400, 'IPN URL host is not Bank Alfalah');
    }

    const { data } = await axios.get(statusUrl, { timeout: 20000, validateStatus: () => true });
    const gateway = parseGatewayPayload(data);
    const orderNumber =
      gateway.TransactionReferenceNumber ||
      gateway.transaction_reference_number ||
      gateway.order_id;
    if (!orderNumber) {
      throw new AppError(400, 'IPN response did not include an order reference');
    }

    return this.inquireAndSettle(String(orderNumber));
  }

  extractOrderNumber(input: { query: Record<string, unknown>; path?: string }) {
    const ref = parseOrderRefFromApgReturn(input);
    if (!ref) throw new AppError(400, 'Could not find order reference from Bank Alfalah return');
    return ref;
  }

  async expireUnpaidCardOrders() {
    const minutes = getAlfalahConfig().unpaidCardExpiryMinutes;
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    await prisma.order.updateMany({
      where: {
        customer_id: null,
        payment_method: 'CARD',
        payment_status: 'PENDING',
        status: 'PENDING',
        created_at: { lt: cutoff },
      },
      data: {
        status: 'CANCELLED',
        payment_status: 'FAILED',
      },
    });
  }

  private async findOrderByNumber(orderNumber: string): Promise<OrderWithItems> {
    const order = await prisma.order.findFirst({
      where: { order_number: orderNumber, customer_id: null },
      include: {
        items: { include: { product: { include: { unit: true } } } },
      },
    });
    if (!order) throw new AppError(404, 'Order not found');
    return order as OrderWithItems;
  }

  private async markPaid(orderId: string, transactionId: string) {
    const existing = (await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    })) as OrderWithProducts | null;
    if (!existing) throw new AppError(404, 'Order not found');
    if (existing.payment_status === 'PAID') return existing;

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: orderPaymentUpdate({
        payment_status: 'PAID',
        apg_transaction_id: transactionId || existing.apg_transaction_id,
        status: existing.status === 'CANCELLED' ? existing.status : 'PROCESSING',
      }),
      include: { items: { include: { product: { include: { unit: true } } } } },
    });

    const items = existing.items.map((item) => ({
      id: item.product_id,
      productId: item.product_id,
      name: item.display_name || item.product?.name || 'Item',
      price: Number(item.price),
      quantity: Number(item.quantity),
      gramsPerUnit: item.grams_per_unit != null ? Number(item.grams_per_unit) : undefined,
      unitName: item.unit_name || undefined,
    }));

    await this.applyStockUpdatesBestEffort(items, existing.items.map((i) => i.product));

    EmailService.sendOrderConfirmationEmails({
      orderNumber: existing.order_number,
      customerName: existing.customer_name || 'Customer',
      customerEmail: existing.customer_email || '',
      customerPhone: existing.customer_phone || '',
      shippingAddress: {
        address: existing.delivery_address || '',
        city: existing.delivery_city || '',
        postalCode: existing.delivery_postal_code || undefined,
      },
      items: items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
      })),
      subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      shipping: Math.max(0, Number(existing.total_amount) - items.reduce((sum, item) => sum + item.price * item.quantity, 0)),
      total: Number(existing.total_amount),
      paymentMethod: 'card',
      orderNotes: existing.order_notes || undefined,
    }).catch((err) => {
      console.error('Failed to send paid-order confirmation emails:', err);
    });

    return updated;
  }

  private requireConfig() {
    const config = getAlfalahConfig();
    if (!config.enabled) {
      throw new AppError(
        503,
        'Bank Alfalah is not configured. Add merchant credentials and encryption keys to the backend environment.',
      );
    }
    return config;
  }

  private hashFields(fields: Record<string, string>, key1: string, key2: string) {
    try {
      return hashAlfalahFields(fields, key1, key2);
    } catch (err) {
      throw new AppError(500, err instanceof Error ? err.message : 'Failed to sign Alfalah request');
    }
  }

  private async applyStockUpdatesBestEffort(
    items: Array<{ productId?: string; id?: string; quantity: number; name: string }>,
    products: Array<{ id: string; name: string }>,
  ) {
    const productIds = items
      .map((item) => item.productId || item.id)
      .filter((id): id is string => Boolean(id));
    if (productIds.length === 0) return;

    const stockRecords = await prisma.stock.findMany({
      where: { product_id: { in: productIds } },
    });

    for (const item of items) {
      const productId = item.productId || item.id;
      if (!productId) continue;
      const product = products.find((p) => p.id === productId);
      const stock = stockRecords.find((s) => s.product_id === productId);
      if (!stock || !product) continue;

      const qty = new Prisma.Decimal(item.quantity);
      try {
        await prisma.$transaction([
          prisma.stock.update({
            where: {
              product_id_branch_id: {
                product_id: product.id,
                branch_id: stock.branch_id,
              },
            },
            data: { current_quantity: { decrement: qty } },
          }),
          prisma.stockMovement.create({
            data: {
              product: { connect: { id: product.id } },
              branch: { connect: { id: stock.branch_id } },
              movement_type: 'SALE',
              quantity_change: qty.negated(),
              previous_qty: stock.current_quantity,
              new_qty: stock.current_quantity.minus(qty),
            },
          }),
        ]);
      } catch (err) {
        console.warn(
          `Stock update skipped for ${product.name} (${product.id}):`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
}

export const alfalahService = new AlfalahService();
