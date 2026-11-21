/**
 * Offline Database - IndexedDB wrapper for storing POS data locally
 * This allows full functionality when offline
 */

import Dexie, { Table } from 'dexie';

// Define database schema types
export interface Product {
  id: string;
  name: string;
  sku?: string;
  price: number;
  stock?: number;
  category?: string;
  data: any; // Full product data
  lastSync: number;
}

export interface Sale {
  id: string;
  /** Same UUID sent as clientSaleId so server retries are idempotent. */
  clientSaleId?: string;
  products: any[];
  total: number;
  customer?: any;
  payment: any;
  timestamp: number;
  synced: boolean;
  employeeId?: string;
  branchId?: string;
  discountAmount?: number;
  waiveBranchDiscount?: boolean;
  lastError?: string | null;
  syncAttempts?: number;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  data: any;
  lastSync: number;
  /** false = created offline, waiting to POST /customer */
  synced?: boolean;
  /** Original offline id when remapped after sync */
  clientCustomerId?: string;
  lastError?: string | null;
  syncAttempts?: number;
}

export interface HoldSaleLocal {
  id: string;
  clientHoldId: string;
  branchId: string;
  branchName?: string;
  customerId: string | null;
  customer?: any;
  items: any[];
  subtotal: number;
  totalItems: number;
  createdAt: string;
  timestamp: number;
  synced: boolean;
  /** Server row id once uploaded (may equal id for online-created holds). */
  serverId?: string | null;
  /** Offline retrieve/delete of a previously synced server hold. */
  pendingDelete?: boolean;
  lastError?: string | null;
  syncAttempts?: number;
}

export interface PendingRequest {
  id: string;
  url: string;
  method: string;
  body?: any;
  headers?: any;
  timestamp: number;
  retries: number;
  priority: number; // Higher = more important
}

export interface CachedData {
  key: string;
  data: any;
  timestamp: number;
  expiresAt?: number;
}

// Create Dexie database
class OfflineDatabase extends Dexie {
  products!: Table<Product>;
  sales!: Table<Sale>;
  customers!: Table<Customer>;
  holdSales!: Table<HoldSaleLocal>;
  pendingRequests!: Table<PendingRequest>;
  cachedData!: Table<CachedData>;

  constructor() {
    super('ManpasandPOSDB');
    
    this.version(1).stores({
      products: 'id, name, sku, category, lastSync',
      sales: 'id, timestamp, synced, employeeId, branchId',
      customers: 'id, name, email, phone, lastSync',
      pendingRequests: 'id, timestamp, priority, retries',
      cachedData: 'key, timestamp, expiresAt'
    });

    this.version(2).stores({
      products: 'id, name, sku, category, lastSync',
      sales: 'id, timestamp, synced, employeeId, branchId',
      customers: 'id, name, email, phone, lastSync, synced',
      holdSales: 'id, clientHoldId, branchId, timestamp, synced, pendingDelete',
      pendingRequests: 'id, timestamp, priority, retries',
      cachedData: 'key, timestamp, expiresAt',
    });
  }
}

// Create single instance
export const db = new OfflineDatabase();

function isOfflineCustomerId(id?: string | null): boolean {
  return Boolean(id && String(id).startsWith('offline_cust_'));
}

// Database helper functions
export const offlineDB = {
  isOfflineCustomerId,

  // Products
  async saveProducts(products: any[]) {
    if (!Array.isArray(products)) {
      console.warn('saveProducts: products is not an array', products);
      return 0;
    }
    const timestamp = Date.now();
    const productsToStore = products.map(p => ({
      id: p.id || p._id || String(p.product_id),
      name: p.name || p.product_name,
      sku: p.sku,
      price: p.price || p.sale_price || 0,
      stock: p.stock || p.quantity,
      category: p.category?.name || p.category_name,
      data: p,
      lastSync: timestamp
    }));
    await db.products.bulkPut(productsToStore);
    return productsToStore.length;
  },

  /**
   * Full catalog sync: drop stale rows first. `saveProducts` only upserts, so
   * deleted / recreated products otherwise pile up and New Sale search shows
   * the same name twice.
   */
  async replaceProducts(products: any[]) {
    if (!Array.isArray(products)) {
      console.warn('replaceProducts: products is not an array', products);
      return 0;
    }
    await db.transaction('rw', db.products, async () => {
      await db.products.clear();
      await offlineDB.saveProducts(products);
    });
    return products.length;
  },

  async getProducts() {
    return await db.products.toArray();
  },

  async getProduct(id: string) {
    return await db.products.get(id);
  },

  async searchProducts(query: string) {
    const lowerQuery = query.toLowerCase();
    return await db.products
      .filter(p => 
        p.name.toLowerCase().includes(lowerQuery) ||
        p.sku?.toLowerCase().includes(lowerQuery)
      )
      .toArray();
  },

  // Sales
  async saveSale(sale: any) {
    const id = sale.id || sale.clientSaleId || crypto.randomUUID();
    const saleData: Sale = {
      id,
      clientSaleId: sale.clientSaleId || id,
      products: sale.products || sale.items,
      total: sale.total || sale.amount,
      customer: sale.customer,
      payment: sale.payment,
      timestamp: sale.timestamp || Date.now(),
      synced: false,
      employeeId: sale.employeeId || sale.employee_id,
      branchId: sale.branchId || sale.branch_id,
      discountAmount: Number(sale.discountAmount) || 0,
      waiveBranchDiscount: sale.waiveBranchDiscount === true,
      lastError: null,
      syncAttempts: 0,
    };
    await db.sales.put(saleData);
    return saleData;
  },

  async getUnsyncedSales() {
    return await db.sales.where('synced').equals(0).toArray();
  },

  async countUnsyncedSales() {
    return await db.sales.where('synced').equals(0).count();
  },

  async markSaleSynced(id: string) {
    await db.sales.update(id, { synced: true, lastError: null });
  },

  async markSaleSyncFailed(id: string, error: string) {
    const row = await db.sales.get(id);
    await db.sales.update(id, {
      lastError: error.slice(0, 500),
      syncAttempts: (row?.syncAttempts || 0) + 1,
    });
  },

  async getAllSales() {
    return await db.sales.orderBy('timestamp').reverse().toArray();
  },

  async remapCustomerId(tempId: string, realId: string, realCustomer?: any) {
    if (!tempId || !realId || tempId === realId) return;

    await db.transaction('rw', db.customers, db.sales, db.holdSales, async () => {
      const pending = await db.customers.get(tempId);
      if (pending) {
        await db.customers.delete(tempId);
        const payload = realCustomer || { ...pending.data, id: realId };
        await db.customers.put({
          id: realId,
          name: payload.name || pending.name,
          email: payload.email || pending.email,
          phone: payload.phone_number || payload.phone || pending.phone,
          data: { ...payload, id: realId },
          lastSync: Date.now(),
          synced: true,
          clientCustomerId: tempId,
        });
      }

      const sales = await db.sales.toArray();
      for (const sale of sales) {
        if (sale.customer?.id === tempId) {
          await db.sales.update(sale.id, {
            customer: {
              ...sale.customer,
              id: realId,
              ...(realCustomer
                ? {
                    name: realCustomer.name ?? sale.customer.name,
                    phone: realCustomer.phone_number || realCustomer.phone,
                  }
                : {}),
            },
          });
        }
      }

      const holds = await db.holdSales.toArray();
      for (const hold of holds) {
        if (hold.customerId === tempId || hold.customer?.id === tempId) {
          await db.holdSales.update(hold.id, {
            customerId: realId,
            customer: hold.customer
              ? { ...hold.customer, id: realId }
              : { id: realId },
          });
        }
      }
    });
  },

  // Customers
  async saveCustomers(customers: any[]) {
    const timestamp = Date.now();
    const customersToStore = customers.map(c => ({
      id: c.id || c._id || String(c.customer_id),
      name: c.name || c.customer_name,
      email: c.email,
      phone: c.phone || c.phone_number || c.mobile,
      data: c,
      lastSync: timestamp,
      synced: true as boolean,
    }));
    await db.customers.bulkPut(customersToStore);
    return customersToStore.length;
  },

  async savePendingCustomer(payload: {
    name: string;
    phone_number?: string;
    email?: string;
    address?: string;
    default_discount_percent?: number;
    is_active?: boolean;
    [key: string]: unknown;
  }) {
    const id = `offline_cust_${crypto.randomUUID()}`;
    const data = {
      ...payload,
      id,
      phone: payload.phone_number,
      phone_number: payload.phone_number,
      is_active: payload.is_active !== false,
      offlinePending: true,
    };
    const row: Customer = {
      id,
      name: payload.name,
      email: payload.email,
      phone: payload.phone_number,
      data,
      lastSync: Date.now(),
      synced: false,
      clientCustomerId: id,
      lastError: null,
      syncAttempts: 0,
    };
    await db.customers.put(row);
    return data;
  },

  async getUnsyncedCustomers() {
    return await db.customers.filter((c) => c.synced === false).toArray();
  },

  async countUnsyncedCustomers() {
    return await db.customers.filter((c) => c.synced === false).count();
  },

  async markCustomerSyncFailed(id: string, error: string) {
    const row = await db.customers.get(id);
    await db.customers.update(id, {
      lastError: error.slice(0, 500),
      syncAttempts: (row?.syncAttempts || 0) + 1,
    });
  },

  async getCustomers() {
    return await db.customers.toArray();
  },

  async getCustomer(id: string) {
    return await db.customers.get(id);
  },

  async searchCustomers(query: string, limit = 20) {
    const lowerQuery = (query || '').toLowerCase().trim();
    const all = await db.customers.toArray();
    const filtered = !lowerQuery
      ? all
      : all.filter(
          (c) =>
            c.name?.toLowerCase().includes(lowerQuery) ||
            c.email?.toLowerCase().includes(lowerQuery) ||
            c.phone?.includes(query) ||
            String(c.data?.phone_number || '').includes(query),
        );
    // Prefer pending (just-created) then recent
    filtered.sort((a, b) => {
      const aPending = a.synced === false ? 1 : 0;
      const bPending = b.synced === false ? 1 : 0;
      if (aPending !== bPending) return bPending - aPending;
      return (b.lastSync || 0) - (a.lastSync || 0);
    });
    return filtered.slice(0, limit);
  },

  // Hold sales
  async saveHoldSale(hold: {
    id?: string;
    clientHoldId?: string;
    branchId: string;
    branchName?: string;
    customerId?: string | null;
    customer?: any;
    items: any[];
    subtotal?: number;
    totalItems?: number;
    createdAt?: string;
    synced?: boolean;
    serverId?: string | null;
  }) {
    const clientHoldId = hold.clientHoldId || hold.id || crypto.randomUUID();
    const items = Array.isArray(hold.items) ? hold.items : [];
    const subtotal =
      hold.subtotal ??
      items.reduce(
        (sum, item) =>
          sum + Number(item.actualUnitPrice ?? item.price ?? 0) * Number(item.quantity || 0),
        0,
      );
    const row: HoldSaleLocal = {
      id: hold.id || clientHoldId,
      clientHoldId,
      branchId: hold.branchId,
      branchName: hold.branchName,
      customerId: hold.customerId || null,
      customer: hold.customer || null,
      items,
      subtotal,
      totalItems: hold.totalItems ?? items.length,
      createdAt: hold.createdAt || new Date().toISOString(),
      timestamp: Date.now(),
      synced: hold.synced === true,
      serverId: hold.serverId ?? (hold.synced ? hold.id || clientHoldId : null),
      pendingDelete: false,
      lastError: null,
      syncAttempts: 0,
    };
    await db.holdSales.put(row);
    return row;
  },

  async getHoldSalesForBranch(branchId: string) {
    const rows = await db.holdSales
      .where('branchId')
      .equals(branchId)
      .filter((h) => !h.pendingDelete)
      .toArray();
    rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return rows;
  },

  async getUnsyncedHoldSales() {
    return await db.holdSales
      .filter((h) => h.synced === false && !h.pendingDelete)
      .toArray();
  },

  async getPendingDeleteHoldSales() {
    return await db.holdSales.filter((h) => h.pendingDelete === true).toArray();
  },

  async countUnsyncedHolds() {
    const [unsynced, pendingDelete] = await Promise.all([
      db.holdSales.filter((h) => h.synced === false && !h.pendingDelete).count(),
      db.holdSales.filter((h) => h.pendingDelete === true).count(),
    ]);
    return unsynced + pendingDelete;
  },

  async markHoldSynced(localId: string, serverHold: any) {
    const existing = await db.holdSales.get(localId);
    if (!existing) return;
    const serverId = String(serverHold?.id || existing.serverId || localId);
    const customer = serverHold?.customer
      ? {
          id: String(serverHold.customer.id),
          name: serverHold.customer.name ?? null,
          email: serverHold.customer.email ?? null,
          phone_number:
            serverHold.customer.phone_number ?? serverHold.customer.phone ?? null,
          phone: serverHold.customer.phone ?? serverHold.customer.phone_number ?? null,
          is_active: serverHold.customer.is_active,
        }
      : existing.customer;
    const customerId =
      serverHold?.customer_id ||
      serverHold?.customerId ||
      customer?.id ||
      existing.customerId ||
      null;

    await db.transaction('rw', db.holdSales, async () => {
      if (serverId !== localId) {
        await db.holdSales.delete(localId);
      }
      await db.holdSales.put({
        ...existing,
        id: serverId,
        clientHoldId: existing.clientHoldId,
        serverId,
        synced: true,
        pendingDelete: false,
        lastError: null,
        customer,
        customerId: customerId ? String(customerId) : null,
        subtotal: Number(serverHold?.subtotal ?? existing.subtotal),
        totalItems: Number(
          serverHold?.total_items ?? serverHold?.totalItems ?? existing.totalItems,
        ),
        createdAt:
          serverHold?.created_at ||
          serverHold?.createdAt ||
          existing.createdAt,
        branchName: serverHold?.branch?.name || existing.branchName,
      });
    });
  },

  async markHoldSyncFailed(id: string, error: string) {
    const row = await db.holdSales.get(id);
    await db.holdSales.update(id, {
      lastError: error.slice(0, 500),
      syncAttempts: (row?.syncAttempts || 0) + 1,
    });
  },

  async deleteHoldSaleLocal(id: string) {
    await db.holdSales.delete(id);
  },

  async markHoldPendingDelete(id: string) {
    const row = await db.holdSales.get(id);
    if (!row) return;
    if (!row.synced && !row.serverId) {
      await db.holdSales.delete(id);
      return;
    }
    await db.holdSales.update(id, { pendingDelete: true });
  },

  /**
   * Replace cached server holds for a branch while keeping unsynced / pending-delete rows.
   */
  async replaceSyncedHoldSales(branchId: string, serverHolds: any[]) {
    await db.transaction('rw', db.holdSales, async () => {
      const existing = await db.holdSales.where('branchId').equals(branchId).toArray();
      for (const row of existing) {
        if (row.synced === true && !row.pendingDelete) {
          await db.holdSales.delete(row.id);
        }
      }

      const timestamp = Date.now();
      for (const hold of serverHolds) {
        const id = String(hold.id);
        const customer = hold.customer
          ? {
              id: String(hold.customer.id),
              name: hold.customer.name ?? null,
              email: hold.customer.email ?? null,
              phone_number: hold.customer.phone_number ?? hold.customer.phone ?? null,
              phone: hold.customer.phone ?? hold.customer.phone_number ?? null,
              is_active: hold.customer.is_active,
            }
          : null;
        const customerId =
          hold.customer_id || hold.customerId || customer?.id || null;
        await db.holdSales.put({
          id,
          clientHoldId: hold.client_hold_id || hold.clientHoldId || id,
          branchId,
          branchName: hold.branch?.name || 'Unknown Branch',
          customerId: customerId ? String(customerId) : null,
          customer,
          items: Array.isArray(hold.items) ? hold.items : [],
          subtotal: Number(hold.subtotal || 0),
          totalItems: Number(hold.total_items || hold.totalItems || 0),
          createdAt: hold.created_at || hold.createdAt || new Date().toISOString(),
          timestamp: hold.created_at ? new Date(hold.created_at).getTime() : timestamp,
          synced: true,
          serverId: id,
          pendingDelete: false,
        });
      }
    });
  },

  // Pending Requests Queue
  async queueRequest(request: {
    url: string;
    method: string;
    body?: any;
    headers?: any;
    priority?: number;
  }) {
    const pendingRequest: PendingRequest = {
      id: `req_${Date.now()}_${Math.random()}`,
      url: request.url,
      method: request.method,
      body: request.body,
      headers: request.headers,
      timestamp: Date.now(),
      retries: 0,
      priority: request.priority || 5
    };
    await db.pendingRequests.put(pendingRequest);
    return pendingRequest;
  },

  async getPendingRequests() {
    return await db.pendingRequests
      .orderBy('priority')
      .reverse()
      .toArray();
  },

  async removePendingRequest(id: string) {
    await db.pendingRequests.delete(id);
  },

  async incrementRetries(id: string) {
    const request = await db.pendingRequests.get(id);
    if (request) {
      await db.pendingRequests.update(id, { retries: request.retries + 1 });
    }
  },

  // Cached Data
  async setCachedData(key: string, data: any, ttl?: number) {
    const cachedData: CachedData = {
      key,
      data,
      timestamp: Date.now(),
      expiresAt: ttl ? Date.now() + ttl : undefined
    };
    await db.cachedData.put(cachedData);
  },

  async getCachedData(key: string) {
    const cached = await db.cachedData.get(key);
    if (!cached) return null;
    
    // Check if expired
    if (cached.expiresAt && cached.expiresAt < Date.now()) {
      await db.cachedData.delete(key);
      return null;
    }
    
    return cached.data;
  },

  async clearExpiredCache() {
    const now = Date.now();
    await db.cachedData
      .filter(item => item.expiresAt !== undefined && item.expiresAt < now)
      .delete();
  },

  // Database management
  async clearAll() {
    await Promise.all([
      db.products.clear(),
      db.sales.clear(),
      db.customers.clear(),
      db.holdSales.clear(),
      db.pendingRequests.clear(),
      db.cachedData.clear()
    ]);
  },

  async getStats() {
    const [
      products,
      sales,
      customers,
      pending,
      cached,
      unsyncedSales,
      unsyncedCustomers,
      unsyncedHolds,
    ] = await Promise.all([
      db.products.count(),
      db.sales.count(),
      db.customers.count(),
      db.pendingRequests.count(),
      db.cachedData.count(),
      db.sales.where('synced').equals(0).count(),
      offlineDB.countUnsyncedCustomers(),
      offlineDB.countUnsyncedHolds(),
    ]);
    
    return {
      products,
      sales,
      customers,
      pendingRequests: pending,
      cachedData: cached,
      unsyncedSales,
      unsyncedCustomers,
      unsyncedHolds,
    };
  }
};

export default offlineDB;
